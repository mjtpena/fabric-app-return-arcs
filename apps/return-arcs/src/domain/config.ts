/**
 * All Return Arcs thresholds and policy constants in one place.
 */

export const HOLIDAY_WINDOW_START_MONTH = 11; // November (1-based)
export const HOLIDAY_WINDOW_START_DAY = 1;
export const HOLIDAY_ORDER_CUTOFF_MONTH = 12; // December (1-based)
export const HOLIDAY_ORDER_CUTOFF_DAY = 24;
export const HOLIDAY_WINDOW_END_MONTH = 1; // January (1-based)
export const HOLIDAY_WINDOW_END_DAY = 31;

export const STANDARD_WINDOW_DAYS = 30;
export const RETURNLESS_RATIO = 0.5;
export const SERIAL_RATE = 0.4;
export const SERIAL_MIN_RETURNS = 5;
export const SERIAL_MIN_BRACKETED_SIZES = 2;
export const LEAD_REFUND_OVER = 500;
export const DAMAGE_FEE_PCT = 15;
export const GRADING_SLA_HOURS = 48;

export const RESTOCK_RECOVERY_RATE = 0.97;
export const REFURBISH_RECOVERY_RATE = 0.85;
export const LIQUIDATE_COST_RATE = 0.25;
export const DONATE_HANDLING_FACTOR = 0.5;

export const CATEGORY_LABELS = {
  electronics: 'Electronics',
  home: 'Home',
  fashion: 'Fashion',
  toys: 'Toys',
  beauty: 'Beauty',
  grocery: 'Grocery',
} as const;

export const ORIGIN_LABELS = {
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
} as const;

export const REASON_LABELS = {
  not_as_described: 'Not as described',
  changed_mind: 'Changed mind',
  defective: 'Defective',
  wrong_size: 'Wrong size',
  gift_return: 'Gift return',
  late: 'Late (out of window)',
} as const;

export const DISPOSITION_LABELS = {
  restock: 'Restock',
  open_box: 'Open-Box',
  refurbish: 'Refurbish',
  liquidate: 'Liquidate',
  donate: 'Donate',
  scrap: 'Scrap',
  returnless: 'Returnless',
} as const;

export const STATUS_LABELS = {
  requested: 'Requested',
  received: 'At dock',
  graded: 'Graded',
  routed: 'Routed',
  closed: 'Closed',
} as const;

export const GRADE_DESCRIPTIONS = {
  A: 'Unopened or mint; factory seal intact',
  B: 'Opened, complete, light handling wear',
  C: 'Used, scuffed, or missing packaging',
  D: 'Damaged, incomplete, or unsaleable',
} as const;
