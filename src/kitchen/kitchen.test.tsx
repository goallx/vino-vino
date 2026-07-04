import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Kitchen } from './Kitchen';
import { publishOrder } from '../lib/orderBus';
import type { CartLine, KitchenOrder } from '../types';

const splitPizza: CartLine = {
  id: 'l1', productId: 'b_family', name: 'משפחתית בהרכבה', qty: 1, unitPrice: 6900, isSplit: true,
  parts: [
    { target: 'half_1', baseProductId: 'p_vino', baseName: 'וינו וינו', toppings: [{ toppingId: 't_mushroom', name: 'פטריות', action: 'add', price: 500 }] },
    { target: 'half_2', baseProductId: 'p_shchitut', baseName: 'שחיתות', toppings: [{ toppingId: 't_onion', name: 'בצל', action: 'remove', price: 0 }] },
  ],
};

function order(over: Partial<KitchenOrder> = {}): KitchenOrder {
  return { id: 'k1', number: 7, type: 'delivery', payment: 'unpaid', createdAt: Date.now(), status: 'new', lines: [splitPizza], ...over };
}

beforeEach(() => localStorage.clear());

describe('kitchen board', () => {
  it('shows an empty state when there are no active orders', () => {
    render(<Kitchen />);
    expect(screen.getByText('אין הזמנות פעילות')).toBeInTheDocument();
  });

  it('renders seeded orders with the active count', () => {
    publishOrder(order());
    render(<Kitchen />);
    expect(screen.getByText('#07')).toBeInTheDocument();
    expect(screen.getByText('1 הזמנות פעילות')).toBeInTheDocument();
  });

  it('shows half/half detail with add (green) and remove (red) toppings', () => {
    publishOrder(order());
    render(<Kitchen />);
    expect(screen.getByText('½ וינו וינו')).toBeInTheDocument();
    expect(screen.getByText('½ שחיתות')).toBeInTheDocument();
    const remove = screen.getByText(/בצל/);
    expect(remove).toHaveClass('kingr--remove');
    const add = screen.getByText(/פטריות/);
    expect(add).toHaveClass('kingr--add');
  });

  it('moves an order from new → preparing', async () => {
    const user = userEvent.setup();
    publishOrder(order());
    render(<Kitchen />);
    await user.click(screen.getByRole('button', { name: 'התחל הכנה' }));
    expect(screen.getByText('בהכנה')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /מוכן/ })).toBeInTheDocument();
  });

  it('clears a card from the board when marked ready', async () => {
    const user = userEvent.setup();
    publishOrder(order({ status: 'preparing' }));
    render(<Kitchen />);
    expect(screen.getByText('#07')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /מוכן/ }));
    await waitFor(() => expect(screen.queryByText('#07')).not.toBeInTheDocument());
    expect(screen.getByText('אין הזמנות פעילות')).toBeInTheDocument();
  });

  it('shows an order that arrives live while mounted', async () => {
    render(<Kitchen />);
    expect(screen.getByText('אין הזמנות פעילות')).toBeInTheDocument();
    act(() => publishOrder(order({ id: 'k2', number: 11 })));
    expect(await screen.findByText('#11')).toBeInTheDocument();
  });

  it('shows the order note', () => {
    publishOrder(order({ note: 'פעמון מקולקל' }));
    render(<Kitchen />);
    expect(screen.getByText(/פעמון מקולקל/)).toBeInTheDocument();
  });
});
