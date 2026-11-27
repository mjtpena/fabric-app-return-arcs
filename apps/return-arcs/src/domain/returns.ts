import { PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';

import {
  limits,
  type Category,
  type Disposition,
  type DispositionPolicy,
  type Grade,
  type Origin,
  type ReturnCase,
  type ReturnReason,
  type ReturnerStat,
  type Schema,
} from '../model';
import { LEAD_REFUND_OVER } from './config';
import {
  bestDisposition,
  calculateRefund,
  evaluateReturnless,
  evaluateSerialReturner,
  evaluateWindow,
  findPolicy,
  isOverdueGrading,
  needsLeadSignOff,
  type BayDisposition,
  type DispositionLadderResult,
  type ReturnlessEvaluation,
  type SerialReturnerResult,
} from './rules';

export interface WorkspaceData {
  cases: ReturnCase[];
  policies: DispositionPolicy[];
  returners: ReturnerStat[];
  now: Date;
}

export async function loadWorkspace(store: DataStore<Schema>, now: Date = new Date()): Promise<WorkspaceData> {
  const [cases, policies, returners] = await Promise.all([
    store.repo('ReturnCase').list(),
    store.repo('DispositionPolicy').list(),
    store.repo('ReturnerStat').list(),
  ]);
  cases.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  return { cases, policies, returners, now };
}

export interface CreateReturnInput {
  rmaNo: string;
  sku: string;
  productName: string;
  category: Category;
  orderedAt: string;
  requestedAt?: string;
  customerRef: string;
  reason: ReturnReason;
  unitPrice: number;
  unitCost: number;
  units: number;
  origin: Origin;
  acceptReturnless?: boolean;
  notes?: string;
}

export interface CreateReturnResult {
  record: ReturnCase;
  returnless: ReturnlessEvaluation;
  wasLate: boolean;
}

/**
 * Log a new return request at the Dock.
 * Applies Rule 1 (holiday/standard window -> forces reason='late' if outside window)
 * and Rule 3 (returnless refund offer if handling + returnShipping > unitPrice * 0.5).
 */
export async function createReturnRequest(
  store: DataStore<Schema>,
  _actor: Person,
  input: CreateReturnInput,
  now: Date = new Date(),
): Promise<CreateReturnResult> {
  const rmaNo = input.rmaNo.trim().toUpperCase();
  const sku = input.sku.trim().toUpperCase();
  const productName = input.productName.trim();
  const customerRef = input.customerRef.trim().toUpperCase();

  if (rmaNo.length < limits.rmaNo.min || rmaNo.length > limits.rmaNo.max) {
    throw new RuleError(`RMA number must be ${limits.rmaNo.min}–${limits.rmaNo.max} characters.`);
  }
  if (sku.length < limits.sku.min || sku.length > limits.sku.max) {
    throw new RuleError(`SKU must be ${limits.sku.min}–${limits.sku.max} characters.`);
  }
  if (productName.length < limits.productName.min || productName.length > limits.productName.max) {
    throw new RuleError(`Product name must be ${limits.productName.min}–${limits.productName.max} characters.`);
  }
  if (customerRef.length < limits.customerRef.min || customerRef.length > limits.customerRef.max) {
    throw new RuleError(`Customer reference must be ${limits.customerRef.min}–${limits.customerRef.max} characters.`);
  }
  if (input.unitPrice <= 0 || input.unitCost < 0 || input.units < 1) {
    throw new RuleError('Unit price must be positive and units at least 1.');
  }

  const existing = await store.repo('ReturnCase').list();
  if (existing.some((c) => c.rmaNo.toUpperCase() === rmaNo)) {
    throw new RuleError(`RMA ${rmaNo} already exists.`);
  }

  const requestedAt = input.requestedAt ?? now.toISOString();
  const win = evaluateWindow(input.orderedAt, requestedAt);
  const effectiveReason: ReturnReason = win.inWindow ? input.reason : 'late';

  const policies = await store.repo('DispositionPolicy').list();
  const refPolicy = findPolicy(policies, input.category, 'B') ?? findPolicy(policies, input.category, 'A');
  const handling = refPolicy?.handlingCost ?? 6;
  const shipping = refPolicy?.returnShipping ?? 5.5;
  const returnless = evaluateReturnless(input.unitPrice, handling, shipping);

  const refundCalc = calculateRefund(input.unitPrice, input.units, null, effectiveReason);
  const isReturnless = returnless.eligible && Boolean(input.acceptReturnless) && win.inWindow;

  const record = await store.repo('ReturnCase').create({
    rmaNo,
    sku,
    productName,
    category: input.category,
    orderedAt: input.orderedAt,
    requestedAt,
    receivedAt: null,
    customerRef,
    reason: effectiveReason,
    unitPrice: input.unitPrice,
    unitCost: input.unitCost,
    units: Math.round(input.units),
    origin: input.origin,
    status: isReturnless ? 'closed' : 'requested',
    grade: null,
    disposition: isReturnless ? 'returnless' : null,
    overrideReason: null,
    refundAmount: refundCalc.refundAmount,
    refundApproved: isReturnless && !refundCalc.needsLeadApproval,
    approvedBySub: null,
    approvedByName: null,
    graderSub: null,
    graderName: null,
    notes: input.notes?.trim() ? input.notes.trim().slice(0, limits.notes.max) : null,
  });

  return { record, returnless, wasLate: !win.inWindow };
}

/**
 * Mark a requested return as received at the Returns Dock by RMA number.
 */
export async function receiveAtDock(
  store: DataStore<Schema>,
  actor: Person,
  rmaNo: string,
  now: Date = new Date(),
): Promise<ReturnCase> {
  const clean = rmaNo.trim().toUpperCase();
  const all = await store.repo('ReturnCase').list();
  const target = all.find((c) => c.rmaNo.toUpperCase() === clean);
  if (!target) throw new RuleError(`No return found for RMA ${clean}.`);
  if (target.status !== 'requested') {
    throw new RuleError(`RMA ${clean} is already ${target.status}.`);
  }

  const win = evaluateWindow(target.orderedAt, now.toISOString());
  const reason: ReturnReason = win.inWindow ? target.reason : 'late';

  return store.repo('ReturnCase').update(target.id, {
    status: 'received',
    receivedAt: now.toISOString(),
    reason,
    graderSub: target.graderSub ?? actor.sub,
    graderName: target.graderName ?? actor.displayName,
  });
}

/**
 * Offer & apply a returnless refund to a requested case when Rule 3 qualifies.
 */
export async function issueReturnlessRefund(
  store: DataStore<Schema>,
  actor: Person,
  caseId: string,
): Promise<ReturnCase> {
  const target = await store.repo('ReturnCase').get(caseId);
  if (!target) throw new RuleError('Return case not found.');
  if (target.status !== 'requested') {
    throw new RuleError('Returnless refunds can only be issued before physical receipt.');
  }
  const policies = await store.repo('DispositionPolicy').list();
  const policy = findPolicy(policies, target.category, 'B') ?? findPolicy(policies, target.category, 'A');
  const check = evaluateReturnless(target.unitPrice, policy?.handlingCost ?? 6, policy?.returnShipping ?? 5.5);
  if (!check.eligible) {
    throw new RuleError('This item does not qualify for a returnless refund under Rule 3.');
  }

  const refundCalc = calculateRefund(target.unitPrice, target.units, null, target.reason);
  return store.repo('ReturnCase').update(target.id, {
    disposition: 'returnless',
    status: refundCalc.needsLeadApproval ? 'routed' : 'closed',
    refundAmount: refundCalc.refundAmount,
    refundApproved: !refundCalc.needsLeadApproval,
    graderSub: actor.sub,
    graderName: actor.displayName,
  });
}

/**
 * Grade a received return at the Grading Bench.
 * Claims the case for the grader, computes Rule 2 ladder and Rule 5 refund.
 */
export async function gradeReturn(
  store: DataStore<Schema>,
  actor: Person,
  caseId: string,
  grade: Grade,
  notes: string,
): Promise<{ record: ReturnCase; ladder: DispositionLadderResult }> {
  const target = await store.repo('ReturnCase').get(caseId);
  if (!target) throw new RuleError('Return case not found.');
  if (target.status !== 'received' && target.status !== 'graded') {
    throw new RuleError(`Cannot grade a return in "${target.status}" status.`);
  }
  if (target.graderSub && target.graderSub !== actor.sub && !actor.isAdmin) {
    throw new PermissionError(`This return is claimed by ${target.graderName ?? 'another grader'}.`);
  }

  const policies = await store.repo('DispositionPolicy').list();
  const ladder = bestDisposition(target, grade, policies);
  const refundCalc = calculateRefund(target.unitPrice, target.units, grade, target.reason);

  const record = await store.repo('ReturnCase').update(target.id, {
    grade,
    status: 'graded',
    refundAmount: refundCalc.refundAmount,
    refundApproved: false,
    graderSub: actor.sub,
    graderName: actor.displayName,
    notes: notes.trim() ? notes.trim().slice(0, limits.notes.max) : target.notes,
  });

  return { record, ladder };
}

/**
 * Route a graded return to a disposition bay at the Fork.
 * Enforces Rule 2: grades C and D can NEVER be routed to restock; ineligible bays are rejected.
 * Overrides away from bestDisposition() require a reason of 10+ characters.
 */
export async function routeDisposition(
  store: DataStore<Schema>,
  actor: Person,
  caseId: string,
  disposition: BayDisposition,
  overrideReason?: string,
): Promise<ReturnCase> {
  const target = await store.repo('ReturnCase').get(caseId);
  if (!target) throw new RuleError('Return case not found.');
  if (!target.grade) throw new RuleError('Grade this return before routing it to a bay.');
  if (target.graderSub && target.graderSub !== actor.sub && !actor.isAdmin) {
    throw new PermissionError(`Only ${target.graderName ?? 'the assigned grader'} or the returns lead can route this return.`);
  }

  const policies = await store.repo('DispositionPolicy').list();
  const ladder = bestDisposition(target, target.grade, policies);
  const chosen = ladder.ladder.find((opt) => opt.disposition === disposition);
  if (!chosen || !chosen.eligible) {
    throw new RuleError(chosen?.ineligibleReason ?? `Disposition "${disposition}" is not eligible for grade ${target.grade}.`);
  }

  const isOverride = disposition !== ladder.best.disposition;
  const cleanReason = overrideReason?.trim() ?? '';
  if (isOverride && cleanReason.length < limits.overrideReason.min) {
    throw new RuleError(`Overriding the recommended bay (${ladder.best.disposition}) requires a reason of at least ${limits.overrideReason.min} characters.`);
  }

  const needsLead =
    target.refundAmount > LEAD_REFUND_OVER ||
    target.reason === 'late' ||
    disposition === 'scrap' ||
    disposition === 'donate';

  return store.repo('ReturnCase').update(target.id, {
    disposition,
    overrideReason: isOverride ? cleanReason.slice(0, limits.overrideReason.max) : null,
    status: needsLead ? 'routed' : 'closed',
    refundApproved: !needsLead,
  });
}

/**
 * Lead approval in the Write-off Book: approves refunds > $500, scrap/donate write-offs,
 * or late-window exceptions. Strictly restricted to the Returns Lead (admin).
 */
export async function approveLeadAction(
  store: DataStore<Schema>,
  actor: Person,
  caseId: string,
  note?: string,
): Promise<ReturnCase> {
  if (!actor.isAdmin) {
    throw new PermissionError('Only the Returns lead can approve refunds over $500, write-offs, or late exceptions.');
  }
  const target = await store.repo('ReturnCase').get(caseId);
  if (!target) throw new RuleError('Return case not found.');

  const combinedNotes = note?.trim()
    ? `${target.notes ? `${target.notes} · ` : ''}Lead: ${note.trim()}`.slice(0, limits.notes.max)
    : target.notes;

  return store.repo('ReturnCase').update(target.id, {
    refundApproved: true,
    approvedBySub: actor.sub,
    approvedByName: actor.displayName,
    status: target.disposition ? 'closed' : target.status,
    notes: combinedNotes,
  });
}

/**
 * Compute enriched return metrics for the centrepiece, Today panel, and tools.
 */
export interface EnrichedReturn {
  item: ReturnCase;
  ladder: DispositionLadderResult | null;
  recoveryValue: number; // total recovery value for routed/recommended disposition
  overdue48h: boolean;
  needsLead: boolean;
  returnlessCandidate: boolean;
  returnlessEval: ReturnlessEvaluation;
  serial: SerialReturnerResult | null;
  windowEval: ReturnType<typeof evaluateWindow>;
}

export function enrichReturns(
  cases: readonly ReturnCase[],
  policies: readonly DispositionPolicy[],
  returners: readonly ReturnerStat[],
  now: Date,
): EnrichedReturn[] {
  const statMap = new Map<string, ReturnerStat>(returners.map((r) => [r.customerRef.toUpperCase(), r]));

  return cases.map((item) => {
    const ladder = item.grade ? bestDisposition(item, item.grade, policies) : null;
    const refPolicy = findPolicy(policies, item.category, item.grade ?? 'B') ?? findPolicy(policies, item.category, 'A');
    const returnlessEval = evaluateReturnless(
      item.unitPrice,
      refPolicy?.handlingCost ?? 6,
      refPolicy?.returnShipping ?? 5.5,
    );
    const returnlessCandidate = item.status === 'requested' && !item.disposition && returnlessEval.eligible;

    let recoveryValue = 0;
    if (item.disposition === 'returnless') {
      recoveryValue = returnlessEval.savings;
    } else if (ladder) {
      const chosen = item.disposition
        ? ladder.ladder.find((o) => o.disposition === item.disposition)
        : ladder.best;
      recoveryValue = chosen ? chosen.totalValue : ladder.best.totalValue;
    } else {
      // Un-graded estimate using Grade B expectation
      const est = bestDisposition(item, 'B', policies);
      recoveryValue = est.best.totalValue;
    }

    const stat = statMap.get(item.customerRef.toUpperCase());
    const serial = stat ? evaluateSerialReturner(stat) : null;

    return {
      item,
      ladder,
      recoveryValue,
      overdue48h: isOverdueGrading(item, now),
      needsLead: needsLeadSignOff(item),
      returnlessCandidate,
      returnlessEval,
      serial,
      windowEval: evaluateWindow(item.orderedAt, item.receivedAt ?? item.requestedAt),
    };
  });
}

export function dispositionForCase(e: EnrichedReturn): Disposition | null {
  return e.item.disposition ?? (e.ladder ? e.ladder.best.disposition : null);
}
