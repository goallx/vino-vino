import { productsById } from '../lib/menuStore';
import { DishMedia } from './DishMedia';

/** Small rounded thumbnail of a dish (pizza art or photo) for line items. */
export function DishThumb({ productId, size = 42 }: { productId: string; size?: number }) {
  const product = productsById[productId];
  if (!product) return null;
  return (
    <div className="dthumb" style={{ width: size, height: size }}>
      <DishMedia product={product} size={size} />
    </div>
  );
}
