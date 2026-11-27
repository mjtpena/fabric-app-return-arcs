import type { DataStore } from '@x10/shared/data';
import { addDays } from '@x10/shared/lib';
import type { SeedContext } from '@x10/shared/runtime';

const addHours = (d: Date, hours: number): string => new Date(d.getTime() + hours * 3_600_000).toISOString();

import type { Category, Disposition, Grade, Origin, ReturnReason, ReturnStatus, Schema } from './model';
import { calculateRefund } from './domain/rules';

/** Deterministic mulberry32 PRNG keyed on integer seed (never Math.random). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POLICY_BASE: Record<Category, { handling: number; refurb: number; disposal: number; shipping: number; rates: Record<Grade, number> }> = {
  electronics: { handling: 8.5, refurb: 24, disposal: 6.5, shipping: 7.5, rates: { A: 0.97, B: 0.78, C: 0.46, D: 0.12 } },
  home: { handling: 7.0, refurb: 16, disposal: 5.0, shipping: 6.0, rates: { A: 0.97, B: 0.74, C: 0.42, D: 0.1 } },
  fashion: { handling: 5.5, refurb: 12, disposal: 3.5, shipping: 5.0, rates: { A: 0.97, B: 0.70, C: 0.38, D: 0.08 } },
  toys: { handling: 6.0, refurb: 14, disposal: 4.0, shipping: 5.5, rates: { A: 0.97, B: 0.72, C: 0.40, D: 0.08 } },
  beauty: { handling: 4.5, refurb: 10, disposal: 4.5, shipping: 4.5, rates: { A: 0.97, B: 0.62, C: 0.25, D: 0.05 } },
  grocery: { handling: 4.0, refurb: 8, disposal: 3.0, shipping: 4.0, rates: { A: 0.97, B: 0.55, C: 0.20, D: 0.04 } },
};

const CATALOG: Array<{ sku: string; name: string; category: Category; price: number; cost: number }> = [
  { sku: 'EL-PRO-620', name: 'Aurora 4K Home Projector', category: 'electronics', price: 620, cost: 340 },
  { sku: 'EL-ANC-240', name: 'Solstice Noise-Cancelling Headphones', category: 'electronics', price: 240, cost: 118 },
  { sku: 'EL-SPK-165', name: 'Hearth Smart Brass Speaker', category: 'electronics', price: 165, cost: 79 },
  { sku: 'EL-CAM-540', name: 'Northstar Mirrorless Kit', category: 'electronics', price: 540, cost: 295 },
  { sku: 'EL-KEY-128', name: 'Tactile Mechanical Keyboard', category: 'electronics', price: 128, cost: 58 },
  { sku: 'EL-MON-580', name: 'Lumen 32-Inch Studio Monitor', category: 'electronics', price: 580, cost: 310 },
  { sku: 'HM-ESP-310', name: 'Copper Barista Espresso Press', category: 'home', price: 310, cost: 145 },
  { sku: 'HM-BLN-145', name: 'Winter Wool Throw Blanket', category: 'home', price: 145, cost: 62 },
  { sku: 'HM-KTL-88', name: 'Gooseneck Pour-Over Kettle', category: 'home', price: 88, cost: 39 },
  { sku: 'HM-MUG-12', name: 'Enamel Camp Mug (Amber)', category: 'home', price: 12, cost: 4.2 },
  { sku: 'HM-CND-14', name: 'Cedar & Clove Taper Candles', category: 'home', price: 14, cost: 4.5 },
  { sku: 'FA-PAR-220', name: 'Alpine Down Parka (Charcoal)', category: 'fashion', price: 220, cost: 92 },
  { sku: 'FA-BOT-175', name: 'Suede Chelsea Winter Boots', category: 'fashion', price: 175, cost: 74 },
  { sku: 'FA-KNT-115', name: 'Merino Fisherman Crewneck', category: 'fashion', price: 115, cost: 46 },
  { sku: 'FA-SCF-16', name: 'Ribbed Knit Scarf', category: 'fashion', price: 16, cost: 5.5 },
  { sku: 'TY-TRN-135', name: 'Timber Railway Collector Set', category: 'toys', price: 135, cost: 58 },
  { sku: 'TY-DRN-96', name: 'Indoor Micro Quadcopter', category: 'toys', price: 96, cost: 41 },
  { sku: 'TY-PUZ-15', name: '500-Piece Winter Village Puzzle', category: 'toys', price: 15, cost: 4.8 },
  { sku: 'BT-SER-74', name: 'Botanical Night Repair Serum', category: 'beauty', price: 74, cost: 24 },
  { sku: 'BT-BAL-11', name: 'Shea Lip Balm Trio', category: 'beauty', price: 11, cost: 3.1 },
  { sku: 'GR-TEA-13', name: 'Spiced Orange Loose-Leaf Tin', category: 'grocery', price: 13, cost: 4.2 },
  { sku: 'GR-COF-26', name: 'Single-Origin Winter Roast 1kg', category: 'grocery', price: 26, cost: 11 },
];

/**
 * Deterministic seed:
 * - 24 DispositionPolicy rows (6 categories x 4 grades)
 * - 12 ReturnerStat rows: 3 serial returners (1 rate-flagged 5/10=50%, 1 size-bracketing, 1 both)
 *   + 1 boundary customer (4/8=50% NOT flagged) + 8 regular customers
 * - 60 ReturnCase rows:
 *   - 9 received & ungraded > 48h
 *   - 4 write-offs / refunds > $500 waiting for lead (including a $620 refund!)
 *   - 3+ open returns from the 3 serial returners
 *   - 5 returnless candidates (including a $12 item with $7 handling!)
 *   - 2 beyond return window (late)
 *   - Remaining routed/closed across all 6 disposition bays + returnless
 */
export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const [lead, grader] = ctx.people;
  const now = ctx.now;
  const rand = mulberry32(20261207);

  // 1. Policies (6 x 4 = 24)
  const policyRepo = store.repo('DispositionPolicy');
  for (const cat of Object.keys(POLICY_BASE) as Category[]) {
    const base = POLICY_BASE[cat];
    for (const grade of ['A', 'B', 'C', 'D'] as Grade[]) {
      await policyRepo.create({
        category: cat,
        grade,
        resaleRate: base.rates[grade],
        handlingCost: base.handling,
        refurbCost: base.refurb,
        disposalFee: base.disposal,
        returnShipping: base.shipping,
      });
    }
  }

  // 2. Returner stats (12 customers)
  const statRepo = store.repo('ReturnerStat');
  const stats = [
    // 3 serial returners
    { customerRef: 'CUST-401', orders12m: 10, returns12m: 5, sizesBracketed: 0 }, // exact AC4: 50% (5/10)
    { customerRef: 'CUST-402', orders12m: 14, returns12m: 4, sizesBracketed: 3 }, // size bracketing (3 sizes)
    { customerRef: 'CUST-403', orders12m: 12, returns12m: 6, sizesBracketed: 2 }, // both 50% & bracketing
    // Boundary non-flagged customer (AC4: 4 of 8 = 50% but under min 5 returns)
    { customerRef: 'CUST-404', orders12m: 8, returns12m: 4, sizesBracketed: 0 },
    // Regular customers
    { customerRef: 'CUST-105', orders12m: 9, returns12m: 1, sizesBracketed: 0 },
    { customerRef: 'CUST-106', orders12m: 6, returns12m: 1, sizesBracketed: 0 },
    { customerRef: 'CUST-107', orders12m: 11, returns12m: 2, sizesBracketed: 1 },
    { customerRef: 'CUST-108', orders12m: 7, returns12m: 1, sizesBracketed: 0 },
    { customerRef: 'CUST-109', orders12m: 5, returns12m: 1, sizesBracketed: 0 },
    { customerRef: 'CUST-110', orders12m: 12, returns12m: 2, sizesBracketed: 0 },
    { customerRef: 'CUST-111', orders12m: 4, returns12m: 1, sizesBracketed: 0 },
    { customerRef: 'CUST-112', orders12m: 10, returns12m: 2, sizesBracketed: 0 },
  ];
  for (const s of stats) {
    await statRepo.create(s);
  }

  // 3. 60 ReturnCase rows
  const caseRepo = store.repo('ReturnCase');
  const origins: Origin[] = ['north', 'south', 'east', 'west'];
  const reasons: ReturnReason[] = ['changed_mind', 'defective', 'wrong_size', 'not_as_described', 'gift_return'];
  let seq = 1001;
  const nextRma = () => `RMA-${seq++}`;

  const addCase = async (opts: {
    sku: string;
    productName: string;
    category: Category;
    orderedAt: string;
    requestedAt: string;
    receivedAt: string | null;
    customerRef: string;
    reason: ReturnReason;
    unitPrice: number;
    unitCost: number;
    units: number;
    origin: Origin;
    status: ReturnStatus;
    grade: Grade | null;
    disposition: Disposition | null;
    overrideReason?: string | null;
    refundApproved?: boolean;
    approvedBySub?: string | null;
    approvedByName?: string | null;
    graderSub?: string | null;
    graderName?: string | null;
    notes?: string | null;
  }) => {
    const calc = calculateRefund(opts.unitPrice, opts.units, opts.grade, opts.reason);
    await caseRepo.create({
      rmaNo: nextRma(),
      sku: opts.sku,
      productName: opts.productName,
      category: opts.category,
      orderedAt: opts.orderedAt,
      requestedAt: opts.requestedAt,
      receivedAt: opts.receivedAt,
      customerRef: opts.customerRef,
      reason: opts.reason,
      unitPrice: opts.unitPrice,
      unitCost: opts.unitCost,
      units: opts.units,
      origin: opts.origin,
      status: opts.status,
      grade: opts.grade,
      disposition: opts.disposition,
      overrideReason: opts.overrideReason ?? null,
      refundAmount: calc.refundAmount,
      refundApproved: opts.refundApproved ?? false,
      approvedBySub: opts.approvedBySub ?? null,
      approvedByName: opts.approvedByName ?? null,
      graderSub: opts.graderSub ?? null,
      graderName: opts.graderName ?? null,
      notes: opts.notes ?? null,
    });
  };

  // A) 4 Write-offs / high refunds waiting for lead (incl. exact $620 refund AC5!)
  await addCase({
    sku: 'EL-PRO-620',
    productName: 'Aurora 4K Home Projector',
    category: 'electronics',
    orderedAt: addDays(now, -12),
    requestedAt: addDays(now, -3),
    receivedAt: addHours(now, -30),
    customerRef: 'CUST-105',
    reason: 'changed_mind',
    unitPrice: 620,
    unitCost: 340,
    units: 1,
    origin: 'north',
    status: 'routed',
    grade: 'A',
    disposition: 'restock',
    refundApproved: false,
    graderSub: grader.sub,
    graderName: grader.displayName,
    notes: 'Factory seal intact; refund exceeds $500 lead threshold.',
  });
  await addCase({
    sku: 'EL-MON-580',
    productName: 'Lumen 32-Inch Studio Monitor',
    category: 'electronics',
    orderedAt: addDays(now, -14),
    requestedAt: addDays(now, -4),
    receivedAt: addHours(now, -40),
    customerRef: 'CUST-106',
    reason: 'defective',
    unitPrice: 580,
    unitCost: 310,
    units: 1,
    origin: 'west',
    status: 'routed',
    grade: 'D',
    disposition: 'scrap',
    refundApproved: false,
    graderSub: grader.sub,
    graderName: grader.displayName,
    notes: 'Cracked panel in transit; awaiting lead scrap write-off.',
  });
  await addCase({
    sku: 'EL-CAM-540',
    productName: 'Northstar Mirrorless Kit',
    category: 'electronics',
    orderedAt: addDays(now, -10),
    requestedAt: addDays(now, -2),
    receivedAt: addHours(now, -20),
    customerRef: 'CUST-107',
    reason: 'not_as_described',
    unitPrice: 540,
    unitCost: 295,
    units: 1,
    origin: 'east',
    status: 'routed',
    grade: 'B',
    disposition: 'open_box',
    refundApproved: false,
    graderSub: grader.sub,
    graderName: grader.displayName,
    notes: 'Opened box, lens spotless; refund > $500 awaits lead.',
  });
  await addCase({
    sku: 'BT-SER-74',
    productName: 'Botanical Night Repair Serum',
    category: 'beauty',
    orderedAt: addDays(now, -9),
    requestedAt: addDays(now, -3),
    receivedAt: addHours(now, -26),
    customerRef: 'CUST-108',
    reason: 'defective',
    unitPrice: 74,
    unitCost: 24,
    units: 2,
    origin: 'south',
    status: 'routed',
    grade: 'D',
    disposition: 'scrap',
    refundApproved: false,
    graderSub: grader.sub,
    graderName: grader.displayName,
    notes: 'Broken pump seal; cosmetic disposal write-off pending lead.',
  });

  // B) 9 Received & ungraded for > 48 hours (includes the 3 serial returners + boundary CUST-404!)
  const overdueSpecs: Array<{ idx: number; cust: string; origin: Origin; hoursAgo: number; reason: ReturnReason; units: number }> = [
    { idx: 11, cust: 'CUST-401', origin: 'north', hoursAgo: 74, reason: 'wrong_size', units: 2 }, // Serial returner 5/10 (50%)
    { idx: 12, cust: 'CUST-402', origin: 'east', hoursAgo: 68, reason: 'wrong_size', units: 3 }, // Size bracketing serial
    { idx: 13, cust: 'CUST-403', origin: 'west', hoursAgo: 62, reason: 'changed_mind', units: 2 }, // Serial both
    { idx: 1, cust: 'CUST-404', origin: 'south', hoursAgo: 58, reason: 'changed_mind', units: 1 }, // Boundary 4/8 NOT flagged
    { idx: 2, cust: 'CUST-109', origin: 'north', hoursAgo: 56, reason: 'defective', units: 1 },
    { idx: 6, cust: 'CUST-110', origin: 'east', hoursAgo: 54, reason: 'not_as_described', units: 1 },
    { idx: 15, cust: 'CUST-111', origin: 'south', hoursAgo: 52, reason: 'gift_return', units: 2 },
    { idx: 7, cust: 'CUST-112', origin: 'west', hoursAgo: 51, reason: 'changed_mind', units: 1 },
    { idx: 4, cust: 'CUST-105', origin: 'north', hoursAgo: 50, reason: 'defective', units: 1 },
  ];
  for (const ov of overdueSpecs) {
    const prod = CATALOG[ov.idx];
    await addCase({
      sku: prod.sku,
      productName: prod.name,
      category: prod.category,
      orderedAt: addDays(now, -15),
      requestedAt: addHours(now, -(ov.hoursAgo + 24)),
      receivedAt: addHours(now, -ov.hoursAgo),
      customerRef: ov.cust,
      reason: ov.reason,
      unitPrice: prod.price,
      unitCost: prod.cost,
      units: ov.units,
      origin: ov.origin,
      status: 'received',
      grade: null,
      disposition: null,
    });
  }

  // C) 5 Returnless refund candidates (requested, handling + shipping > 50% of unitPrice; includes $12 item!)
  const returnlessIdxs = [9, 10, 17, 19, 20]; // $12 mug, $14 candles, $15 puzzle, $11 balm, $13 tea
  for (let i = 0; i < returnlessIdxs.length; i++) {
    const prod = CATALOG[returnlessIdxs[i]];
    await addCase({
      sku: prod.sku,
      productName: prod.name,
      category: prod.category,
      orderedAt: addDays(now, -10 - i),
      requestedAt: addHours(now, -(12 + i * 6)),
      receivedAt: null,
      customerRef: `CUST-10${5 + i}`,
      reason: i % 2 === 0 ? 'changed_mind' : 'not_as_described',
      unitPrice: prod.price,
      unitCost: prod.cost,
      units: 1,
      origin: origins[i % 4],
      status: 'requested',
      grade: null,
      disposition: null,
      notes: 'Return shipping + handling exceeds 50% of unit price.',
    });
  }

  // D) 2 Items beyond return window (reason = 'late')
  await addCase({
    sku: 'FA-PAR-220',
    productName: 'Alpine Down Parka (Charcoal)',
    category: 'fashion',
    orderedAt: addDays(now, -48),
    requestedAt: addDays(now, -2),
    receivedAt: addHours(now, -18),
    customerRef: 'CUST-109',
    reason: 'late',
    unitPrice: 220,
    unitCost: 92,
    units: 1,
    origin: 'east',
    status: 'received',
    grade: null,
    disposition: null,
    notes: 'Arrived outside standard 30-day window; requires lead exception.',
  });
  await addCase({
    sku: 'HM-KTL-88',
    productName: 'Gooseneck Pour-Over Kettle',
    category: 'home',
    orderedAt: addDays(now, -52),
    requestedAt: addDays(now, -1),
    receivedAt: addHours(now, -10),
    customerRef: 'CUST-110',
    reason: 'late',
    unitPrice: 88,
    unitCost: 39,
    units: 1,
    origin: 'south',
    status: 'graded',
    grade: 'B',
    disposition: null,
    graderSub: grader.sub,
    graderName: grader.displayName,
    notes: 'Late arrival; graded B pending lead exception sign-off.',
  });

  // E) 4 Graded items ready at the Fork (including a Grade-C item for AC1!)
  const forkSpecs: Array<{ idx: number; grade: Grade; origin: Origin; reason: ReturnReason }> = [
    { idx: 1, grade: 'C', origin: 'north', reason: 'changed_mind' }, // Grade C -> cannot restock (AC1)
    { idx: 2, grade: 'C', origin: 'east', reason: 'defective' }, // Defective electronics -> refurbish
    { idx: 6, grade: 'A', origin: 'south', reason: 'gift_return' }, // Grade A -> restock
    { idx: 15, grade: 'B', origin: 'west', reason: 'changed_mind' }, // Grade B -> open_box
  ];
  for (let i = 0; i < forkSpecs.length; i++) {
    const f = forkSpecs[i];
    const prod = CATALOG[f.idx];
    await addCase({
      sku: prod.sku,
      productName: prod.name,
      category: prod.category,
      orderedAt: addDays(now, -12 - i),
      requestedAt: addDays(now, -3),
      receivedAt: addHours(now, -(24 + i * 3)),
      customerRef: `CUST-10${6 + i}`,
      reason: f.reason,
      unitPrice: prod.price,
      unitCost: prod.cost,
      units: 1,
      origin: f.origin,
      status: 'graded',
      grade: f.grade,
      disposition: null,
      graderSub: grader.sub,
      graderName: grader.displayName,
      notes: f.grade === 'C' ? 'Light wear on outer housing; packaging torn.' : 'Inspected at bench.',
    });
  }

  // F) 36 Closed/routed/requested cases across all 6 bays + returnless to reach exactly 60 total
  // (4 + 9 + 5 + 2 + 4 = 24 so far -> 36 more = 60)
  const closedDispositions: Array<{ disp: Disposition; grade: Grade | null; reason: ReturnReason }> = [
    { disp: 'restock', grade: 'A', reason: 'gift_return' },
    { disp: 'restock', grade: 'A', reason: 'changed_mind' },
    { disp: 'open_box', grade: 'B', reason: 'changed_mind' },
    { disp: 'open_box', grade: 'B', reason: 'wrong_size' },
    { disp: 'refurbish', grade: 'C', reason: 'defective' },
    { disp: 'liquidate', grade: 'C', reason: 'not_as_described' },
    { disp: 'donate', grade: 'C', reason: 'changed_mind' },
    { disp: 'scrap', grade: 'D', reason: 'defective' },
    { disp: 'returnless', grade: null, reason: 'changed_mind' },
  ];

  for (let i = 0; i < 36; i++) {
    const template = closedDispositions[i % closedDispositions.length];
    let prod = CATALOG[Math.floor(rand() * CATALOG.length)];
    if (template.disp === 'refurbish') {
      prod = CATALOG[i % 5]; // electronics
    } else if (template.disp === 'returnless') {
      prod = CATALOG[returnlessIdxs[i % returnlessIdxs.length]];
    } else if (prod.price > 450) {
      prod = CATALOG[6 + (i % 10)];
    }

    const origin = origins[i % 4];
    const units = 1 + Math.floor(rand() * 3);
    const daysAgo = 2 + Math.floor(rand() * 14);
    const custRef = stats[4 + (i % 8)].customerRef;

    // 4 of the 36 are freshly requested (awaiting dock scan), 4 are freshly received (<24h), 28 are closed
    if (i < 4) {
      await addCase({
        sku: prod.sku,
        productName: prod.name,
        category: prod.category,
        orderedAt: addDays(now, -(daysAgo + 8)),
        requestedAt: addHours(now, -(6 + i * 4)),
        receivedAt: null,
        customerRef: custRef,
        reason: reasons[i % reasons.length],
        unitPrice: Math.max(45, prod.price),
        unitCost: Math.max(18, prod.cost),
        units,
        origin,
        status: 'requested',
        grade: null,
        disposition: null,
      });
    } else if (i < 8) {
      await addCase({
        sku: prod.sku,
        productName: prod.name,
        category: prod.category,
        orderedAt: addDays(now, -(daysAgo + 8)),
        requestedAt: addDays(now, -2),
        receivedAt: addHours(now, -(8 + i * 2)),
        customerRef: custRef,
        reason: reasons[i % reasons.length],
        unitPrice: prod.price,
        unitCost: prod.cost,
        units,
        origin,
        status: 'received',
        grade: null,
        disposition: null,
      });
    } else {
      await addCase({
        sku: prod.sku,
        productName: prod.name,
        category: prod.category,
        orderedAt: addDays(now, -(daysAgo + 10)),
        requestedAt: addDays(now, -daysAgo),
        receivedAt: template.disp === 'returnless' ? null : addDays(now, -(daysAgo - 1)),
        customerRef: custRef,
        reason: template.reason,
        unitPrice: prod.price,
        unitCost: prod.cost,
        units,
        origin,
        status: 'closed',
        grade: template.grade,
        disposition: template.disp,
        refundApproved: true,
        approvedBySub: template.disp === 'scrap' || template.disp === 'donate' ? lead.sub : null,
        approvedByName: template.disp === 'scrap' || template.disp === 'donate' ? lead.displayName : null,
        graderSub: grader.sub,
        graderName: grader.displayName,
      });
    }
  }
}
