import { entity, int, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * Rolling 12-month return behaviour per customer reference. Read by all authenticated users;
 * updates restricted to the returns lead in domain functions.
 */
@entity()
@role('authenticated', ['read', 'create', 'update', 'delete'])
export class ReturnerStat {
  @uuid() id!: string;
  @text({ min: 2, max: 40 }) customerRef!: string;
  @int() orders12m!: number;
  @int() returns12m!: number;
  @int() sizesBracketed!: number;
}
