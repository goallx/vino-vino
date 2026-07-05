import type { Product } from '../types';
import { PizzaArt } from './PizzaArt';
import { photos } from '../data/photos';

interface DishMediaProps {
  product: Product;
  size?: number;
}

/** Pizza → SVG illustration; other dishes → real Wolt photo; else a branded tile. */
export function DishMedia({ product, size = 104 }: DishMediaProps) {
  if (product.isPizza) {
    return (
      <div className="dish dish--art">
        <PizzaArt whole={product.art ?? []} size={size} />
      </div>
    );
  }
  const photo = photos[product.id];
  if (photo) {
    return (
      <div className="dish dish--photo">
        <img src={photo} alt="" loading="lazy" decoding="async" />
      </div>
    );
  }
  return (
    <div className="dish dish--ph" aria-hidden="true">
      <svg viewBox="0 0 40 40" width="40" height="40">
        <path d="M20 5 L33 33 H7 Z" fill="#e7dccb" stroke="#caa15c" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="20" cy="22" r="2.2" fill="#caa15c" />
        <circle cx="16" cy="28" r="1.6" fill="#caa15c" />
        <circle cx="24" cy="28" r="1.6" fill="#caa15c" />
      </svg>
    </div>
  );
}
