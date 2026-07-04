import type { CartLine, ToppingSel } from '../types';
import { productsById } from '../lib/menuStore';

function Toppings({ list }: { list: ToppingSel[] }) {
  if (!list.length) return null;
  return (
    <span className="ktops">
      {list.map((t, i) => (
        <span key={i} className={`kingr kingr--${t.action}`}>
          {t.action === 'add' ? '+' : '−'}
          {t.name}
        </span>
      ))}
    </span>
  );
}

export function KitchenLine({ line }: { line: CartLine }) {
  const product = productsById[line.productId];
  const isPizza = product?.isPizza;
  const wholeToppings = !line.isSplit ? line.parts[0]?.toppings ?? [] : [];

  return (
    <li className="kline">
      <div className="kline__head">
        <span className="kline__qty">{line.qty}×</span>
        <span className="kline__name">
          {line.name}
          {line.variantLabel ? ` · ${line.variantLabel}` : ''}
        </span>
        {line.isSplit && <span className="kline__split">חצי / חצי</span>}
      </div>

      {isPizza && line.isSplit && (
        <div className="kline__halves">
          {(['half_1', 'half_2'] as const).map((target) => {
            const part = line.parts.find((p) => p.target === target);
            if (!part) return null;
            return (
              <div className="khalf" key={target}>
                <span className="khalf__base">½ {part.baseName}</span>
                <Toppings list={part.toppings} />
              </div>
            );
          })}
        </div>
      )}

      {isPizza && !line.isSplit && wholeToppings.length > 0 && (
        <div className="kline__toppings">
          <Toppings list={wholeToppings} />
        </div>
      )}

      {line.note && <p className="kline__note">“{line.note}”</p>}
    </li>
  );
}
