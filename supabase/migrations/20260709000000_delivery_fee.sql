-- Delivery fee: an owner-chosen surcharge (e.g. ₪10/₪15/₪20) added at checkout
-- for delivery orders. Stored in agorot alongside the other money columns so
-- reports and the kitchen board can render the true order total.
alter table public.orders
  add column if not exists delivery_fee integer not null default 0 check (delivery_fee >= 0);
