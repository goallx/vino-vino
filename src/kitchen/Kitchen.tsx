import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { loadOrders, subscribe, setStatus } from '../lib/orderBus';
import { KitchenCard } from './KitchenCard';
import { Wordmark } from '../components/Wordmark';
import { seedKitchenDemo } from './sampleKitchen';

interface KitchenProps {
  onSignOut?: () => void;
}

export function Kitchen({ onSignOut }: KitchenProps = {}) {
  const [orders, setOrders] = useState(loadOrders);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')) {
      seedKitchenDemo();
    }
    setOrders(loadOrders());
    return subscribe(setOrders);
  }, []);

  // Keep the aging timers moving without re-fetching orders.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const active = orders
    .filter((o) => o.status !== 'ready' && o.status !== 'cancelled')
    .sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="kitchen">
      <header className="ktop">
        <span className="ktop__brand"><Wordmark /> · מטבח</span>
        <span className="ktop__count">{active.length} הזמנות פעילות</span>
        <a className="ktop__link" href="/">← קבלת הזמנות</a>
        {onSignOut && <button className="ktop__link" onClick={onSignOut}>יציאה</button>}
      </header>

      {active.length === 0 ? (
        <div className="kempty">
          <p>אין הזמנות פעילות</p>
          <span>הזמנות חדשות יופיעו כאן אוטומטית</span>
        </div>
      ) : (
        <main className="kboard">
          <AnimatePresence mode="popLayout">
            {active.map((o) => (
              <KitchenCard
                key={o.id}
                order={o}
                now={now}
                onStart={(id) => setStatus(id, 'preparing')}
                onReady={(id) => setStatus(id, 'ready')}
              />
            ))}
          </AnimatePresence>
        </main>
      )}
    </div>
  );
}
