-- Order progress the shopper can see on their pickup ticket (CONTRACTS §18): the counter saw the
-- order, the owner marked it ready, the shopper said "I'm here". Timestamps only; no new personal data.
alter table public.orders
  add column if not exists seen_at  timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists here_at  timestamptz;
