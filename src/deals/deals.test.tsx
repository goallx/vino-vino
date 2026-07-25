import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Deals } from './Deals';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { productsById } from '../lib/menuStore';
import { seedCatalog } from '../test/fixtures/seed';

/** Deals uses useConfirm(), so render it inside the provider. */
const renderDeals = () => render(<ConfirmProvider><Deals /></ConfirmProvider>);

beforeEach(() => {
  seedCatalog();
  window.history.replaceState(null, '', '/deals');
});

describe('admin page tabs', () => {
  it('shows the deals list by default and switches to the menu tab', async () => {
    const user = userEvent.setup();
    render(<Deals />);
    // seeded deals visible
    expect(screen.getByText('זוג משפחתיות')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'תפריט' }));
    // category sections with seeded items
    expect(screen.getByRole('heading', { name: 'פיצות' })).toBeInTheDocument();
    expect(screen.getByText('וינו וינו')).toBeInTheDocument();
  });

  it('opens on the menu tab when visiting /menu', () => {
    window.history.replaceState(null, '', '/menu');
    render(<Deals />);
    expect(screen.getByRole('heading', { name: 'פיצות' })).toBeInTheDocument();
  });
});

describe('menu CRUD', () => {
  it('adds a new item through the editor', async () => {
    const user = userEvent.setup();
    render(<Deals />);
    await user.click(screen.getByRole('tab', { name: 'תפריט' }));
    await user.click(screen.getByText('+ פריט חדש'));

    const dialog = screen.getByRole('group', { name: 'עריכת פריט' });
    await user.type(within(dialog).getByPlaceholderText('לדוגמה: פיצה מרגריטה'), 'קלצונה');
    await user.type(within(dialog).getByPlaceholderText('0'), '45');
    await user.click(within(dialog).getByText('שמור פריט'));

    expect(screen.getByText('קלצונה')).toBeInTheDocument();
    // persisted with the price in agorot
    const saved = JSON.parse(localStorage.getItem('vino:menu')!).find(
      (p: { name: string }) => p.name === 'קלצונה',
    );
    expect(saved.basePrice).toBe(4500);
  });

  it('edits an existing item price', async () => {
    const user = userEvent.setup();
    render(<Deals />);
    await user.click(screen.getByRole('tab', { name: 'תפריט' }));

    const card = screen.getByText('וינו וינו').closest('.mcard')!;
    await user.click(within(card as HTMLElement).getByText('עריכה'));

    const dialog = screen.getByRole('group', { name: 'עריכת פריט' });
    // p_vino is a pizza, so the editor shows both price and included-toppings
    // (each placeholder "0"); price is the first.
    const price = within(dialog).getAllByPlaceholderText('0')[0];
    await user.clear(price);
    await user.type(price, '99');
    await user.click(within(dialog).getByText('שמור פריט'));

    expect(productsById['p_vino'].basePrice).toBe(9900);
  });

  it('toggles availability and deletes with confirmation', async () => {
    const user = userEvent.setup();
    renderDeals();
    await user.click(screen.getByRole('tab', { name: 'תפריט' }));

    const card = screen.getByText('וינו וינו').closest('.mcard') as HTMLElement;
    await user.click(within(card).getByText('זמין'));
    expect(productsById['p_vino'].active).toBe(false);
    expect(within(card).getByText('מוסתר', { selector: '.mcard__hidden' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'מחק וינו וינו' }));
    // styled confirm dialog → confirm the deletion
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'מחק' }));
    expect(productsById['p_vino']).toBeUndefined();
  });

  it('keeps the pizza builder defaults when saving a pizza item', async () => {
    const user = userEvent.setup();
    render(<Deals />);
    await user.click(screen.getByRole('tab', { name: 'תפריט' }));
    await user.click(screen.getByText('+ פריט חדש'));

    const dialog = screen.getByRole('group', { name: 'עריכת פריט' });
    await user.type(within(dialog).getByPlaceholderText('לדוגמה: פיצה מרגריטה'), 'מרגריטה');
    await user.type(within(dialog).getByPlaceholderText('0'), '60');
    await user.click(within(dialog).getByText('פיצה 🍕'));
    await user.click(within(dialog).getByText('שמור פריט'));

    const saved = JSON.parse(localStorage.getItem('vino:menu')!).find(
      (p: { name: string }) => p.name === 'מרגריטה',
    );
    expect(saved.isPizza).toBe(true);
    expect(saved.splitCapable).toBe(true);
    expect(saved.includedToppings).toBe(1);
  });

  it('lets you pick base toppings for a pizza via the multi-select', async () => {
    const user = userEvent.setup();
    render(<Deals />);
    await user.click(screen.getByRole('tab', { name: 'תפריט' }));
    await user.click(screen.getByText('+ פריט חדש'));

    const dialog = screen.getByRole('group', { name: 'עריכת פריט' });
    await user.type(within(dialog).getByPlaceholderText('לדוגמה: פיצה מרגריטה'), 'פטריות ובצל');
    await user.type(within(dialog).getByPlaceholderText('0'), '55');
    await user.click(within(dialog).getByText('פיצה 🍕'));

    const select = within(dialog).getByLabelText('תוספות בבסיס (מה כלול בפיצה כברירת מחדל)') as HTMLSelectElement;
    await user.selectOptions(select, ['t_mushroom', 't_onion']);

    await user.click(within(dialog).getByText('שמור פריט'));

    const saved = JSON.parse(localStorage.getItem('vino:menu')!).find(
      (p: { name: string }) => p.name === 'פטריות ובצל',
    );
    expect(saved.art).toEqual(['t_mushroom', 't_onion']);

    // reopening the editor shows the saved selection
    const card = screen.getByText('פטריות ובצל').closest('.mcard') as HTMLElement;
    await user.click(within(card).getByText('עריכה'));
    const reopened = screen.getByRole('group', { name: 'עריכת פריט' });
    const reopenedSelect = within(reopened).getByLabelText('תוספות בבסיס (מה כלול בפיצה כברירת מחדל)') as HTMLSelectElement;
    const selected = Array.from(reopenedSelect.selectedOptions).map((o) => o.value);
    expect(selected).toEqual(['t_mushroom', 't_onion']);
  });

  it('lets you set how many toppings a pizza includes', async () => {
    const user = userEvent.setup();
    render(<Deals />);
    await user.click(screen.getByRole('tab', { name: 'תפריט' }));
    await user.click(screen.getByText('+ פריט חדש'));

    const dialog = screen.getByRole('group', { name: 'עריכת פריט' });
    await user.type(within(dialog).getByPlaceholderText('לדוגמה: פיצה מרגריטה'), 'פיצה שף');
    await user.click(within(dialog).getByText('פיצה 🍕')); // reveals the included-toppings field
    await user.type(within(dialog).getAllByPlaceholderText('0')[0], '90'); // price
    const inc = within(dialog).getByLabelText('תוספות כלולות');
    await user.clear(inc);
    await user.type(inc, '3');
    await user.click(within(dialog).getByText('שמור פריט'));

    const saved = JSON.parse(localStorage.getItem('vino:menu')!).find(
      (p: { name: string }) => p.name === 'פיצה שף',
    );
    expect(saved.isPizza).toBe(true);
    expect(saved.includedToppings).toBe(3);
  });

  it('lets you set a salad’s offered extras via the same picker', async () => {
    const user = userEvent.setup();
    render(<Deals />);
    await user.click(screen.getByRole('tab', { name: 'תפריט' }));
    await user.click(screen.getByText('+ פריט חדש'));

    const dialog = screen.getByRole('group', { name: 'עריכת פריט' });
    await user.type(within(dialog).getByPlaceholderText('לדוגמה: פיצה מרגריטה'), 'סלט חדש');
    await user.type(within(dialog).getByPlaceholderText('0'), '50'); // price (regular dish → sole 0-field)
    await user.selectOptions(within(dialog).getByLabelText('קטגוריה'), 'salads'); // reveals the extras picker
    const extras = within(dialog).getByLabelText('תוספות אפשריות (מה אפשר להוסיף לסלט)');
    await user.selectOptions(extras, ['t_mushroom', 't_corn']);
    await user.click(within(dialog).getByText('שמור פריט'));

    const saved = JSON.parse(localStorage.getItem('vino:menu')!).find(
      (p: { name: string }) => p.name === 'סלט חדש',
    );
    expect(saved.categoryId).toBe('salads');
    expect(saved.isPizza).toBeUndefined();
    expect(saved.art).toEqual(['t_mushroom', 't_corn']);
  });
});

describe('deal perks', () => {
  it('creates a deal that grants free toppings, and shows the perk badge', async () => {
    const user = userEvent.setup();
    render(<Deals />);
    await user.click(screen.getByText('+ מבצע חדש'));

    const dialog = screen.getByRole('dialog', { name: 'עריכת מבצע' });
    await user.type(within(dialog).getByPlaceholderText('לדוגמה: זוג משפחתיות'), 'משפחתית + 3 תוספות');
    await user.selectOptions(within(dialog).getByRole('combobox'), 'p_vino');
    await user.type(within(dialog).getAllByPlaceholderText('0')[0], '120'); // price ₪120
    await user.type(within(dialog).getByLabelText('תוספות חינם'), '3');
    await user.click(within(dialog).getByText('שמור מבצע'));

    const saved = JSON.parse(localStorage.getItem('vino:bundles')!).find(
      (b: { name: string }) => b.name === 'משפחתית + 3 תוספות',
    );
    expect(saved.freeToppings).toBe(3);
    expect(saved.price).toBe(12000);

    // the deal card advertises the perk
    expect(screen.getByText('🍕 3 תוספות חינם')).toBeInTheDocument();
  });
});
