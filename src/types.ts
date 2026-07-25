// All money is integer agorot (₪ × 100) — never floats.
export type Money = number;

export type Target = 'whole' | 'half_1' | 'half_2';
export type OrderType = 'delivery' | 'pickup';
export type PaymentStatus = 'paid' | 'unpaid';
export type PizzaSize = 'personal' | 'family'; // אישית / משפחתית — drives the per-size topping price

export interface Category {
  id: string;
  name: string;
}

export interface Variant {
  id: string;
  label: string; // 'קטן' / 'גדול' / '0.5' / 'משפחתית' / 'אישית'
  price: Money;
  size?: PizzaSize; // on a pizza size variant: which topping-price tier this size bills at
}

export interface Topping {
  id: string;
  name: string;
  price: Money; // legacy/fallback per-portion price (= personal tier)
  pricePersonal?: Money; // per-portion price on an אישית (personal) pizza
  priceFamily?: Money; // per-portion price on a משפחתית (family) pizza
  starter?: boolean; // "opening price": the FIRST starter topping on a pizza bills at the personal rate, even on family
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  basePrice: Money;
  isPizza?: boolean;
  splitCapable?: boolean; // can be built as half / half
  includedToppings?: number; // free toppings per tray/half before charging
  variants?: Variant[]; // size choices — tapping opens the size popover
  art?: string[]; // topping ids depicted on the pizza illustration
  active?: boolean; // owner availability toggle; absent = available
  photoUrl?: string; // Supabase Storage public URL, uploaded from the menu admin
}

// ---- order-side (cart) shapes ----

export interface ToppingSel {
  toppingId: string;
  name: string;
  action: 'add' | 'remove';
  price: Money; // per-portion price; 0 for removals
  qty?: number; // portions for an add: 1 = normal, 2 = extra (כפול). Absent = 1.
}

export interface LinePart {
  target: Target;
  baseProductId: string;
  baseName: string;
  toppings: ToppingSel[];
}

export interface CartLine {
  id: string;
  productId: string;
  name: string; // snapshot for the ticket/kitchen
  qty: number;
  unitPrice: Money;
  isSplit: boolean;
  variantLabel?: string;
  parts: LinePart[]; // [whole] or [half_1, half_2]
  note?: string;
  bundleUid?: string; // set when this line belongs to a fixed-price combo (AppliedCombo.uid)
}

export interface Customer {
  phone: string;
  name?: string;
  address?: string;
}

// ---- deals / bundles ----

export interface BundleItem {
  productId: string;
  qty: number;
  variantLabel?: string; // for a sized item (e.g. משפחתית / גדול) — the size to ring up
}

/**
 * A deal added to an order as a fixed-price combo: its dishes are dropped in as
 * normal (swappable) lines tagged with `uid`, and the order is pinned so those
 * lines' base prices net exactly `price` — extra paid toppings still add on top.
 */
export interface AppliedCombo {
  uid: string;
  bundleId: string;
  label: string; // snapshot of the deal name for the ticket
  price: Money; // the fixed deal price its member lines net to
  freeToppings?: number; // perk: N added-topping portions waived across the combo's pizzas
}

/** A fixed-price combo the owner builds in /deals (e.g. 2 family pizzas for ₪160). */
export interface Bundle {
  id: string;
  name: string;
  items: BundleItem[];
  price: Money; // the deal price for the whole bundle
  active: boolean;
  /**
   * Perk: a pool of free added-topping portions the deal grants across its
   * pizzas, waived best-value-first (priciest first). Absent/0 = no perk.
   * Deals carrying a perk are manual-add only (can't be inferred from a cart).
   */
  freeToppings?: number;
}

/** A bundle once applied to an order — carries the saving as an order-level discount. */
export interface AppliedBundle {
  uid: string; // unique per application, so the same deal can be added twice
  bundleId: string;
  label: string; // snapshot of the bundle name for the ticket
  amount: Money; // saving in agorot (positive)
}

export interface PastOrder {
  id: string;
  date: string; // display label, e.g. 'אתמול'
  total: Money;
  summary: string;
  lines: CartLine[];
}

// ---- kitchen display ----

export type KitchenStatus = 'new' | 'preparing' | 'ready' | 'cancelled';

export interface KitchenOrder {
  id: string;
  number: number;
  type: OrderType;
  payment: PaymentStatus;
  createdAt: number; // epoch ms
  status: KitchenStatus;
  customerName?: string;
  phone?: string;
  address?: string;
  note?: string;
  lines: CartLine[];
  discounts?: AppliedBundle[]; // applied bundle deals; absent = no deal
  deliveryFee?: Money; // agorot; delivery surcharge, absent/0 = none
  total?: Money; // final charged amount; optional for older cached orders
}
