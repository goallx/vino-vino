import type { PastOrder } from '../types';
import { shekels } from '../lib/money';

interface ReorderPanelProps {
  customerName?: string;
  past: PastOrder[];
  onClone: (order: PastOrder) => void;
  onDismiss: () => void;
}

export function ReorderPanel({ customerName, past, onClone, onDismiss }: ReorderPanelProps) {
  return (
    <div className="reorder">
      <div className="reorder__head">
        <span className="reorder__title">
          חוזר{customerName ? `: ${customerName}` : ''} · הזמנות קודמות
        </span>
        <button className="reorder__x" onClick={onDismiss} aria-label="סגור">✕</button>
      </div>
      <ul className="reorder__list">
        {past.map((o) => (
          <li key={o.id} className="reorder__item">
            <div className="reorder__info">
              <span className="reorder__date">{o.date}</span>
              <span className="reorder__summary">{o.summary}</span>
            </div>
            <div className="reorder__right">
              <span className="reorder__total">{shekels(o.total)}</span>
              <button className="btn btn--mini" onClick={() => onClone(o)}>שכפל</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
