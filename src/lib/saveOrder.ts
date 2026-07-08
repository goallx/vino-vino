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
/** A row was rejected because the delivery_fee column isn't in the DB yet. */
function isMissingDeliveryFeeColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42703' || // Postgres: undefined_column
    error.code === 'PGRST204' || // PostgREST: column not found in schema cache
    (error.message?.includes('delivery_fee') ?? false)
  );
}

export async function saveOrder(state: OrderState, orderNumber: number): Promise<SaveResult> {
  const { subtotal, discount, total } = orderTotals(state.lines, state.discounts, state.deliveryFee);

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
    delivery_fee: state.deliveryFee,
    note: state.note || null,
    // KitchenOrder snapshot — the kitchen board and reports render these
    // directly off the row, pushed whole over realtime.
    lines: state.lines,
    discounts: state.discounts.length ? state.discounts : null,
  };

  const insert = (payload: object) => db.from('orders').insert(payload).select('id, daily_number').single();
  let payload: object = row;
  let { data: order, error } = await insert(payload);

  // Older DB without the delivery_fee column yet (migration not applied) — drop
  // the column and retry so sending never breaks. The fee is already folded
  // into `total`, so the money saved stays correct either way.
  if (isMissingDeliveryFeeColumn(error)) {
    const rest = { ...row } as Partial<typeof row>;
    delete rest.delivery_fee;
    payload = rest;
    ({ data: order, error } = await insert(payload));
  }

  if (error?.code === '23505') {
    // two devices raced for the same daily_number — the trigger recomputes on retry
    ({ data: order, error } = await insert(payload));
  }

  if (error || !order) {
    console.error('[vino] failed to save order', error);
    return { ok: false, persisted: 'supabase', orderNumber };
  }

  // Batched: one insert per table instead of one round-trip per line/part/
  // topping — a big order was taking ~2s to send over sequential requests.
  const lineRows = state.lines.map((line) => {
    const unit = computeUnitPrice(line);
    return {
      order_id: order.id,
      product_id: line.productId,
      name_snapshot: line.name,
      qty: line.qty,
      is_split: line.isSplit,
      unit_price: unit,
      line_total: unit * line.qty,
      note: line.note ?? null,
    };
  });
  const { data: insertedLines, error: linesError } = await db
    .from('order_lines')
    .insert(lineRows)
    .select('id');
  if (linesError) console.error('[vino] failed to save order lines', linesError);

  const partRows: object[] = [];
  const optionRows: object[] = [];
  state.lines.forEach((line, i) => {
    const lineId = insertedLines?.[i]?.id; // PostgREST returns rows in insert order
    if (!lineId) return;
    for (const part of line.parts) {
      partRows.push({
        order_line_id: lineId,
        target: part.target,
        base_product_id: part.baseProductId,
        base_name_snapshot: part.baseName,
        base_price: 0,
      });
      for (const t of part.toppings) {
        optionRows.push({
          order_line_id: lineId,
          label_snapshot: t.name,
          target: part.target,
          action: t.action,
          price_delta: t.price,
        });
      }
    }
  });
  await Promise.all([
    partRows.length ? db.from('order_line_parts').insert(partRows) : null,
    optionRows.length ? db.from('order_line_options').insert(optionRows) : null,
  ]);

  return { ok: true, persisted: 'supabase', orderNumber: order.daily_number ?? orderNumber };
}
