/**
 * App data types and runtime entity definitions. Mirrors rayfin/data/*.ts.
 * Dates are ISO strings in the app; optional fields are `| null`.
 */
import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

export type Category = 'electronics' | 'home' | 'fashion' | 'toys' | 'beauty' | 'grocery';
export type ReturnReason = 'not_as_described' | 'changed_mind' | 'defective' | 'wrong_size' | 'gift_return' | 'late';
export type Origin = 'north' | 'south' | 'east' | 'west';
export type ReturnStatus = 'requested' | 'received' | 'graded' | 'routed' | 'closed';
export type Grade = 'A' | 'B' | 'C' | 'D';
export type Disposition = 'restock' | 'open_box' | 'refurbish' | 'liquidate' | 'donate' | 'scrap' | 'returnless';

export const CATEGORIES: readonly Category[] = ['electronics', 'home', 'fashion', 'toys', 'beauty', 'grocery'] as const;
export const ORIGINS: readonly Origin[] = ['north', 'south', 'east', 'west'] as const;
export const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D'] as const;
export const REASONS: readonly ReturnReason[] = [
  'not_as_described',
  'changed_mind',
  'defective',
  'wrong_size',
  'gift_return',
  'late',
] as const;
export const BAY_DISPOSITIONS: readonly Exclude<Disposition, 'returnless'>[] = [
  'restock',
  'open_box',
  'refurbish',
  'liquidate',
  'donate',
  'scrap',
] as const;

export const limits = {
  rmaNo: { min: 3, max: 20 },
  sku: { min: 2, max: 30 },
  productName: { min: 3, max: 80 },
  customerRef: { min: 2, max: 40 },
  overrideReason: { min: 10, max: 200 },
  notes: { max: 300 },
} as const;

export interface ReturnCase {
  id: string;
  rmaNo: string;
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
  overrideReason: string | null;
  refundAmount: number;
  refundApproved: boolean;
  approvedBySub: string | null;
  approvedByName: string | null;
  graderSub: string | null;
  graderName: string | null;
  notes: string | null;
}

export interface DispositionPolicy {
  id: string;
  category: Category;
  grade: Grade;
  resaleRate: number;
  handlingCost: number;
  refurbCost: number;
  disposalFee: number;
  returnShipping: number;
}

export interface ReturnerStat {
  id: string;
  customerRef: string;
  orders12m: number;
  returns12m: number;
  sizesBracketed: number;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  ReturnCase: ReturnCase;
  DispositionPolicy: DispositionPolicy;
  ReturnerStat: ReturnerStat;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  ReturnCase: {
    name: 'ReturnCase',
    fields: {
      id: 'uuid',
      rmaNo: 'text',
      sku: 'text',
      productName: 'text',
      category: 'text',
      orderedAt: 'date',
      requestedAt: 'date',
      receivedAt: 'date',
      customerRef: 'text',
      reason: 'text',
      unitPrice: 'decimal',
      unitCost: 'decimal',
      units: 'int',
      origin: 'text',
      status: 'text',
      grade: 'text',
      disposition: 'text',
      overrideReason: 'text',
      refundAmount: 'decimal',
      refundApproved: 'bool',
      approvedBySub: 'text',
      approvedByName: 'text',
      graderSub: 'text',
      graderName: 'text',
      notes: 'text',
    },
  },
  DispositionPolicy: {
    name: 'DispositionPolicy',
    fields: {
      id: 'uuid',
      category: 'text',
      grade: 'text',
      resaleRate: 'decimal',
      handlingCost: 'decimal',
      refurbCost: 'decimal',
      disposalFee: 'decimal',
      returnShipping: 'decimal',
    },
  },
  ReturnerStat: {
    name: 'ReturnerStat',
    fields: {
      id: 'uuid',
      customerRef: 'text',
      orders12m: 'int',
      returns12m: 'int',
      sizesBracketed: 'int',
    },
  },
};
