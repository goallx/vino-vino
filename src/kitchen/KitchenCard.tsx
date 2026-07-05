import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import type { KitchenOrder } from '../types';
import { KitchenLine } from './KitchenLine';

interface KitchenCardProps {
  order: KitchenOrder;
  now: number;
  onStart: (id: string) => void;
  onReady: (id: string) => void;
}

function ageTier(minutes: number): 'fresh' | 'warn' | 'late' {
  if (minutes >= 20) return 'late';
  if (minutes >= 10) return 'warn';
  return 'fresh';
}

// forwardRef: AnimatePresence mode="popLayout" measures exiting cards via ref.
export const KitchenCard = forwardRef<HTMLElement, KitchenCardProps>(function KitchenCard(
  { order, now, onStart, onReady },
  ref
) {
  const minutes = Math.floor((now - order.createdAt) / 60000);
  const tier = ageTier(minutes);
  const timeLabel = minutes < 1 ? 'עכשיו' : `${minutes} ד׳`;
  const typeLabel = order.type === 'delivery' ? 'משלוח' : 'איסוף';
  const itemCount = order.lines.reduce((sum, l) => sum + l.qty, 0);
  const hasDetails = order.customerName || order.phone;

  return (
    <motion.article
      ref={ref}
      layout
      className={`kcard kcard--${tier} ${order.status === 'preparing' ? 'kcard--prep' : ''}`}
      data-testid={`kcard-${order.id}`}
      initial={{ opacity: 0, y: -10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
    >
      <div className="kcard__strip" aria-hidden="true" />
      <header className="kcard__head">
        <span className="kcard__num">#{String(order.number).padStart(2, '0')}</span>
        <span className={`kcard__type kcard__type--${order.type}`}>{typeLabel}</span>
        <span className="kcard__time">⏱ {timeLabel}</span>
      </header>

      {hasDetails && (
        <div className="kcard__cust">
          {order.customerName && <span className="kcard__name">👤 {order.customerName}</span>}
          {order.phone && <span className="kcard__phone">{order.phone}</span>}
          <span className="kcard__count">{itemCount} פריטים</span>
        </div>
      )}

      {order.type === 'delivery' && order.address && (
        <div className="kcard__addr">📍 {order.address}</div>
      )}

      <ul className="kcard__lines">
        {order.lines.map((l) => (
          <KitchenLine key={l.id} line={l} />
        ))}
      </ul>

      {order.note && <p className="kcard__note">“{order.note}”</p>}

      <footer className="kcard__foot">
        {order.status === 'new' ? (
          <motion.button className="kbtn kbtn--start" whileTap={{ scale: 0.97 }} onClick={() => onStart(order.id)}>
            התחל הכנה
          </motion.button>
        ) : (
          <>
            <span className="kbadge">בהכנה</span>
            <motion.button className="kbtn kbtn--ready" whileTap={{ scale: 0.97 }} onClick={() => onReady(order.id)}>
              מוכן ✓
            </motion.button>
          </>
        )}
      </footer>
    </motion.article>
  );
});
