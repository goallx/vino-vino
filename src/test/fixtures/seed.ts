import { reloadMenu } from '../../lib/menuStore';
import { bundles, categories, customers, products, toppings } from './catalog';

/** Reset storage and load the fixture catalog — call from beforeEach. */
export function seedCatalog(): void {
  localStorage.clear();
  localStorage.setItem('vino:menu', JSON.stringify(products));
  localStorage.setItem('vino:categories', JSON.stringify(categories));
  localStorage.setItem('vino:toppings', JSON.stringify(toppings));
  localStorage.setItem('vino:bundles', JSON.stringify(bundles));
  localStorage.setItem('vino:customers', JSON.stringify(customers));
  reloadMenu();
}
