import { describe, it, expect, beforeEach } from 'vitest';
import { seedCatalog } from '../test/fixtures/seed';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Kitchen } from './Kitchen';
import { publishOrder } from '../lib/orderBus';
import { addTimerPreset } from '../lib/timerPresets';
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

beforeEach(seedCatalog);

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

  it('moves an order from new → preparing (no timer)', async () => {
    const user = userEvent.setup();
    publishOrder(order());
    render(<Kitchen />);
    await user.click(screen.getByRole('button', { name: 'התחל בלי טיימר' }));
    expect(screen.getByRole('button', { name: /מוכן/ })).toBeInTheDocument();
    // started without a timer → offers to add one, no countdown yet
    expect(screen.getByRole('button', { name: '+ טיימר' })).toBeInTheDocument();
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

  it('shows the final total and a delivery fee when charged', () => {
    publishOrder(order({ deliveryFee: 1000, total: 7900 }));
    render(<Kitchen />);
    expect(screen.getByText('₪79')).toBeInTheDocument();
    expect(screen.getByText('דמי משלוח +₪10')).toBeInTheDocument();
  });
});

describe('kitchen prep timers', () => {
  it('tapping a preset starts prep and shows a countdown', async () => {
    const user = userEvent.setup();
    publishOrder(order());
    const { container } = render(<Kitchen />);
    await user.click(screen.getByRole('button', { name: '10׳' }));
    const pill = container.querySelector('.ktimer');
    expect(pill).toBeTruthy();
    expect(pill!.textContent).toMatch(/\d+:\d\d/); // e.g. 10:00
    expect(screen.getByRole('button', { name: /מוכן/ })).toBeInTheDocument();
  });

  it('shows the defaults 5/10/15 plus any saved custom time', async () => {
    const user = userEvent.setup();
    publishOrder(order());
    render(<Kitchen />);
    ['5׳', '10׳', '15׳'].forEach((m) => expect(screen.getByRole('button', { name: m })).toBeInTheDocument());
    // add a custom 8-minute time → it starts prep AND is saved for reuse
    await user.click(screen.getByRole('button', { name: 'זמן מותאם' }));
    await user.type(screen.getByLabelText('זמן מותאם בדקות'), '8');
    await user.click(screen.getByRole('button', { name: 'התחל' }));
    expect(JSON.parse(localStorage.getItem('vino:timer-presets')!)).toContain(8);
  });

  it('renders “נגמר הזמן” and flags the card once a timer elapses', () => {
    // prep started 12 min ago with a 10-min timer → 2 min overdue
    publishOrder(order({ status: 'preparing', prepStartedAt: Date.now() - 12 * 60000, timerSeconds: 600 }));
    const { container } = render(<Kitchen />);
    const pill = container.querySelector('.ktimer--over');
    expect(pill).toBeTruthy();
    expect(pill!.textContent).toContain('נגמר הזמן');
    expect(container.querySelector('.kcard--over')).toBeTruthy();
  });

  it('rejects an invalid custom time without starting a timer, keeping the field open', async () => {
    const user = userEvent.setup();
    publishOrder(order());
    const { container } = render(<Kitchen />);
    await user.click(screen.getByRole('button', { name: 'זמן מותאם' }));
    const input = screen.getByLabelText('זמן מותאם בדקות');
    await user.type(input, '0');
    await user.click(screen.getByRole('button', { name: 'התחל' }));
    // no timer started, the entry stays open and flagged, order still 'new'
    expect(container.querySelector('.ktimer')).toBeFalsy();
    expect(screen.getByLabelText('זמן מותאם בדקות')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'התחל בלי טיימר' })).toBeInTheDocument();
  });

  it('lets you remove a saved custom preset (but not a default)', async () => {
    const user = userEvent.setup();
    addTimerPreset(8); // owner had saved 8׳ earlier
    publishOrder(order());
    render(<Kitchen />);
    expect(screen.getByRole('button', { name: '8׳' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'מחק 10 דקות' })).not.toBeInTheDocument(); // default has no ✕
    await user.click(screen.getByRole('button', { name: 'מחק 8 דקות' }));
    expect(screen.queryByRole('button', { name: '8׳' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('vino:timer-presets')!)).not.toContain(8);
  });

  it('clearing a running timer removes the countdown and offers to re-add one', async () => {
    const user = userEvent.setup();
    publishOrder(order({ status: 'preparing', prepStartedAt: Date.now(), timerSeconds: 600 }));
    const { container } = render(<Kitchen />);
    expect(container.querySelector('.ktimer')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'בטל טיימר' }));
    expect(container.querySelector('.ktimer')).toBeFalsy();
    expect(screen.getByRole('button', { name: '+ טיימר' })).toBeInTheDocument();
  });
});
