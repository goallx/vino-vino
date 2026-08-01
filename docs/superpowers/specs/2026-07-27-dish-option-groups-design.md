# Dynamic dish customization — generic "option groups" (PARKED)

**Date:** 2026-07-27
**Status:** Design approved, PARKED — resume after UI work. Not yet spec'd in full or implemented.

Goal: make salads / pastas / meats owner-configurable the way pizzas now are —
the owner builds each dish's customizable options in "add product", and the
order-time editor is just a projection of that. Replaces hardcoded builders.

## Approved decisions

1. **Generic option-groups model** (not per-category builders). A product carries
   an ordered list of option groups the owner composes.
2. **Four group types:**
   - `included` — ingredients that come on the dish; customer removes ("בלי X"). Free.
   - `choice` — pick-one (required, has a default); each option may carry a +₪ delta.
   - `addon` — paid extras; **options pulled from the toppings catalog** (reuse
     names/prices/icons), like salad extras / pizza toppings today.
   - `toggle` — free on/off prep notes (seasoning, spicy). No price.
3. **Option source:** add-ons = toppings catalog; included / choice / toggle = free-form text.
4. **Size stays as `variants`** (not a group type); builder shows a size control when present.
5. **Pick-one is required**, preselected default, kitchen shows the chosen option.
6. **Retire `SaladBuilder`** → one universal `DishBuilder` renders any dish's groups.
7. **Pizzas untouched** — keep `art` / `freeToppingIds` and the split builder.

## Data model (sketch)

```ts
type OptionGroupType = 'included' | 'choice' | 'addon' | 'toggle';
interface OptionGroup {
  id: string;
  type: OptionGroupType;
  label: string;              // "בסיס", "רוטב", "תוספת", "הכנה"
  items?: OptionItem[];       // free-form (included / choice / toggle)
  toppingIds?: string[];      // catalog refs (addon only)
  defaultItemId?: string;     // choice only
}
interface OptionItem { id: string; name: string; price?: Money } // choice +₪; included/toggle omit
```
Product gains `optionGroups: OptionGroup[]`. DB: `option_groups jsonb`.

## How it wires up

- **Editor:** for non-pizza categories, an "אפשרויות התאמה" section with
  [+ הוסף קבוצה]; each group edits label + options (free-form rows, or the
  toppings multi-select for `addon`). Reorder / delete.
- **Order-time:** universal `DishBuilder` renders groups top-to-bottom
  (included→remove chips, choice→segmented, addon→priced list, toggle→on/off).
  Opens iff the dish has `optionGroups` or `variants`; else direct add. The
  `isPizza || categoryId==='salads'` special-case in App/Menu becomes data-driven.
- **Pricing/kitchen:** selections serialize into `parts[0].toppings` as
  `ToppingSel[]` (addon/choice-with-price → `add` at price; toggle → `add` 0;
  removal → `remove` 0). `computeUnitPrice` non-pizza branch + kitchen render
  already handle this — minimal change.
- **Migration:** add column; seed salads with `included` (base veg, now
  per-salad editable), `toggle` (seasoning), `addon` (from current `art`);
  retire hardcoded `SALAD_BASE`/seasoning and `EDITABLE_CATEGORIES`. Pastas/meats
  start empty.

## To resume

Write the full spec from this, get user review, then implement:
types → menuStore mapping → editor groups UI → universal DishBuilder →
App/Menu open-builder condition → migration → tests. Salad regression:
base-removal + seasoning + priced extras must behave as today post-migration.
