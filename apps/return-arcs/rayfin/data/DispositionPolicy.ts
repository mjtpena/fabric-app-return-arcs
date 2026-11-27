import { decimal, entity, role, set, uuid } from '@microsoft/rayfin-core';

/**
 * Per-category, per-grade disposition economics. Read by all authenticated users;
 * writes restricted to the returns lead in domain functions.
 */
@entity()
@role('authenticated', ['read', 'create', 'update', 'delete'])
export class DispositionPolicy {
  @uuid() id!: string;
  @set('electronics', 'home', 'fashion', 'toys', 'beauty', 'grocery')
  category!: 'electronics' | 'home' | 'fashion' | 'toys' | 'beauty' | 'grocery';
  @set('A', 'B', 'C', 'D') grade!: 'A' | 'B' | 'C' | 'D';
  @decimal() resaleRate!: number;
  @decimal() handlingCost!: number;
  @decimal() refurbCost!: number;
  @decimal() disposalFee!: number;
  @decimal() returnShipping!: number;
}
