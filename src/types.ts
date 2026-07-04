// All money is integer agorot (₪ × 100) — never floats.
export type Money = number;

export type Target = 'whole' | 'half_1' | 'half_2';
export type OrderType = 'delivery' | 'pickup';
export type PaymentStatus = 'paid' | 'unpaid';

export interface Category {
  id: string;
  name: string;
}

export interface Variant {
  id: string;
  label: string; // 'קטן' / 'גדול' / '0.5'
  price: Money;
}

export interface Topping {
  id: string;
  name: string;
  price: Money; // charged once the included count is used up
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
}

// ---- order-side (cart) shapes ----

export interface ToppingSel {
  toppingId: string;
  name: string;
  action: 'add' | 'remove';
  price: Money; // 0 for removals and for included adds
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
}

/** A fixed-price combo the owner builds in /deals (e.g. 2 family pizzas for ₪160). */
export interface Bundle {
  id: string;
  name: string;
  items: BundleItem[];
  price: Money; // the deal price for the whole bundle
  active: boolean;
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
}
