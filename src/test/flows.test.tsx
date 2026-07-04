import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import App from '../App';
import { seedCatalog } from './fixtures/seed';

const ticket = () => screen.getByRole('complementary', { name: 'הזמנה נוכחית' });
const total = () => within(ticket()).getByTestId('ticket-total');
const orderNo = () => within(ticket()).getByTestId('order-number');

/** Tap a menu item card by its exact name (scoped to menu cards, not ticket lines). */
function clickItem(user: UserEvent, name: string) {
  const label = screen.getByText(name, { selector: '.item__name' });
  return user.click(label.closest('.item') as HTMLElement);
}

function openCategory(user: UserEvent, name: string) {
  return user.click(screen.getByRole('button', { name }));
}

beforeEach(seedCatalog);

describe('add a simple item', () => {
  it('adds a drink to the ticket and updates the total', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'שתייה');
    await clickItem(user, 'קוקה קולה 0.33');

    expect(within(ticket()).getByText('קוקה קולה 0.33', { selector: '.line__name' })).toBeInTheDocument();
    expect(total()).toHaveTextContent('₪10');
  });
});

describe('sized item via popover', () => {
  it('asks for a size and prices the chosen one', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'תוספות');
    await clickItem(user, 'צ׳יפס');

    const dialog = screen.getByRole('dialog', { name: /בחרו גודל/ });
    await user.click(within(dialog).getByText('גדול').closest('button') as HTMLButtonElement);

    expect(within(ticket()).getByText('צ׳יפס', { selector: '.line__name' })).toBeInTheDocument();
    expect(total()).toHaveTextContent('₪30');
  });
});

describe('build a whole pizza', () => {
  it('opens the builder and adds the pizza', async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickItem(user, 'וינו וינו');

    const dialog = screen.getByRole('dialog', { name: /בניית/ });
    await user.click(within(dialog).getByRole('button', { name: /הוסף להזמנה/ }));

    expect(within(ticket()).getByText('וינו וינו', { selector: '.line__name' })).toBeInTheDocument();
    expect(total()).toHaveTextContent('₪95');
  });

  it('quick-adds a pizza from the + without opening the builder', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'הוסף וינו וינו' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(ticket()).getByText('וינו וינו', { selector: '.line__name' })).toBeInTheDocument();
    expect(total()).toHaveTextContent('₪95');
  });

  it('charges only toppings beyond the included count', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'הרכבה עצמית');
    await clickItem(user, 'משפחתית בהרכבה');

    const dialog = screen.getByRole('dialog', { name: /בניית/ });
    for (const t of ['פטריות', 'בצל', 'זיתים', 'תירס']) {
      await user.click(within(dialog).getByText(t).closest('button') as HTMLButtonElement);
    }
    await user.click(within(dialog).getByRole('button', { name: /הוסף להזמנה/ }));

    // base 69 + one paid topping (4th) = 74
    expect(total()).toHaveTextContent('₪74');
  });
});

describe('build a half / half pizza', () => {
  it('captures a different base per half and summarizes it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'הרכבה עצמית');
    await clickItem(user, 'משפחתית בהרכבה');

    const dialog = screen.getByRole('dialog', { name: /בניית/ });
    await user.click(within(dialog).getByRole('tab', { name: 'חצי / חצי' }));

    // half 1: pick base וינו וינו from the carousel, then add an extra topping
    await user.click(within(dialog).getByRole('option', { name: 'וינו וינו' }));
    await user.click(within(dialog).getByText('פטריות').closest('button') as HTMLButtonElement);

    // half 2: pick base שחיתות
    await user.click(within(dialog).getByRole('tab', { name: 'חצי 2' }));
    await user.click(within(dialog).getByRole('option', { name: 'שחיתות' }));

    await user.click(within(dialog).getByRole('button', { name: /הוסף להזמנה/ }));

    expect(within(ticket()).getByText(/חצי \/ חצי/)).toBeInTheDocument();
    expect(within(ticket()).getByText(/וינו וינו/)).toBeInTheDocument();
    expect(within(ticket()).getByText(/שחיתות/)).toBeInTheDocument();
  });
});

describe('bundle deals', () => {
  it('applies a 2-pizza bundle at the deal price and splits it into editable lines', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'מבצעים');
    await user.click(screen.getByText('זוג משפחתיות', { selector: '.coupon__name' }).closest('.coupon') as HTMLElement);

    // two independent pizza lines, deal row, and the net (₪190 − ₪30 = ₪160)
    expect(within(ticket()).getAllByText('וינו וינו', { selector: '.line__name' })).toHaveLength(2);
    expect(within(ticket()).getByText('זוג משפחתיות', { selector: '.disc__name' })).toBeInTheDocument();
    expect(total()).toHaveTextContent('₪160');
  });

  it('raises the total when a paid topping is added to a bundle pizza, keeping the deal saving fixed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'מבצעים');
    await user.click(screen.getByText('זוג משפחתיות', { selector: '.coupon__name' }).closest('.coupon') as HTMLElement);
    expect(total()).toHaveTextContent('₪160');

    // edit the first bundle pizza → builder
    await user.click(within(ticket()).getAllByRole('button', { name: 'ערוך' })[0]);
    const dialog = screen.getByRole('dialog', { name: /בניית/ });
    // 3 extra toppings are included; the 4th is charged (+₪5)
    for (const t of ['פטריות', 'בצל', 'זיתים', 'תירס']) {
      await user.click(within(dialog).getByText(t).closest('button') as HTMLButtonElement);
    }
    await user.click(within(dialog).getByRole('button', { name: /עדכן/ }));

    // gross 195 − fixed deal saving 30 = 165
    expect(total()).toHaveTextContent('₪165');
    expect(within(ticket()).getByText('זוג משפחתיות', { selector: '.disc__name' })).toBeInTheDocument();
    expect(within(ticket()).getByText('−₪30', { selector: '.disc__amount' })).toBeInTheDocument();
  });
});

describe('quantity, merge and remove with undo', () => {
  it('merges identical taps into one line with higher quantity', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'שתייה');
    await clickItem(user, 'ספרייט 0.33');
    await clickItem(user, 'ספרייט 0.33');

    expect(within(ticket()).getAllByText('ספרייט 0.33', { selector: '.line__name' })).toHaveLength(1);
    expect(total()).toHaveTextContent('₪20');
  });

  it('steps quantity up and down', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'שתייה');
    await clickItem(user, 'פאנטה 0.33');
    await user.click(within(ticket()).getByRole('button', { name: 'הוסף' }));
    expect(total()).toHaveTextContent('₪20');
    await user.click(within(ticket()).getByRole('button', { name: 'הפחת' }));
    expect(total()).toHaveTextContent('₪10');
  });

  it('removes a line and restores it via undo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'שתייה');
    await clickItem(user, 'קוקה קולה 0.33');
    await user.click(within(ticket()).getByRole('button', { name: 'מחק' }));

    await waitFor(() =>
      expect(within(ticket()).queryByText('קוקה קולה 0.33', { selector: '.line__name' })).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'בטל' }));
    expect(within(ticket()).getByText('קוקה קולה 0.33', { selector: '.line__name' })).toBeInTheDocument();
  });
});

describe('phone autocomplete', () => {
  it('suggests a returning customer from a partial number and fills their details', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(within(ticket()).getByPlaceholderText('טלפון'), '050');

    const suggestion = await screen.findByText('דנה כהן');
    await user.click(suggestion);

    expect(within(ticket()).getByPlaceholderText('שם')).toHaveValue('דנה כהן');
    expect(await screen.findByText(/הזמנות קודמות/)).toBeInTheDocument();
  });
});

describe('phone lookup → reorder', () => {
  it('shows past orders and clones one into the ticket', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(within(ticket()).getByPlaceholderText('טלפון'), '0501234567');

    expect(await screen.findByText(/הזמנות קודמות/)).toBeInTheDocument();
    const cloneButtons = screen.getAllByRole('button', { name: 'שכפל' });
    await user.click(cloneButtons[0]);

    expect(within(ticket()).getByText('שחיתות', { selector: '.line__name' })).toBeInTheDocument();
    expect(within(ticket()).getByPlaceholderText('שם')).toHaveValue('דנה כהן');
  });
});

describe('order type toggle', () => {
  it('hides the address field for pickup', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(within(ticket()).getByPlaceholderText('כתובת')).toBeInTheDocument();
    await user.click(within(ticket()).getByRole('button', { name: 'איסוף' }));
    await waitFor(() => expect(within(ticket()).queryByPlaceholderText('כתובת')).not.toBeInTheDocument());
  });
});

describe('send order', () => {
  it('disables send until there is a line', async () => {
    render(<App />);
    expect(within(ticket()).getByRole('button', { name: /שלח למטבח/ })).toBeDisabled();
  });

  it('clears the ticket and advances the order number after sending', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(orderNo()).toHaveTextContent('#01');

    await openCategory(user, 'שתייה');
    await clickItem(user, 'קוקה קולה 0.33');
    await user.click(within(ticket()).getByRole('button', { name: /שלח למטבח/ }));

    await waitFor(() => expect(orderNo()).toHaveTextContent('#02'));
    expect(within(ticket()).getByText(/כדי להתחיל הזמנה/)).toBeInTheDocument();
  });
});

describe('draft persistence', () => {
  it('autosaves the in-progress order and restores it on reload', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await openCategory(user, 'שתייה');
    await clickItem(user, 'קוקה קולה 0.33');

    await waitFor(() => expect(localStorage.getItem('vino:draft-order')).toContain('קוקה קולה'));
    first.unmount();

    render(<App />);
    expect(within(ticket()).getByText('קוקה קולה 0.33', { selector: '.line__name' })).toBeInTheDocument();
  });
});

describe('settings modal', () => {
  it('opens from the topbar and gathers the admin, screen and account entries', async () => {
    const user = userEvent.setup();
    const signOut = () => {};
    render(<App username="admin" onSignOut={signOut} />);

    await user.click(screen.getByRole('button', { name: /הגדרות/ }));
    const dialog = screen.getByRole('dialog', { name: 'הגדרות' });

    expect(within(dialog).getByRole('link', { name: /^תפריט/ })).toHaveAttribute('href', '/menu');
    expect(within(dialog).getByRole('link', { name: /^מבצעים/ })).toHaveAttribute('href', '/deals');
    expect(within(dialog).getByRole('link', { name: /^מסך מטבח/ })).toHaveAttribute('href', '/kitchen');
    expect(within(dialog).getByRole('link', { name: /^הזמנות/ })).toHaveAttribute('href', '/orders');
    expect(within(dialog).getByRole('link', { name: /^דוח יומי/ })).toHaveAttribute('href', '/reports');
    expect(within(dialog).getByRole('button', { name: /יציאה/ })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'הגדרות' })).not.toBeInTheDocument());
  });
});
