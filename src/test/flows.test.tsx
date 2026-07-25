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

    // PizzaBuilder is lazy — await its chunk the first time it opens
    const dialog = await screen.findByRole('dialog', { name: /בניית/ });
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
  it('customizes each half separately and summarizes it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'הרכבה עצמית');
    await clickItem(user, 'משפחתית בהרכבה');

    const dialog = screen.getByRole('dialog', { name: /בניית/ });
    await user.click(within(dialog).getByRole('tab', { name: 'חצי / חצי' }));

    // half 1: add mushrooms
    await user.click(within(dialog).getByText('פטריות').closest('button') as HTMLButtonElement);

    // half 2: tap the pizza's second half, then add corn
    await user.click(within(dialog).getByRole('button', { name: 'עריכת חצי 2' }));
    await user.click(within(dialog).getByText('תירס').closest('button') as HTMLButtonElement);

    await user.click(within(dialog).getByRole('button', { name: /הוסף להזמנה/ }));

    expect(within(ticket()).getByText(/חצי \/ חצי/)).toBeInTheDocument();
    expect(within(ticket()).getByText(/פטריות/)).toBeInTheDocument();
    expect(within(ticket()).getByText(/תירס/)).toBeInTheDocument();
  });
});

describe('build a salad', () => {
  it('removes base + salad veg, seasons it, adds a paid extra and prices it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'סלטים');
    await clickItem(user, 'סלט עוף');

    // SaladBuilder is lazy — await its chunk the first time it opens
    const dialog = await screen.findByRole('dialog', { name: /עריכת/ });
    await user.click(within(dialog).getByRole('button', { name: 'בלי חסה' }));       // base removal (free)
    await user.click(within(dialog).getByRole('button', { name: 'בלי גמבה' }));       // salad-ingredient removal (free)
    await user.click(within(dialog).getByRole('button', { name: /עם תיבול/ }));      // seasoning (free)
    await user.click(within(dialog).getByRole('button', { name: 'תוספת נתחי עוף' })); // paid extra chicken

    await user.click(within(dialog).getByRole('button', { name: /הוסף להזמנה/ }));

    // base 75 + chicken extra 9 = 84 (removals + seasoning are free)
    expect(total()).toHaveTextContent('₪84');
    expect(within(ticket()).getByText(/חסה/)).toBeInTheDocument();
    expect(within(ticket()).getByText(/גמבה/)).toBeInTheDocument();
    expect(within(ticket()).getByText(/תיבול/)).toBeInTheDocument();
    expect(within(ticket()).getByText(/נתחי עוף/)).toBeInTheDocument();
  });

  it('marking a salad ingredient "without" clears its extra (mutually exclusive)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'סלטים');
    await clickItem(user, 'סלט עוף');

    const dialog = await screen.findByRole('dialog', { name: /עריכת/ });
    const addBtn = () => within(dialog).getByRole('button', { name: /הוסף להזמנה/ }); // footer shows the live price
    await user.click(within(dialog).getByRole('button', { name: 'תוספת נתחי עוף' })); // +9
    expect(addBtn()).toHaveTextContent('₪84');
    await user.click(within(dialog).getByRole('button', { name: 'בלי נתחי עוף' }));   // clears the extra
    expect(addBtn()).toHaveTextContent('₪75');
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

// The customer details live on the full-width checkout step now; the "↻ לקוח קבוע"
// shortcut jumps there from an empty ticket so the returning-customer flow survives.
const goCheckout = (user: UserEvent) => user.click(screen.getByRole('button', { name: /לקוח קבוע/ }));

describe('phone autocomplete', () => {
  it('suggests a returning customer from a partial number and fills their details', async () => {
    const user = userEvent.setup();
    render(<App />);
    await goCheckout(user);
    await user.type(screen.getByPlaceholderText('טלפון'), '050');

    const suggestion = await screen.findByText('דנה כהן');
    await user.click(suggestion);

    expect(screen.getByPlaceholderText('שם')).toHaveValue('דנה כהן');
    expect(await screen.findByText(/הזמנות קודמות/)).toBeInTheDocument();
  });
});

describe('phone lookup → reorder', () => {
  it('shows past orders and clones one into the order', async () => {
    const user = userEvent.setup();
    render(<App />);
    await goCheckout(user);
    await user.type(screen.getByPlaceholderText('טלפון'), '0501234567');

    expect(await screen.findByText(/הזמנות קודמות/)).toBeInTheDocument();
    const cloneButtons = screen.getAllByRole('button', { name: 'שכפל' });
    await user.click(cloneButtons[0]);

    const summary = screen.getByRole('complementary', { name: 'סיכום הזמנה' });
    expect(within(summary).getByText('שחיתות', { selector: '.csum__name' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('שם')).toHaveValue('דנה כהן');
  });

  it('fills only the customer details when the row is tapped, without cloning', async () => {
    const user = userEvent.setup();
    render(<App />);
    await goCheckout(user);
    await user.type(screen.getByPlaceholderText('טלפון'), '0501234567');
    expect(await screen.findByText(/הזמנות קודמות/)).toBeInTheDocument();

    // tap the order row (not שכפל) → name filled, order stays empty
    await user.click(screen.getByText(/שחיתות משפחתית/, { selector: '.reorder__summary' }).closest('button') as HTMLElement);

    expect(screen.getByPlaceholderText('שם')).toHaveValue('דנה כהן');
    const summary = screen.getByRole('complementary', { name: 'סיכום הזמנה' });
    expect(within(summary).getByText('אין פריטים בהזמנה')).toBeInTheDocument();
  });
});

describe('order type toggle', () => {
  it('hides the address field for pickup', async () => {
    const user = userEvent.setup();
    render(<App />);
    await goCheckout(user);
    expect(screen.getByPlaceholderText('כתובת')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'איסוף' }));
    await waitFor(() => expect(screen.queryByPlaceholderText('כתובת')).not.toBeInTheDocument());
  });
});

describe('delivery fee', () => {
  it('adds the chosen fee to the total and clears it on pickup', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCategory(user, 'שתייה');
    await clickItem(user, 'קוקה קולה 0.33'); // ₪10
    await user.click(within(ticket()).getByRole('button', { name: /המשך/ }));

    expect(screen.queryByRole('button', { name: '₪0' })).not.toBeInTheDocument();
    expect(screen.getByText('ללא עלות')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-total')).toHaveTextContent('₪10');

    await user.click(screen.getByRole('button', { name: '₪15' }));
    expect(screen.getByText('₪15', { selector: '.deliv__current' })).toBeInTheDocument();
    expect(screen.getByTestId('ticket-total')).toHaveTextContent('₪25');

    // switching to pickup drops the fee and hides the pills
    await user.click(screen.getByRole('button', { name: 'איסוף' }));
    expect(screen.queryByRole('group', { name: 'דמי משלוח' })).not.toBeInTheDocument();
    expect(screen.getByTestId('ticket-total')).toHaveTextContent('₪10');
  });
});

describe('send order', () => {
  it('disables the continue button until there is a line', async () => {
    render(<App />);
    expect(within(ticket()).getByRole('button', { name: /המשך/ })).toBeDisabled();
  });

  it('clears the ticket and advances the order number after sending', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(orderNo()).toHaveTextContent('#01');

    await openCategory(user, 'שתייה');
    await clickItem(user, 'קוקה קולה 0.33');
    await user.click(within(ticket()).getByRole('button', { name: /המשך/ }));
    await user.click(screen.getByRole('button', { name: /שלח למטבח/ }));

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
    render(<App username="admin" />);

    await user.click(screen.getByRole('button', { name: /הגדרות/ }));
    // SettingsModal is lazy — await its chunk the first time it opens
    const dialog = await screen.findByRole('dialog', { name: 'הגדרות' });

    expect(within(dialog).getByRole('link', { name: /^תפריט/ })).toHaveAttribute('href', '/menu');
    expect(within(dialog).getByRole('link', { name: /^מבצעים/ })).toHaveAttribute('href', '/deals');
    expect(within(dialog).queryByRole('link', { name: /^מסך מטבח/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /^הזמנות/ })).toHaveAttribute('href', '/orders');
    expect(within(dialog).getByRole('link', { name: /^דוח יומי/ })).toHaveAttribute('href', '/reports');
    expect(within(dialog).queryByRole('button', { name: /יציאה/ })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'הגדרות' })).not.toBeInTheDocument());
  });
});

describe('close shift', () => {
  it('resets the order number to #01 after closing the shift', async () => {
    const user = userEvent.setup();
    render(<App username="admin" />);

    // send an order so the counter advances to #02
    await openCategory(user, 'שתייה');
    await clickItem(user, 'קוקה קולה 0.33');
    await user.click(within(ticket()).getByRole('button', { name: /המשך/ }));
    await user.click(screen.getByRole('button', { name: /שלח למטבח/ }));
    await waitFor(() => expect(orderNo()).toHaveTextContent('#02'));

    // open settings → סגירת משמרת → confirm the close
    await user.click(screen.getByRole('button', { name: /הגדרות/ }));
    const settings = await screen.findByRole('dialog', { name: 'הגדרות' });
    await user.click(within(settings).getByRole('button', { name: /סגירת משמרת/ }));

    const shift = await screen.findByRole('dialog', { name: 'סגירת משמרת' });
    await user.click(within(shift).getByRole('button', { name: /^סגור משמרת/ }));
    await user.click(within(shift).getByRole('button', { name: /כן, סגור משמרת/ }));

    // fresh day — numbering restarts, ticket is empty
    await waitFor(() => expect(orderNo()).toHaveTextContent('#01'));
    expect(within(ticket()).getByText(/כדי להתחיל הזמנה/)).toBeInTheDocument();
  });
});
