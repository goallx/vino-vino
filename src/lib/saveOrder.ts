import type { OrderState } from '../state/order';
import { computeUnitPrice, orderTotals } from './cart';
import { supabase, isSupabaseEnabled } from './supabase';

export interface SaveResult {
  ok: boolean;
  persisted: 'supabase' | 'local';
  orderNumber: number;
}

/**
 * Persist a finished order. When Supabase is configured it writes orders +
 * order_lines + order_line_options + order_line_parts; otherwise it logs the
 * payload locally so the entry flow is fully testable before the DB exists.
 */
export async function saveOrder(state: OrderState, orderNumber: number): Promise<SaveResult> {
  const { subtotal, discount, total } = orderTotals(state.lines, state.discounts);

  if (!isSupabaseEnabled || !supabase) {
    // eslint-disable-next-line no-console
    console.info('[vino] order saved locally (no Supabase configured)', { orderNumber, state, subtotal, discount, total });
    return { ok: true, persisted: 'local', orderNumber };
  }
  const db = supabase;

  const row = {
    type: state.type,
    status: 'new',
    channel: 'phone',
    customer_name: state.name || null,
    customer_phone: state.phone || null,
    address: state.type === 'delivery' ? state.address || null : null,
    payment_status: state.payment,
    payment_method: state.paymentMethod,
    subtotal,
    discount,
    total,
    note: state.note || null,
    // KitchenOrder snapshot — the kitchen board and reports render these
    // directly off the row, pushed whole over realtime.
    lines: state.lines,
    discounts: state.discounts.length ? state.discounts : null,
  };

  const insert = () => db.from('orders').insert(row).select('id, daily_number').single();
  let { data: order, error } = await insert();
  if (error?.code === '23505') {
    // two devices raced for the same daily_number — the trigger recomputes on retry
    ({ data: order, error } = await insert());
  }

  if (error || !order) {
    console.error('[vino] failed to save order', error);
    return { ok: false, persisted: 'supabase', orderNumber };
  }

  for (const line of state.lines) {
    const unit = computeUnitPrice(line);
    const { data: row } = await supabase
      .from('order_lines')
      .insert({
        order_id: order.id,
        product_id: line.productId,
        name_snapshot: line.name,
        qty: line.qty,
        is_split: line.isSplit,
        unit_price: unit,
        line_total: unit * line.qty,
        note: line.note ?? null,
      })
      .select('id')
      .single();

    if (!row) continue;
    for (const part of line.parts) {
      await supabase.from('order_line_parts').insert({
        order_line_id: row.id,
        target: part.target,
        base_product_id: part.baseProductId,
        base_name_snapshot: part.baseName,
        base_price: 0,
      });
      for (const t of part.toppings) {
        await supabase.from('order_line_options').insert({
          order_line_id: row.id,
          label_snapshot: t.name,
          target: part.target,
          action: t.action,
          price_delta: t.price,
        });
      }
    }
  }

  return { ok: true, persisted: 'supabase', orderNumber: order.daily_number ?? orderNumber };
}
