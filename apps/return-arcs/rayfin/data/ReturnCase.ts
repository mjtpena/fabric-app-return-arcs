import { boolean, date, decimal, entity, int, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A customer return moving from an origin region to the dock and out to a disposition bay.
 * Row security: any authenticated user may read and create; updates once graded require
 * claims.sub === graderSub (claiming and lead approvals are enforced in domain functions).
 */
@entity()
@role('authenticated', ['read', 'create'])
@role('authenticated', 'update', {
  policy: (claims, item) => claims.sub.eq(item.graderSub),
})
@role('authenticated', 'delete', {
  policy: (claims, item) => claims.sub.eq(item.graderSub),
})
export class ReturnCase {
  @uuid() id!: string;
  @text({ min: 3, max: 20 }) rmaNo!: string;
  @text({ min: 2, max: 30 }) sku!: string;
  @text({ min: 3, max: 80 }) productName!: string;
  @set('electronics', 'home', 'fashion', 'toys', 'beauty', 'grocery')
  category!: 'electronics' | 'home' | 'fashion' | 'toys' | 'beauty' | 'grocery';
  @date() orderedAt!: Date;
  @date() requestedAt!: Date;
  @date({ optional: true }) receivedAt?: Date;
  @text({ min: 2, max: 40 }) customerRef!: string;
  @set('not_as_described', 'changed_mind', 'defective', 'wrong_size', 'gift_return', 'late')
  reason!: 'not_as_described' | 'changed_mind' | 'defective' | 'wrong_size' | 'gift_return' | 'late';
  @decimal() unitPrice!: number;
  @decimal() unitCost!: number;
  @int() units!: number;
  @set('north', 'south', 'east', 'west') origin!: 'north' | 'south' | 'east' | 'west';
  @set('requested', 'received', 'graded', 'routed', 'closed')
  status!: 'requested' | 'received' | 'graded' | 'routed' | 'closed';
  @text({ max: 10, optional: true }) grade?: 'A' | 'B' | 'C' | 'D';
  @text({ max: 20, optional: true })
  disposition?: 'restock' | 'open_box' | 'refurbish' | 'liquidate' | 'donate' | 'scrap' | 'returnless';
  @text({ max: 200, optional: true }) overrideReason?: string;
  @decimal() refundAmount!: number;
  @boolean() refundApproved!: boolean;
  @text({ max: 100, optional: true }) approvedBySub?: string;
  @text({ max: 100, optional: true }) approvedByName?: string;
  @text({ max: 100, optional: true }) graderSub?: string;
  @text({ max: 100, optional: true }) graderName?: string;
  @text({ max: 300, optional: true }) notes?: string;
}
