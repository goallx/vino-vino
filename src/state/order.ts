import { useEffect, useReducer } from 'react';
import type { AppliedBundle, CartLine, OrderType, PaymentStatus } from '../types';
import { orderTotals } from '../lib/cart';

export interface OrderState {
  lines: CartLine[];
  discounts: AppliedBundle[];
  type: OrderType;
  payment: PaymentStatus;
  paymentMethod: 'cash' | 'card';
  phone: string;
  name: string;
  address: string;
  note: string;
}

export const emptyOrder: OrderState = {
  lines: [],
  discounts: [],
  type: 'delivery',
  payment: 'unpaid',
  paymentMethod: 'cash',
  phone: '',
  name: '',
  address: '',
  note: '',
};

export type Action =
  | { kind: 'addLine'; line: CartLine }
  | { kind: 'updateLine'; line: CartLine }
  | { kind: 'setQty'; id: string; qty: number }
  | { kind: 'removeLine'; id: string }
  | { kind: 'restoreLine'; line: CartLine; index: number }
  | { kind: 'applyBundle'; lines: CartLine[]; discount: AppliedBundle }
  | { kind: 'removeDiscount'; uid: string }
  | { kind: 'setField'; field: keyof OrderState; value: string }
  | { kind: 'loadLines'; lines: CartLine[] }
  | { kind: 'reset' };

/** Identity of a line ignoring id + qty, used to merge duplicate taps. */
function signature(line: CartLine): string {
  const parts = line.parts
    .map((p) => `${p.target}:${p.baseProductId}:${p.toppings.map((t) => t.action + t.toppingId).sort().join(',')}`)
    .join('|');
  return `${line.productId}#${line.variantLabel ?? ''}#${line.isSplit ? 'S' : 'W'}#${parts}#${line.note ?? ''}`;
}

export function reducer(state: OrderState, action: Action): OrderState {
  switch (action.kind) {
    case 'addLine': {
      const sig = signature(action.line);
      const existing = state.lines.find((l) => signature(l) === sig);
      if (existing) {
        return { ...state, lines: state.lines.map((l) => (l === existing ? { ...l, qty: l.qty + action.line.qty } : l)) };
      }
      return { ...state, lines: [...state.lines, action.line] };
    }
    case 'updateLine':
      return { ...state, lines: state.lines.map((l) => (l.id === action.line.id ? action.line : l)) };
    case 'setQty':
      return {
        ...state,
        lines: state.lines.flatMap((l) =>
          l.id === action.id ? (action.qty <= 0 ? [] : [{ ...l, qty: action.qty }]) : [l]
        ),
      };
    case 'removeLine':
      return { ...state, lines: state.lines.filter((l) => l.id !== action.id) };
    case 'restoreLine': {
      const lines = [...state.lines];
      lines.splice(action.index, 0, action.line);
      return { ...state, lines };
    }
    case 'applyBundle':
      return {
        ...state,
        lines: [...state.lines, ...action.lines],
        discounts: [...state.discounts, action.discount],
      };
    case 'removeDiscount':
      return { ...state, discounts: state.discounts.filter((d) => d.uid !== action.uid) };
    case 'setField':
      return { ...state, [action.field]: action.value };
    case 'loadLines':
      return { ...state, lines: action.lines };
    case 'reset':
      return emptyOrder;
    default:
      return state;
  }
}

const DRAFT_KEY = 'vino:draft-order';

function loadDraft(): OrderState {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...emptyOrder, ...(JSON.parse(raw) as OrderState) };
  } catch {
    /* ignore corrupt draft */
  }
  return emptyOrder;
}

export function useOrder() {
  const [state, dispatch] = useReducer(reducer, undefined, loadDraft);

  // Autosave the draft so a refresh or dropped connection mid-call loses nothing.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
      } catch {
        /* storage full / unavailable — non-fatal */
      }
    }, 250);
    return () => clearTimeout(id);
  }, [state]);

  const { subtotal, discount: discountTotal, total } = orderTotals(state.lines, state.discounts);

  return { state, dispatch, subtotal, discountTotal, total };
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
