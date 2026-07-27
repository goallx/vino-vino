# Pizza editor: derived type + smarter free-topping model

**Date:** 2026-07-27
**Status:** Approved (design), pending spec review

## Goal

Two connected changes to how pizzas are defined in the menu admin:

1. **Remove the `סוג` (pizza / regular dish) toggle** from the product editor and
   derive pizza-ness from the category instead.
2. **Make the free-topping model smarter:** decouple a pizza's *recipe* (what's on
   it) from its *free allowance* (how many toppings the customer may add free), and
   let the owner control *which* toppings are eligible to be free — so a premium
   topping like chicken is never given away free even on a pizza that grants free
   toppings.

## Motivation

The owner adds a "chef" pizza — e.g. a chicken pizza whose recipe is
chicken + pepper + corn — that should come with, say, 2 *additional* free toppings
the customer picks, **but chicken must not be one of the free ones**. Today's model
can't express that:

- The `isPizza` flag is a manual toggle, redundant with the category and easy to
  forget (a pizza filed under the pizza category but left un-toggled silently loses
  all pizza behavior).
- `includedToppings` is consumed *base-first* (`included − recipe size`), so the
  recipe and the free allowance are tangled, and every topping counts equally —
  an expensive chicken consumes a free slot exactly like a cheap onion.

## Decisions (all confirmed with owner)

1. **Merge the `chef` category into `pizza`.** "Chef" is not really a category — it
   is just a pizza that ships with a preset recipe and a name. All signature pizzas
   move into the single `פיצות` (`pizza`) category and display alongside regular
   pizzas, ordered by the existing `sort` column (regular first, then chef). The
   now-empty `chef` category is deleted.
2. **`isPizza` is derived:** `isPizza(product) ⇔ product.categoryId === 'pizza'`.
   The editor uses this to show pizza-only fields; on save it writes the derived
   `is_pizza` / `split_capable` columns so order-side readers are unchanged.
3. **Recipe and free allowance are decoupled.** The recipe (`art`) is on the pie
   and in the base price; it no longer consumes free slots. `includedToppings` now
   means *additional* free toppings the customer may add.
4. **New per-pizza free-eligibility whitelist** (`freeToppingIds`). Absent = all
   toppings eligible (keeps regular/build pizzas working with no data change). The
   editor defaults it to all-ticked; the owner unticks premium toppings per pizza.
5. **Migration resets existing chef pizzas' `includedToppings` to
   `max(0, old − recipe size)`** (= 0 for all current chef pizzas), preserving
   today's prices exactly. The owner then adds bonus free toppings per pizza.
6. **Free slots waive the priciest eligible toppings first** (best-value-first,
   consistent with the existing deal-perk logic). Ineligible toppings (chicken) are
   always charged at their own per-size price.

## Data model

### `types.ts`
Add one optional field to `Product`:

```ts
freeToppingIds?: string[]; // topping ids eligible to be taken free; absent = all eligible
```

`isPizza`, `splitCapable`, `includedToppings`, `art` stay as-is (see Backward
compatibility). `art` continues to mean "the recipe on the pie / illustration."

### Database
New migration `supabase/migrations/2026XXXX_pizza_free_toppings.sql`:

1. `alter table public.products add column free_topping_ids jsonb;` (nullable).
2. **Category merge:** `update public.products set category_id = 'pizza' where
   category_id = 'chef';` then `delete from public.categories where id = 'chef';`
   Re-number `sort` so chef pizzas fall after regular pizzas (offset chef sorts by
   the regular count).
3. **Recalibrate free allowance for any product whose recipe consumed free slots:**
   `update public.products
      set included_toppings = greatest(0, coalesce(included_toppings,0)
                                          - coalesce(jsonb_array_length(art),0))
    where art is not null and jsonb_array_length(art) > 0;`
   (Every current pizza — regular *and* chef — has `included == art.length`, so
   this yields 0 across the board, exactly matching today's "recipe is the free
   part, 0 bonus adds" behavior.)

`menuStore.ts` `rowToProduct` / product-to-row mapping gains `free_topping_ids ↔
freeToppingIds`.

## Pricing logic (`src/lib/cart.ts`)

Rewrite `partChargedPortions` (currently base-first, tap-order) to: eligibility +
priciest-first waiving, no recipe consumption.

```ts
function partChargedPortions(part: LinePart, included: number): Money[] {
  const eligibleIds = productsById[part.baseProductId]?.freeToppingIds; // undefined = all eligible
  const eligible = (id: string) => !eligibleIds || eligibleIds.includes(id);

  const free: Money[] = [];      // eligible portions, waive-able
  const charged: Money[] = [];   // ineligible portions, always charged
  for (const t of part.toppings) {
    if (t.action !== 'add') continue;
    for (let i = 0; i < (t.qty ?? 1); i += 1) {
      (eligible(t.toppingId) ? free : charged).push(t.price);
    }
  }
  // waive the `included` priciest eligible portions; the rest are charged
  free.sort((a, b) => b - a);
  charged.push(...free.slice(included));
  return charged;
}
```

- `partExtraCost`, `computeUnitPrice`, and `chargedToppingPortions` (deal perks) all
  call through `partChargedPortions` unchanged in signature — they inherit the new
  behavior automatically.
- **Per-part free allowance is preserved** (each part of a split gets `included`
  free, as today). Only eligibility + recipe-decoupling + waive-order change.

**Side effect (intended):** because every pizza launches at `includedToppings = 0`,
nothing is waived on day one, so there is **no price change on launch**. Once the
owner sets a bonus, free toppings waive priciest-first (customer-favorable) instead
of tap-order.

## Editor UI (`src/deals/MenuAdmin.tsx`)

- **Remove** the `סוג` segmented toggle (lines ~234–244) and the `isPizza`-driven
  branches keyed off it.
- **Derive** `const isPizza = draft.categoryId === 'pizza';` Replace `draft.isPizza`
  reads in the editor with this. `normalize()` sets `splitCapable`/`includedToppings`
  defaults and writes `isPizza: true` on save when the category is `pizza` (so the
  persisted column stays correct); strips them otherwise.
- **Keep** the recipe multi-select (`art`, "תוספות בבסיס") for pizzas — unchanged
  meaning.
- **Keep** the `includedToppings` numeric field, relabeled to make the new meaning
  clear, e.g. "תוספות חינם (כמה תוספות נוספות חינם מעבר לבסיס)".
- **Add** a free-eligibility multi-select for pizzas: "אילו תוספות אפשר לקחת חינם",
  bound to `draft.freeToppingIds`, listing all toppings, **defaulting to all
  selected**. Storing all-selected may normalize to `undefined` (= all eligible) to
  keep rows clean.
- Salads keep their existing `art`-as-offered-extras editor; unaffected.

## Order-taking builder (`src/components/PizzaBuilder.tsx`)

The builder's per-topping "+₪" hints previously mirrored the old base-first/tap-order
math. They now read `partToppingCharges(activePart, included)` from `cart.ts`, so
each row's badge equals its actual charge (recipe free, `included` priciest eligible
waived, ineligible always charged, opening-price + doubles included) and the badges
always reconcile with the footer total. The `included` default drops from `?? 1` to
`?? 0`.

## `isPizza` derivation helper

Order-side readers currently read `product.isPizza` (App.tsx:127, cart.ts:204,
PizzaBuilder, etc.). Because the editor keeps the `is_pizza` column in sync on save
and the migration fixes existing rows, **these readers need no change**. No new
read-time helper is required for this scope; deriving on save keeps the blast radius
to the editor + migration + pricing.

## Backward compatibility

- `freeToppingIds` absent ⇒ all toppings eligible ⇒ existing regular/build pizzas
  behave as before (modulo the intended priciest-first waive order).
- Cached menus in `localStorage` lacking `free_topping_ids` deserialize with
  `freeToppingIds: undefined` ⇒ all-eligible. Safe.
- Order-side `is_pizza` reads keep working (column kept in sync + migrated).

## Testing (`vitest`)

Extend `src/deals/deals.test.tsx` / cart tests:

1. Chef pizza, `includedToppings: 2`, `freeToppingIds` excludes chicken; add
   mushroom + onion + extra chicken → mushroom & onion free, chicken charged.
2. Priciest-first: `included: 1`, add olives ₪6 + mushroom ₪5 → olives free,
   mushroom ₪5.
3. Recipe no longer consumes free slots: chef pizza with 3-topping recipe and
   `included: 0` → any added topping is charged (regression guard for the reset).
4. `freeToppingIds` absent → all eligible (regular pizza unchanged count).
5. Editor: pizza category shows recipe + free-count + whitelist and no `סוג`
   toggle; non-pizza category shows none of them; save writes `is_pizza`.
6. Split pizza keeps per-part free allowance with per-half eligibility.

## Out of scope

- No global "premium topping" flag (owner chose per-pizza whitelist; premium-ness
  is expressed by un-ticking per pizza).
- No change to split/half per-part free-allowance semantics.
- No change to deal perks beyond inheriting the new `partChargedPortions`.
- No read-time `isPizza` refactor of order-side code.
```