-- Loyalty seals (CONTRACTS §17). An order may carry the shopper's device key: the SHA-256 hex of
-- a random id kept only on their phone (avanti never sees the raw id, and it isn't linked to a
-- person). Stamps = paid orders with the same key at the same shop. The reward itself lives in
-- shops.rules.loyalty (jsonb), so it needs no column.
alter table public.orders add column if not exists shopper_key text
  check (shopper_key is null or shopper_key ~ '^[0-9a-f]{64}$');
create index if not exists orders_loyalty_idx on public.orders (shop_id, shopper_key)
  where shopper_key is not null;
