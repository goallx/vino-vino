import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu } from './components/Menu';
import { Wordmark } from './components/Wordmark';
import { Ticket } from './components/Ticket';
import { Checkout } from './components/Checkout';
import { useOrder, clearDraft } from './state/order';
import type { Bundle, CartLine, PastOrder, Product, Variant } from './types';
import { combosAsDiscounts, computeUnitPrice, newLineId, wholePart } from './lib/cart';
import { bundleApplication } from './lib/bundles';
import { getByPhone, searchByPhonePrefix, searchByAddress, recordOrder, type StoredCustomer } from './lib/customers';
import { productsById } from './lib/menuStore';
import { saveOrder } from './lib/saveOrder';
import { loadOrders, publishOrder, subscribe } from './lib/orderBus';
import { currentShiftStart } from './lib/shifts';

// These overlays are not needed for the first paint. Loading them on demand
// keeps their editor code (and animation dependency) off the order-entry path.
const PizzaBuilder = lazy(() => import('./components/PizzaBuilder').then((m) => ({ default: m.PizzaBuilder })));
const SaladBuilder = lazy(() => import('./components/SaladBuilder').then((m) => ({ default: m.SaladBuilder })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })));

// Salads open a dedicated editor (base removals + seasoning + extras) instead
// of the pizza builder.
const isSaladProduct = (p: Product): boolean => p.categoryId === 'salads';

interface BuilderTarget {
  product: Product;
  editing?: CartLine;
}
interface UndoState {
  line: CartLine;
  index: number;
}
interface Toast {
  text: string;
  tone: 'ok' | 'undo';
}

interface AppProps {
  username?: string;
}

export default function App({ username }: AppProps = {}) {
  const { state, dispatch, subtotal, discountTotal, total } = useOrder();
  const [builder, setBuilder] = useState<BuilderTarget | null>(null);
  const [match, setMatch] = useState<{ name?: string; past: PastOrder[] } | null>(null);
  const [dismissedMatch, setDismissedMatch] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // 'build' = menu + ticket; 'checkout' = full-width customer step (no modal —
  // it sits clear of the tablet keyboard). Send/new-order return to 'build'.
  const [phase, setPhase] = useState<'build' | 'checkout'>('build');
  const undoRef = useRef<UndoState | null>(null);

  // The chit number mirrors the DB's daily_number (max of the shift's orders +
  // 1) instead of a device-local counter, so the entry screen and the kitchen
  // board always agree — even across devices. The window is the current shift
  // (since the last "סגירת משמרת", or midnight): closing a shift bumps
  // `shiftStart`, which restarts numbering from #01. `shiftStart` is state so a
  // close re-derives the number even though `orders` hasn't changed.
  const [orders, setOrders] = useState(loadOrders);
  const [shiftStart, setShiftStart] = useState(currentShiftStart);
  useEffect(() => {
    setOrders(loadOrders());
    return subscribe(setOrders);
  }, []);
  const orderNumber = useMemo(
    () =>
      orders
        .filter((o) => o.createdAt >= shiftStart)
        .reduce((max, o) => Math.max(max, o.number), 0) + 1,
    [orders, shiftStart],
  );

  // Exact phone → reorder panel
  useEffect(() => {
    const rec = getByPhone(state.phone);
    setMatch(rec && !dismissedMatch ? { name: rec.name, past: rec.past } : null);
  }, [state.phone, dismissedMatch]);

  // Partial phone → autocomplete suggestions (hidden once an exact match shows)
  const suggestions = useMemo(
    () => (match ? [] : searchByPhonePrefix(state.phone)),
    [match, state.phone],
  );

  // Partial address → autocomplete from previously-saved delivery addresses
  const addressSuggestions = useMemo(
    () =>
      state.type === 'delivery'
        ? searchByAddress(state.address).filter(
            (s) => s.address.toLowerCase() !== state.address.trim().toLowerCase(),
          )
        : [],
    [state.address, state.type],
  );

  // Dev-only QA helper: ?demo=builder | ?demo=order
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const demo = new URLSearchParams(window.location.search).get('demo');
    if (demo === 'builder') {
      const fam = productsById['b_family'];
      if (fam) setBuilder({ product: fam });
    } else if (demo === 'order') {
      dispatch({ kind: 'loadLines', lines: demoLines() });
      dispatch({ kind: 'setField', field: 'phone', value: '0501234567' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), tone === 'undo' ? 4000 : 1800);
  }, []);

  const addProduct = useCallback((product: Product, variant?: Variant) => {
    const line: CartLine = {
      id: newLineId(),
      productId: product.id,
      name: product.name,
      qty: 1,
      unitPrice: 0,
      isSplit: false,
      variantLabel: variant?.label,
      parts: product.isPizza || isSaladProduct(product) ? [wholePart(product)] : [],
    };
    line.unitPrice = computeUnitPrice(line);
    dispatch({ kind: 'addLine', line });
    flash(`${product.name} נוסף`);
  }, [dispatch, flash]);

  const openBuilder = useCallback((product: Product) => setBuilder({ product }), []);

  // Add a deal's dishes to the cart; the auto-detect (detectBundles) then
  // applies its saving. The owner tweaks each pizza's toppings via the ticket.
  const addBundle = useCallback((bundle: Bundle) => {
    const { lines, combo } = bundleApplication(bundle);
    dispatch({ kind: 'addCombo', lines, combo });
    flash(`מבצע "${bundle.name}" נוסף`);
  }, [dispatch, flash]);

  function confirmBuilder(line: CartLine) {
    if (builder?.editing) {
      dispatch({ kind: 'updateLine', line });
    } else {
      dispatch({ kind: 'addLine', line });
      flash(`${line.name} נוסף`);
    }
    setBuilder(null);
  }

  function removeLine(line: CartLine) {
    const index = state.lines.findIndex((l) => l.id === line.id);
    undoRef.current = { line, index };
    dispatch({ kind: 'removeLine', id: line.id });
    flash('פריט הוסר · בטל', 'undo');
  }

  function undo() {
    const u = undoRef.current;
    if (!u) return;
    dispatch({ kind: 'restoreLine', line: u.line, index: u.index });
    undoRef.current = null;
    setToast(null);
  }

  function clonePast(order: PastOrder) {
    const lines = order.lines.map((l) => ({ ...l, id: newLineId() }));
    dispatch({ kind: 'loadLines', lines });
    const rec = getByPhone(state.phone);
    if (rec) {
      dispatch({ kind: 'setField', field: 'name', value: rec.name ?? '' });
      dispatch({ kind: 'setField', field: 'address', value: rec.address ?? '' });
    }
    setMatch(null);
    flash('ההזמנה שוכפלה');
  }

  // Returning-customer row tap: fill their name/address without touching the
  // order lines (a fresh order for a known customer). Cloning stays on שכפל.
  function useMatchedCustomer() {
    const rec = getByPhone(state.phone);
    if (!rec) return;
    dispatch({ kind: 'setField', field: 'name', value: rec.name ?? '' });
    dispatch({ kind: 'setField', field: 'address', value: rec.address ?? '' });
  }

  function pickCustomer(c: StoredCustomer) {
    dispatch({ kind: 'setField', field: 'phone', value: c.phone });
    dispatch({ kind: 'setField', field: 'name', value: c.name ?? '' });
    dispatch({ kind: 'setField', field: 'address', value: c.address ?? '' });
    setDismissedMatch(false);
  }

  function newOrder() {
    clearDraft();
    dispatch({ kind: 'reset' });
    setDismissedMatch(false);
    setPhase('build');
  }

  // A closed shift starts a fresh day: clear the ticket and re-read the boundary
  // so the next order is #01. lib/shifts already persisted the close + snapshot.
  function onShiftClosed() {
    newOrder();
    setShiftStart(currentShiftStart());
  }

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      const result = await saveOrder(state, orderNumber);
      if (!result.ok) {
        flash('שמירה נכשלה — נסה שוב');
        return;
      }
      const allDiscounts = [...state.discounts, ...combosAsDiscounts(state.lines, state.combos)];
      publishOrder({
        id: `o_${Date.now()}_${orderNumber}`,
        number: result.orderNumber,
        type: state.type,
        payment: state.payment,
        createdAt: Date.now(),
        status: 'new',
        customerName: state.name || undefined,
        phone: state.phone || undefined,
        address: state.type === 'delivery' ? state.address || undefined : undefined,
        note: state.note || undefined,
        lines: state.lines,
        discounts: allDiscounts.length ? allDiscounts : undefined,
        deliveryFee: state.deliveryFee || undefined,
        total,
      });
      // remember the customer by phone for next time
      recordOrder({ phone: state.phone, name: state.name, address: state.address, lines: state.lines, total });
      clearDraft();
      dispatch({ kind: 'reset' });
      setDismissedMatch(false);
      setPhase('build');
      flash(`הזמנה #${String(result.orderNumber).padStart(2, '0')} נשלחה למטבח`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <Wordmark className="brand" />
        <span className="topbar__sub">קבלת הזמנות</span>
        <a className="topbar__link topbar__link--push" href="/kitchen">
          מסך מטבח
        </a>
        <button className="topbar__link" onClick={() => setSettingsOpen(true)}>
          ⚙ הגדרות
        </button>
      </header>

      <main className={`stage ${phase === 'checkout' ? 'stage--checkout' : ''}`}>
        {phase === 'build' ? (
          <>
            <Menu onAddProduct={addProduct} onOpenBuilder={openBuilder} onAddBundle={addBundle} />
            <Ticket
              state={state}
              setQty={(id, qty) => dispatch({ kind: 'setQty', id, qty })}
              subtotal={subtotal}
              discountTotal={discountTotal}
              total={total}
              orderNumber={orderNumber}
              onEditLine={(l) => setBuilder({ product: { id: l.productId } as Product, editing: l })}
              onRemoveLine={removeLine}
              onRemoveCombo={(uid) => dispatch({ kind: 'removeCombo', uid })}
              onContinue={() => setPhase('checkout')}
              onNewOrder={newOrder}
              canContinue={state.lines.length > 0}
            />
          </>
        ) : (
          <Checkout
            state={state}
            setField={(field, value) => dispatch({ kind: 'setField', field, value })}
            subtotal={subtotal}
            discountTotal={discountTotal}
            total={total}
            orderNumber={orderNumber}
            onBack={() => setPhase('build')}
            onSend={send}
            onSetDeliveryFee={(fee) => dispatch({ kind: 'setDeliveryFee', fee })}
            canSend={state.lines.length > 0}
            sending={sending}
            match={match}
            onClonePast={clonePast}
            onUseMatchedCustomer={useMatchedCustomer}
            onDismissMatch={() => setDismissedMatch(true)}
            suggestions={suggestions}
            onPickCustomer={pickCustomer}
            addressSuggestions={addressSuggestions}
            onPickAddress={(address) => dispatch({ kind: 'setField', field: 'address', value: address })}
          />
        )}
      </main>

      <Suspense fallback={null}>
        {settingsOpen && (
          <SettingsModal
            username={username}
            onShiftClosed={onShiftClosed}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {builder && (isSaladProduct(resolveBuilderProduct(builder)) ? (
          <SaladBuilder
            product={resolveBuilderProduct(builder)}
            editing={builder.editing}
            onCancel={() => setBuilder(null)}
            onConfirm={confirmBuilder}
          />
        ) : (
          <PizzaBuilder
            product={resolveBuilderProduct(builder)}
            editing={builder.editing}
            onCancel={() => setBuilder(null)}
            onConfirm={confirmBuilder}
          />
        ))}
      </Suspense>

      {toast && (
          <div className={`toast toast--${toast.tone}`} role="status">
            <span>{toast.text}</span>
            {toast.tone === 'undo' && <button onClick={undo}>בטל</button>}
          </div>
      )}
    </div>
  );
}

// When editing, we only have the line; resolve the real product for the builder.
function resolveBuilderProduct(b: BuilderTarget): Product {
  return productsById[b.product.id] ?? b.product;
}

// Dev-only sample order for ?demo=order.
function demoLines(): CartLine[] {
  const split: CartLine = {
    id: newLineId(),
    productId: 'b_family',
    name: productsById['b_family'].name,
    qty: 1,
    unitPrice: 0,
    isSplit: true,
    parts: [
      { target: 'half_1', baseProductId: 'p_vino', baseName: 'וינו וינו', toppings: [{ toppingId: 't_mushroom', name: 'פטריות', action: 'add', price: 500 }] },
      { target: 'half_2', baseProductId: 'p_shchitut', baseName: 'שחיתות', toppings: [] },
    ],
  };
  split.unitPrice = computeUnitPrice(split);
  const coke: CartLine = {
    id: newLineId(),
    productId: 'd_coke',
    name: productsById['d_coke'].name,
    qty: 2,
    unitPrice: productsById['d_coke'].basePrice,
    isSplit: false,
    parts: [],
  };
  return [split, coke];
}
