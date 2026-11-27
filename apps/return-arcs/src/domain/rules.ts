import type {
  Category,
  Disposition,
  DispositionPolicy,
  Grade,
  ReturnCase,
  ReturnReason,
  ReturnerStat,
} from '../model';
import {
  DAMAGE_FEE_PCT,
  DONATE_HANDLING_FACTOR,
  GRADING_SLA_HOURS,
  HOLIDAY_ORDER_CUTOFF_DAY,
  HOLIDAY_ORDER_CUTOFF_MONTH,
  HOLIDAY_WINDOW_END_DAY,
  HOLIDAY_WINDOW_END_MONTH,
  HOLIDAY_WINDOW_START_DAY,
  HOLIDAY_WINDOW_START_MONTH,
  LEAD_REFUND_OVER,
  LIQUIDATE_COST_RATE,
  REFURBISH_RECOVERY_RATE,
  RESTOCK_RECOVERY_RATE,
  RETURNLESS_RATIO,
  SERIAL_MIN_BRACKETED_SIZES,
  SERIAL_MIN_RETURNS,
  SERIAL_RATE,
  STANDARD_WINDOW_DAYS,
} from './config';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ Rule 1: Window */

export interface WindowResult {
  inWindow: boolean;
  isHolidayOrder: boolean;
  deadline: string; // ISO date
  daysSinceOrder: number;
  needsLeadException: boolean;
}

/**
 * Rule 1 — Return window.
 * A return is in window if it arrives within STANDARD_WINDOW_DAYS (30) of order,
 * or, for orders placed between Nov 1 and Dec 24 (inclusive), by Jan 31 of the following year.
 * Outside the window, the return is late and needs a lead exception.
 */
export function evaluateWindow(orderedAtIso: string, returnAtIso: string): WindowResult {
  const ordered = new Date(orderedAtIso);
  const returned = new Date(returnAtIso);

  const oYear = ordered.getUTCFullYear();
  const oMonth = ordered.getUTCMonth() + 1;
  const oDay = ordered.getUTCDate();

  const isHolidayOrder =
    (oMonth === HOLIDAY_WINDOW_START_MONTH && oDay >= HOLIDAY_WINDOW_START_DAY) ||
    (oMonth === HOLIDAY_ORDER_CUTOFF_MONTH && oDay <= HOLIDAY_ORDER_CUTOFF_DAY);

  const standardDeadline = new Date(
    Date.UTC(oYear, ordered.getUTCMonth(), oDay + STANDARD_WINDOW_DAYS, 23, 59, 59, 999),
  );
  const holidayDeadline = new Date(
    Date.UTC(oYear + 1, HOLIDAY_WINDOW_END_MONTH - 1, HOLIDAY_WINDOW_END_DAY, 23, 59, 59, 999),
  );

  const effectiveDeadline =
    isHolidayOrder && holidayDeadline.getTime() > standardDeadline.getTime() ? holidayDeadline : standardDeadline;

  const daysSinceOrder = Math.max(0, Math.floor((returned.getTime() - ordered.getTime()) / MS_PER_DAY));
  const inWindow = returned.getTime() <= effectiveDeadline.getTime();

  return {
    inWindow,
    isHolidayOrder,
    deadline: effectiveDeadline.toISOString(),
    daysSinceOrder,
    needsLeadException: !inWindow,
  };
}

/* ------------------------------------------------------------------ Rule 2: Disposition value ladder */

export type BayDisposition = Exclude<Disposition, 'returnless'>;

export interface DispositionOption {
  disposition: BayDisposition;
  eligible: boolean;
  value: number; // per-unit net recovery value (can be negative)
  totalValue: number; // value * units
  formula: string;
  ineligibleReason: string | null;
}

export interface DispositionLadderResult {
  best: DispositionOption;
  ladder: DispositionOption[]; // sorted eligible-first by value desc, then ineligible
}

export function findPolicy(
  policies: readonly DispositionPolicy[],
  category: Category,
  grade: Grade,
): DispositionPolicy | undefined {
  return policies.find((p) => p.category === category && p.grade === grade);
}

/**
 * Rule 2 — Value of each disposition and bestDisposition().
 * - restock (grade A only): price * 0.97 - handling
 * - open_box (grades A, B, C): price * resaleRate(B) - handling
 * - refurbish (electronics + reason defective, grades B/C/D): price * 0.85 - refurbCost - handling
 * - liquidate: unitCost * 0.25 - handling
 * - donate: -handling * 0.5
 * - scrap: -disposalFee
 * Grades C and D can NEVER restock.
 */
export function bestDisposition(
  item: Pick<ReturnCase, 'category' | 'reason' | 'unitPrice' | 'unitCost' | 'units'>,
  grade: Grade,
  policies: readonly DispositionPolicy[],
): DispositionLadderResult {
  const gradePolicy = findPolicy(policies, item.category, grade) ?? {
    id: 'fallback',
    category: item.category,
    grade,
    resaleRate: grade === 'A' ? 0.97 : grade === 'B' ? 0.72 : grade === 'C' ? 0.42 : 0.1,
    handlingCost: 6,
    refurbCost: 18,
    disposalFee: 4,
    returnShipping: 5.5,
  };
  const gradeBPolicy = findPolicy(policies, item.category, 'B') ?? gradePolicy;

  const price = item.unitPrice;
  const cost = item.unitCost;
  const units = Math.max(1, item.units);
  const handling = gradePolicy.handlingCost;
  const refurbCost = gradePolicy.refurbCost;
  const disposalFee = gradePolicy.disposalFee;

  const restockEligible = grade === 'A';
  const restockVal = round2(price * RESTOCK_RECOVERY_RATE - handling);

  const openBoxEligible = grade !== 'D';
  const openBoxRate = grade === 'C' ? Math.min(gradeBPolicy.resaleRate, gradePolicy.resaleRate) : gradeBPolicy.resaleRate;
  const openBoxVal = round2(price * openBoxRate - handling);

  const refurbEligible = item.category === 'electronics' && item.reason === 'defective' && grade !== 'A';
  const refurbVal = round2(price * REFURBISH_RECOVERY_RATE - refurbCost - handling);

  const liquidateVal = round2(cost * LIQUIDATE_COST_RATE - handling);
  const donateVal = round2(-handling * DONATE_HANDLING_FACTOR);
  const scrapVal = round2(-disposalFee);

  const options: DispositionOption[] = [
    {
      disposition: 'restock',
      eligible: restockEligible,
      value: restockVal,
      totalValue: round2(restockVal * units),
      formula: `$${price.toFixed(2)} × ${RESTOCK_RECOVERY_RATE} − $${handling.toFixed(2)}`,
      ineligibleReason: restockEligible
        ? null
        : grade === 'C' || grade === 'D'
          ? `Grade ${grade} can never restock (Rule 2: only Grade A returns to shelf)`
          : 'Only Grade A items can restock directly',
    },
    {
      disposition: 'open_box',
      eligible: openBoxEligible,
      value: openBoxVal,
      totalValue: round2(openBoxVal * units),
      formula: `$${price.toFixed(2)} × ${openBoxRate.toFixed(2)} − $${handling.toFixed(2)}`,
      ineligibleReason: openBoxEligible ? null : 'Grade D items are unsaleable as open-box',
    },
    {
      disposition: 'refurbish',
      eligible: refurbEligible,
      value: refurbVal,
      totalValue: round2(refurbVal * units),
      formula: `$${price.toFixed(2)} × ${REFURBISH_RECOVERY_RATE} − $${refurbCost.toFixed(2)} − $${handling.toFixed(2)}`,
      ineligibleReason: refurbEligible
        ? null
        : item.category !== 'electronics'
          ? 'Refurbish applies to electronics only'
          : item.reason !== 'defective'
            ? 'Refurbish requires a defective return reason'
            : 'Grade A needs no refurbishment',
    },
    {
      disposition: 'liquidate',
      eligible: true,
      value: liquidateVal,
      totalValue: round2(liquidateVal * units),
      formula: `$${cost.toFixed(2)} × ${LIQUIDATE_COST_RATE} − $${handling.toFixed(2)}`,
      ineligibleReason: null,
    },
    {
      disposition: 'donate',
      eligible: true,
      value: donateVal,
      totalValue: round2(donateVal * units),
      formula: `−$${handling.toFixed(2)} × ${DONATE_HANDLING_FACTOR}`,
      ineligibleReason: null,
    },
    {
      disposition: 'scrap',
      eligible: true,
      value: scrapVal,
      totalValue: round2(scrapVal * units),
      formula: `−$${disposalFee.toFixed(2)} disposal`,
      ineligibleReason: null,
    },
  ];

  const ladder = [...options].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.value - a.value;
  });

  return { best: ladder[0], ladder };
}

/* ------------------------------------------------------------------ Rule 3: Returnless refund */

export interface ReturnlessEvaluation {
  eligible: boolean;
  totalReturnCost: number;
  threshold: number;
  savings: number;
}

/**
 * Rule 3 — Returnless refund.
 * At request time, if handling + returnShipping > unitPrice * RETURNLESS_RATIO (0.5),
 * offer a refund without shipping the item back and record disposition = 'returnless'.
 */
export function evaluateReturnless(
  unitPrice: number,
  handlingCost: number,
  returnShipping: number,
): ReturnlessEvaluation {
  const totalReturnCost = round2(handlingCost + returnShipping);
  const threshold = round2(unitPrice * RETURNLESS_RATIO);
  const eligible = totalReturnCost > threshold;
  return {
    eligible,
    totalReturnCost,
    threshold,
    savings: round2(totalReturnCost),
  };
}

/* ------------------------------------------------------------------ Rule 4: Serial returners */

export interface SerialReturnerResult {
  flagged: boolean;
  rate: number; // 0..1
  ratePct: number; // 0..100 rounded
  reason: 'rate' | 'bracketing' | 'both' | null;
  summary: string;
}

/**
 * Rule 4 — Serial returners.
 * Flagged if (returns12m / orders12m >= 0.4 AND returns12m >= 5) OR sizesBracketed >= 2.
 * Shown to the grader for awareness — never auto-denies.
 */
export function evaluateSerialReturner(stat: Pick<ReturnerStat, 'orders12m' | 'returns12m' | 'sizesBracketed'>): SerialReturnerResult {
  const rate = stat.orders12m > 0 ? stat.returns12m / stat.orders12m : 0;
  const ratePct = Math.round(rate * 100);
  const rateFlag = stat.returns12m >= SERIAL_MIN_RETURNS && rate >= SERIAL_RATE;
  const bracketFlag = stat.sizesBracketed >= SERIAL_MIN_BRACKETED_SIZES;
  const flagged = rateFlag || bracketFlag;

  const reason: SerialReturnerResult['reason'] =
    rateFlag && bracketFlag ? 'both' : rateFlag ? 'rate' : bracketFlag ? 'bracketing' : null;

  let summary = `${ratePct}% return rate (${stat.returns12m}/${stat.orders12m})`;
  if (reason === 'both') summary = `${ratePct}% rate (${stat.returns12m}/${stat.orders12m}) & ${stat.sizesBracketed} sizes bracketed`;
  else if (reason === 'bracketing') summary = `${stat.sizesBracketed} sizes bracketed (${ratePct}% rate)`;

  return { flagged, rate, ratePct, reason, summary };
}

/* ------------------------------------------------------------------ Rule 5: Refunds & lead approval */

export interface RefundCalculation {
  grossPrice: number;
  damageFee: number;
  refundAmount: number;
  needsLeadApproval: boolean;
  damageFeeApplied: boolean;
}

/**
 * Rule 5 — Refunds.
 * Refund = unitPrice * units, less DAMAGE_FEE_PCT (15%) when grade is C or D
 * and reason is NOT defective. Any refund over LEAD_REFUND_OVER ($500) needs the lead.
 */
export function calculateRefund(
  unitPrice: number,
  units: number,
  grade: Grade | null,
  reason: ReturnReason,
): RefundCalculation {
  const grossPrice = round2(unitPrice * Math.max(1, units));
  const damageFeeApplied = (grade === 'C' || grade === 'D') && reason !== 'defective';
  const damageFee = damageFeeApplied ? round2((grossPrice * DAMAGE_FEE_PCT) / 100) : 0;
  const refundAmount = round2(grossPrice - damageFee);
  const needsLeadApproval = refundAmount > LEAD_REFUND_OVER;

  return {
    grossPrice,
    damageFee,
    refundAmount,
    needsLeadApproval,
    damageFeeApplied,
  };
}

/* ------------------------------------------------------------------ Operational helpers */

export function hoursSince(iso: string | null, now: Date): number {
  if (!iso) return 0;
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / MS_PER_HOUR);
}

export function daysSince(iso: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / MS_PER_DAY);
}

export function isOverdueGrading(item: Pick<ReturnCase, 'status' | 'receivedAt'>, now: Date): boolean {
  if (item.status !== 'received' || !item.receivedAt) return false;
  return hoursSince(item.receivedAt, now) > GRADING_SLA_HOURS;
}

export function needsLeadSignOff(item: Pick<ReturnCase, 'refundAmount' | 'refundApproved' | 'disposition' | 'reason' | 'status'>): boolean {
  if (item.refundApproved) return false;
  if (item.status === 'closed') return false;
  if (item.refundAmount > LEAD_REFUND_OVER) return true;
  if (item.reason === 'late') return true;
  if (item.disposition === 'scrap' || item.disposition === 'donate') return true;
  return false;
}
