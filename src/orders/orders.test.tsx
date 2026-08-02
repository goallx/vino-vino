import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Orders } from './Orders';
import { publishOrder } from '../lib/orderBus';
import type { CartLine, KitchenOrder } from '../types';

const line: CartLine = { id: 'l1', productId: 'p_vino', name: 'וינו וינו', qty: 1, unitPrice: 9500, isSplit: false, parts: [] };

function ord(over: Partial<KitchenOrder>): KitchenOrder {
  return { id: 'o', number: 1, type: 'delivery', payment: 'unpaid', createdAt: Date.now(), status: 'new', lines: [line], ...over };
}

beforeEach(() => localStorage.clear());

describe('orders list + cancel', () => {
  it('lists today\'s active orders', () => {
    publishOrder(ord({ id: 'a', number: 7 }));
    publishOrder(ord({ id: 'b', number: 8 }));
    render(<Orders />);
    expect(screen.getByText('#07')).toBeInTheDocument();
    expect(screen.getByText('#08')).toBeInTheDocument();
  });

  it('cancels an order with a confirm step and moves it to the cancelled filter', async () => {
    const user = userEvent.setup();
    publishOrder(ord({ id: 'a', number: 7 }));
    publishOrder(ord({ id: 'b', number: 8 }));
    render(<Orders />);

    const row = screen.getByText('#07').closest('.orow') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'הצג פרטים' })); // expand to reveal actions
    await user.click(within(row).getByRole('button', { name: 'ביטול הזמנה' }));
    // confirm step
    await user.click(within(row).getByRole('button', { name: 'כן, בטל' }));

    // gone from the active list, #08 still there
    await waitFor(() => expect(screen.queryByText('#07')).not.toBeInTheDocument());
    expect(screen.getByText('#08')).toBeInTheDocument();

    // shows under the cancelled filter with a "בוטל" badge
    await user.click(screen.getByRole('button', { name: 'בוטלו' }));
    expect(screen.getByText('#07')).toBeInTheDocument();
    expect(screen.getByText('בוטל')).toBeInTheDocument();
  });

  it('shows the client details (name, tap-to-call phone, address) in the expanded card', async () => {
    const user = userEvent.setup();
    publishOrder(ord({ id: 'a', number: 7, customerName: 'דנה', phone: '0501234567', address: 'הרצל 5' }));
    render(<Orders />);

    const row = screen.getByText('#07').closest('.orow') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'הצג פרטים' }));

    expect(within(row).getByText('👤 דנה')).toBeInTheDocument();
    const tel = within(row).getByRole('link', { name: '📞 0501234567' });
    expect(tel).toHaveAttribute('href', 'tel:0501234567');
    expect(within(row).getByText('📍 הרצל 5')).toBeInTheDocument();
  });

  it('marks a pickup order as self-collect instead of an address', async () => {
    const user = userEvent.setup();
    publishOrder(ord({ id: 'a', number: 7, type: 'pickup', customerName: 'יוסי', address: undefined }));
    render(<Orders />);
    const row = screen.getByText('#07').closest('.orow') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'הצג פרטים' }));
    expect(within(row).getByText('🏠 איסוף עצמי')).toBeInTheDocument();
  });

  it('backing out of the confirm keeps the order', async () => {
    const user = userEvent.setup();
    publishOrder(ord({ id: 'a', number: 7 }));
    render(<Orders />);
    await user.click(screen.getByRole('button', { name: 'הצג פרטים' })); // expand to reveal actions
    await user.click(screen.getByRole('button', { name: 'ביטול הזמנה' }));
    await user.click(screen.getByRole('button', { name: 'חזור' }));
    expect(screen.getByText('#07')).toBeInTheDocument();
  });
});
