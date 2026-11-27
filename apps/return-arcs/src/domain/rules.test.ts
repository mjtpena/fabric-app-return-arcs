import { describe, expect, it } from 'vitest';

import { createMemoryStore, PermissionError, RuleError } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';

import { defs, type DispositionPolicy, type Schema } from '../model';
import {
  approveLeadAction,
  createReturnRequest,
  gradeReturn,
  routeDisposition,
} from './returns';
import {
  bestDisposition,
  calculateRefund,
  evaluateReturnless,
  evaluateSerialReturner,
  evaluateWindow,
} from './rules';

const LEAD: Person = {
  id: 'p-lead',
  sub: 'demo-lead-alex',
  displayName: 'Alex Rivera',
  email: 'alex@example.com',
  isAdmin: true,
  createdAt: '2026-11-01T00:00:00Z',
};

const GRADER: Person = {
  id: 'p-grader',
  sub: 'demo-grader-sam',
  displayName: 'Sam Taylor',
  email: 'sam@example.com',
  isAdmin: false,
  createdAt: '2026-11-01T00:00:00Z',
};

const SAMPLE_POLICIES: DispositionPolicy[] = [
  { id: '1', category: 'electronics', grade: 'A', resaleRate: 0.97, handlingCost: 8, refurbCost: 22, disposalFee: 6, returnShipping: 7 },
  { id: '2', category: 'electronics', grade: 'B', resaleRate: 0.78, handlingCost: 8, refurbCost: 22, disposalFee: 6, returnShipping: 7 },
  { id: '3', category: 'electronics', grade: 'C', resaleRate: 0.45, handlingCost: 8, refurbCost: 22, disposalFee: 6, returnShipping: 7 },
  { id: '4', category: 'electronics', grade: 'D', resaleRate: 0.1, handlingCost: 8, refurbCost: 22, disposalFee: 6, returnShipping: 7 },
  { id: '5', category: 'home', grade: 'B', resaleRate: 0.72, handlingCost: 7, refurbCost: 14, disposalFee: 5, returnShipping: 5 },
  { id: '6', category: 'fashion', grade: 'C', resaleRate: 0.48, handlingCost: 5, refurbCost: 10, disposalFee: 3, returnShipping: 5 },
];

describe('Rule 1 — Return window (holiday + standard 30-day)', () => {
  it('AC3: fashion order placed Nov 28 returned Jan 20 is in window', () => {
    const res = evaluateWindow('2026-11-28T10:00:00Z', '2027-01-20T14:00:00Z');
    expect(res.inWindow).toBe(true);
    expect(res.isHolidayOrder).toBe(true);
    expect(res.needsLeadException).toBe(false);
  });

  it('AC3: same item bought Dec 28 and returned Jan 31 is late (34 days > 30)', () => {
    const res = evaluateWindow('2026-12-28T10:00:00Z', '2027-01-31T14:00:00Z');
    expect(res.inWindow).toBe(false);
    expect(res.isHolidayOrder).toBe(false);
    expect(res.needsLeadException).toBe(true);
  });

  it('holiday order on Dec 24 returned on Jan 31 is in window; Feb 1 is late', () => {
    expect(evaluateWindow('2026-12-24T12:00:00Z', '2027-01-31T12:00:00Z').inWindow).toBe(true);
    expect(evaluateWindow('2026-12-24T12:00:00Z', '2027-02-01T00:01:00Z').inWindow).toBe(false);
  });

  it('standard order returned on day 30 is in window', () => {
    expect(evaluateWindow('2026-10-01T09:00:00Z', '2026-10-31T12:00:00Z').inWindow).toBe(true);
  });
});

describe('Rule 2 — Disposition value ladder', () => {
  it('AC1: grade-C item can never restock and ladder explains why', () => {
    const res = bestDisposition(
      { category: 'electronics', reason: 'changed_mind', unitPrice: 180, unitCost: 90, units: 1 },
      'C',
      SAMPLE_POLICIES,
    );
    const restock = res.ladder.find((o) => o.disposition === 'restock');
    expect(restock?.eligible).toBe(false);
    expect(restock?.ineligibleReason).toMatch(/Grade C can never restock/i);
    expect(res.best.disposition).not.toBe('restock');
  });

  it('grade-D item can never restock or open_box', () => {
    const res = bestDisposition(
      { category: 'electronics', reason: 'changed_mind', unitPrice: 120, unitCost: 50, units: 1 },
      'D',
      SAMPLE_POLICIES,
    );
    expect(res.ladder.find((o) => o.disposition === 'restock')?.eligible).toBe(false);
    expect(res.ladder.find((o) => o.disposition === 'open_box')?.eligible).toBe(false);
  });

  it('defective electronics grade B/C can refurbish and beats liquidate', () => {
    const res = bestDisposition(
      { category: 'electronics', reason: 'defective', unitPrice: 300, unitCost: 140, units: 1 },
      'C',
      SAMPLE_POLICIES,
    );
    expect(res.best.disposition).toBe('refurbish');
    expect(res.best.value).toBe(225); // 300*0.85 - 22 - 8
  });

  it('grade A item prefers restock', () => {
    const res = bestDisposition(
      { category: 'electronics', reason: 'changed_mind', unitPrice: 200, unitCost: 100, units: 2 },
      'A',
      SAMPLE_POLICIES,
    );
    expect(res.best.disposition).toBe('restock');
    expect(res.best.value).toBe(186); // 200*0.97 - 8
    expect(res.best.totalValue).toBe(372);
  });
});

describe('Rule 3 — Returnless refund', () => {
  it('AC2: a $12 item with $7 handling cost (+ shipping) is offered a returnless refund', () => {
    const evalRes = evaluateReturnless(12, 7, 4.5);
    expect(evalRes.eligible).toBe(true);
    expect(evalRes.totalReturnCost).toBe(11.5);
    expect(evalRes.threshold).toBe(6);

    // Even with $0 shipping, $7 handling alone exceeds 50% of $12 ($6)
    expect(evaluateReturnless(12, 7, 0).eligible).toBe(true);
  });

  it('expensive item is not offered a returnless refund', () => {
    expect(evaluateReturnless(120, 7, 5).eligible).toBe(false);
  });
});

describe('Rule 4 — Serial returners', () => {
  it('AC4: 10 orders and 5 returns is flagged with 50% rate', () => {
    const res = evaluateSerialReturner({ orders12m: 10, returns12m: 5, sizesBracketed: 0 });
    expect(res.flagged).toBe(true);
    expect(res.ratePct).toBe(50);
    expect(res.reason).toBe('rate');
  });

  it('AC4: 4 returns of 8 orders is NOT flagged (under minimum 5 returns)', () => {
    const res = evaluateSerialReturner({ orders12m: 8, returns12m: 4, sizesBracketed: 0 });
    expect(res.flagged).toBe(false);
    expect(res.ratePct).toBe(50);
  });

  it('2+ bracketed sizes flags the customer even below 40% rate', () => {
    const res = evaluateSerialReturner({ orders12m: 15, returns12m: 3, sizesBracketed: 2 });
    expect(res.flagged).toBe(true);
    expect(res.reason).toBe('bracketing');
  });
});

describe('Rule 5 — Refunds and lead approval', () => {
  it('applies 15% damage fee for grade C/D when reason is not defective', () => {
    const r = calculateRefund(200, 1, 'C', 'changed_mind');
    expect(r.damageFeeApplied).toBe(true);
    expect(r.damageFee).toBe(30);
    expect(r.refundAmount).toBe(170);
  });

  it('waives damage fee when reason is defective', () => {
    const r = calculateRefund(200, 1, 'C', 'defective');
    expect(r.damageFeeApplied).toBe(false);
    expect(r.refundAmount).toBe(200);
  });

  it('AC5: a $620 refund requires lead approval', () => {
    const r = calculateRefund(620, 1, 'A', 'changed_mind');
    expect(r.refundAmount).toBe(620);
    expect(r.needsLeadApproval).toBe(true);
  });
});

describe('Domain workflows (DataStore enforcement)', () => {
  async function setupStore() {
    const store = createMemoryStore<Schema>(defs);
    for (const p of SAMPLE_POLICIES) {
      await store.repo('DispositionPolicy').create({
        category: p.category,
        grade: p.grade,
        resaleRate: p.resaleRate,
        handlingCost: p.handlingCost,
        refurbCost: p.refurbCost,
        disposalFee: p.disposalFee,
        returnShipping: p.returnShipping,
      });
    }
    return store;
  }

  it('AC1 workflow: routing a Grade-C item to restock throws RuleError', async () => {
    const store = await setupStore();
    const { record } = await createReturnRequest(store, GRADER, {
      rmaNo: 'RMA-TEST-C',
      sku: 'EL-100',
      productName: 'Studio Headphones',
      category: 'electronics',
      orderedAt: '2026-11-28T10:00:00Z',
      requestedAt: '2026-12-05T10:00:00Z',
      customerRef: 'CUST-99',
      reason: 'changed_mind',
      unitPrice: 180,
      unitCost: 85,
      units: 1,
      origin: 'north',
    });
    await store.repo('ReturnCase').update(record.id, { status: 'received', receivedAt: '2026-12-06T10:00:00Z' });
    await gradeReturn(store, GRADER, record.id, 'C', 'Scuffed earcup');
    await expect(routeDisposition(store, GRADER, record.id, 'restock', 'Trying to restock anyway')).rejects.toThrow(RuleError);
  });

  it('AC5 workflow: $620 refund stays pending until Returns Lead approves; Grader is rejected', async () => {
    const store = await setupStore();
    const { record } = await createReturnRequest(store, GRADER, {
      rmaNo: 'RMA-620',
      sku: 'EL-620',
      productName: '4K Projector',
      category: 'electronics',
      orderedAt: '2026-11-29T10:00:00Z',
      requestedAt: '2026-12-05T10:00:00Z',
      customerRef: 'CUST-88',
      reason: 'changed_mind',
      unitPrice: 620,
      unitCost: 340,
      units: 1,
      origin: 'west',
    });
    await store.repo('ReturnCase').update(record.id, { status: 'received', receivedAt: '2026-12-06T10:00:00Z' });
    await gradeReturn(store, GRADER, record.id, 'A', 'Unopened box');
    const routed = await routeDisposition(store, GRADER, record.id, 'restock');
    expect(routed.refundApproved).toBe(false);
    expect(routed.status).toBe('routed');

    await expect(approveLeadAction(store, GRADER, routed.id)).rejects.toThrow(PermissionError);
    const approved = await approveLeadAction(store, LEAD, routed.id, 'Verified serial and seal');
    expect(approved.refundApproved).toBe(true);
    expect(approved.status).toBe('closed');
    expect(approved.approvedBySub).toBe(LEAD.sub);
  });
});
