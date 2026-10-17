-- Open Sign · initial schema
-- Access model: RLS is ON for every table with NO policies, so only the
-- server (secret key) can read/write. Browsers get data through our API and
-- tiny realtime "pings" (broadcast), never by reading tables directly.

create extension if not exists pgcrypto;

-- ── shops ─────────────────────────────────────────────────────────────
create table if not exists public.shops (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text not null check (char_length(name) between 1 and 80),
  tagline          text,
  owner_language   text not null default 'en',
  photo_url        text,
  open             boolean not null default false,
  pickup_window    jsonb not null default '{"start":"08:00","end":"18:00"}',
  rules            jsonb not null default '{"max_per_order":2,"accept_ai_orders":true}',
  is_demo          boolean not null default false,
  location_label   text,
  lat              double precision,
  lng              double precision,
  owner_token_hash text not null,
  created_at       timestamptz not null default now()
);

-- ── items ─────────────────────────────────────────────────────────────
create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  name_en      text,
  description  text,
  price_cents  integer check (price_cents is null or price_cents > 0),
  price_source text not null default 'missing'
               check (price_source in ('spoken', 'tag_in_photo', 'owner', 'missing')),
  tags         text[] not null default '{}',
  stock        integer not null default 0 check (stock >= 0),
  sold_out     boolean not null default false,
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists items_shop_idx on public.items (shop_id, sort);

-- ── agents (the agent directory) ──────────────────────────────────────
create table if not exists public.agents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  key_id     text not null unique,          -- RFC 7638 JWK thumbprint
  public_jwk jsonb not null,                -- {"kty":"OKP","crv":"Ed25519","x":"…"}
  verified   boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── orders ────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops(id) on delete cascade,
  item_id          uuid not null references public.items(id) on delete cascade,
  qty              integer not null check (qty > 0),
  amount_cents     integer not null check (amount_cents > 0),
  currency         text not null default 'USD',
  pickup_time      timestamptz,
  customer_name    text,
  status           text not null default 'pending'
                   check (status in ('pending', 'held', 'paid', 'released', 'failed')),
  payment_mode     text not null check (payment_mode in ('simulated', 'sandbox')),
  agent_id         uuid references public.agents(id),
  idempotency_key  text not null unique,
  visa_auth_id     text,
  visa_capture_id  text,
  visa_reversal_id text,
  card_last4       text,
  pickup_code      text not null check (pickup_code ~ '^[0-9]{4}$'),
  failure_reason   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  held_at          timestamptz,
  paid_at          timestamptz,
  released_at      timestamptz
);
create index if not exists orders_shop_idx on public.orders (shop_id, created_at desc);

-- ── agent_nonces (replay protection; serverless can't keep these in memory)
create table if not exists public.agent_nonces (
  nonce      text primary key,
  key_id     text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ── events (agent log + activity feed) ────────────────────────────────
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  shop_id    uuid references public.shops(id) on delete cascade,
  type       text not null check (type in (
               'order_verified', 'bot_blocked', 'order_held', 'order_failed',
               'paid', 'released', 'sold_out', 'restocked', 'shop_opened')),
  reason     text,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists events_shop_idx on public.events (shop_id, created_at desc);

-- ── housekeeping ──────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Atomically reserve stock for a new order. Returns false if not enough
-- stock or the item is sold out (so a sold-out tap can't race an order).
create or replace function public.reserve_stock(p_item uuid, p_qty integer) returns boolean
language plpgsql as $$
declare n integer;
begin
  update public.items set stock = stock - p_qty
   where id = p_item and stock >= p_qty and not sold_out;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Return stock when a hold is released (no-show) or an authorization fails.
create or replace function public.return_stock(p_item uuid, p_qty integer) returns void
language sql as $$
  update public.items set stock = stock + p_qty where id = p_item;
$$;

-- ── RLS: on everywhere, no policies (server-only access) ──────────────
alter table public.shops        enable row level security;
alter table public.items        enable row level security;
alter table public.agents       enable row level security;
alter table public.orders       enable row level security;
alter table public.agent_nonces enable row level security;
alter table public.events       enable row level security;

-- The stock functions are server-only too.
revoke execute on function public.reserve_stock(uuid, integer) from public, anon, authenticated;
revoke execute on function public.return_stock(uuid, integer) from public, anon, authenticated;

-- ── storage: public-read bucket for shop photos (uploads are server-side)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-photos', 'shop-photos', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;
