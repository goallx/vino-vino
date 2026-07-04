import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu } from './components/Menu';
import { Wordmark } from './components/Wordmark';
import { Ticket } from './components/Ticket';
import { PizzaBuilder } from './components/PizzaBuilder';
import { useOrder, clearDraft } from './state/order';
import type { Bundle, CartLine, PastOrder, Product, Variant } from './types';
import { computeUnitPrice, newLineId, wholePart } from './lib/cart';
import { bundleApplication } from './lib/bundles';
import { getByPhone, searchByPhonePrefix, searchByAddress, recordOrder, type StoredCustomer } from './lib/customers';
import { productsById } from './lib/menuStore';
import { saveOrder } from './lib/saveOrder';
import { publishOrder } from './lib/orderBus';

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
  onSignOut?: () => void;
}

export default function App({ username, onSignOut }: AppProps = {}) {
  const { state, dispatch, subtotal, discountTotal, total } = useOrder();
  const [builder, setBuilder] = useState<BuilderTarget | null>(null);
  const [match, setMatch] = useState<{ name?: string; past: PastOrder[] } | null>(null);
  const [dismissedMatch, setDismissedMatch] = useState(false);
  const [orderNumber, setOrderNumber] = useState(() => Number(localStorage.getItem('vino:next-number') ?? '1'));
  const [toast, setToast] = useState<Toast | null>(null);
  const undoRef = useRef<UndoState | null>(null);

  // Exact phone → reorder panel
  useEffect(() => {
    const rec = getByPhone(state.phone);
    setMatch(rec && !dismissedMatch ? { name: rec.name, past: rec.past } : null);
  }, [state.phone, dismissedMatch]);

  // Partial phone → autocomplete suggestions (hidden once an exact match shows)
  const suggestions = match ? [] : searchByPhonePrefix(state.phone);

  // Partial address → autocomplete from previously-saved delivery addresses
  const addressSuggestions =
    state.type === 'delivery'
      ? searchByAddress(state.address).filter((s) => s.address.toLowerCase() !== state.address.trim().toLowerCase())
      : [];

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

  function flash(text: string, tone: Toast['tone'] = 'ok') {
    setToast({ text, tone });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), tone === 'undo' ? 4000 : 1800);
  }

  function addProduct(product: Product, variant?: Variant) {
    const line: CartLine = {
      id: newLineId(),
      productId: product.id,
      name: product.name,
      qty: 1,
      unitPrice: 0,
      isSplit: false,
      variantLabel: variant?.label,
      parts: product.isPizza ? [wholePart(product)] : [],
    };
    line.unitPrice = computeUnitPrice(line);
    dispatch({ kind: 'addLine', line });
    flash(`${product.name} נוסף`);
  }

  function applyBundle(bundle: Bundle) {
    const { lines, discount } = bundleApplication(bundle);
    if (lines.length === 0) return;
    dispatch({ kind: 'applyBundle', lines, discount });
    flash(`מבצע ${bundle.name} נוסף`);
  }

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
  }

  async function send() {
    const result = await saveOrder(state, orderNumber);
    if (!result.ok) {
      flash('שמירה נכשלה — נסה שוב');
      return;
    }
    publishOrder({
      id: `o_${Date.now()}_${orderNumber}`,
      number: orderNumber,
      type: state.type,
      payment: state.payment,
      createdAt: Date.now(),
      status: 'new',
      customerName: state.name || undefined,
      phone: state.phone || undefined,
      address: state.type === 'delivery' ? state.address || undefined : undefined,
      note: state.note || undefined,
      lines: state.lines,
      discounts: state.discounts.length ? state.discounts : undefined,
    });
    // remember the customer by phone for next time
    recordOrder({ phone: state.phone, name: state.name, address: state.address, lines: state.lines, total });
    const next = orderNumber + 1;
    setOrderNumber(next);
    localStorage.setItem('vino:next-number', String(next));
    clearDraft();
    dispatch({ kind: 'reset' });
    setDismissedMatch(false);
    flash(`הזמנה #${String(orderNumber).padStart(2, '0')} נשלחה למטבח`);
  }

  return (
    <div className="app">
      <header className="topbar">
        <Wordmark className="brand" />
        <span className="topbar__sub">קבלת הזמנות</span>
        <a className="topbar__link topbar__link--push" href="/deals" target="_blank" rel="noreferrer">תפריט ומבצעים ↗</a>
        <a className="topbar__link" href="/orders" target="_blank" rel="noreferrer">הזמנות ↗</a>
        <a className="topbar__link" href="/reports" target="_blank" rel="noreferrer">דוח יומי ↗</a>
        <a className="topbar__link" href="/kitchen" target="_blank" rel="noreferrer">מסך מטבח ↗</a>
        {onSignOut && (
          <button className="topbar__link topbar__signout" onClick={onSignOut}>
            {username ? `${username} · יציאה` : 'יציאה'}
          </button>
        )}
      </header>

      <main className="stage">
        <Menu onAddProduct={addProduct} onOpenBuilder={(p) => setBuilder({ product: p })} onApplyBundle={applyBundle} />
        <Ticket
          state={state}
          setField={(field, value) => dispatch({ kind: 'setField', field, value })}
          setQty={(id, qty) => dispatch({ kind: 'setQty', id, qty })}
          subtotal={subtotal}
          discountTotal={discountTotal}
          total={total}
          onRemoveDiscount={(uid) => dispatch({ kind: 'removeDiscount', uid })}
          orderNumber={orderNumber}
          onEditLine={(l) => setBuilder({ product: { id: l.productId } as Product, editing: l })}
          onRemoveLine={removeLine}
          onSend={send}
          onNewOrder={newOrder}
          match={match}
          onClonePast={clonePast}
          onDismissMatch={() => setDismissedMatch(true)}
          suggestions={suggestions}
          onPickCustomer={pickCustomer}
          addressSuggestions={addressSuggestions}
          onPickAddress={(address) => dispatch({ kind: 'setField', field: 'address', value: address })}
          canSend={state.lines.length > 0}
        />
      </main>

      <AnimatePresence>
        {builder && (
          <PizzaBuilder
            key="builder"
            product={resolveBuilderProduct(builder)}
            editing={builder.editing}
            onCancel={() => setBuilder(null)}
            onConfirm={confirmBuilder}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            className={`toast toast--${toast.tone}`}
            role="status"
            initial={{ opacity: 0, y: 24, x: '50%' }}
            animate={{ opacity: 1, y: 0, x: '50%' }}
            exit={{ opacity: 0, y: 16, x: '50%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <span>{toast.text}</span>
            {toast.tone === 'undo' && <button onClick={undo}>בטל</button>}
          </motion.div>
        )}
      </AnimatePresence>
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
