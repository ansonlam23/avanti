-- What AI shoppers asked for (owner insights, CONTRACTS §16). One row per shop search, from
-- the in-app AI shopper or an outside AI via MCP. No shopper identity of any kind is stored.
create table if not exists public.ai_queries (
  id            bigint generated always as identity primary key,
  source        text not null check (source in ('chat', 'mcp')),
  query         text not null check (char_length(query) between 1 and 200),
  needed_by     text check (needed_by is null or char_length(needed_by) <= 40),
  shop_slugs    text[] not null default '{}', -- shops the search returned
  matched_slugs text[] not null default '{}', -- of those, shops with at least one matching item
  created_at    timestamptz not null default now()
);
create index if not exists ai_queries_created_idx on public.ai_queries (created_at desc);
create index if not exists ai_queries_shops_idx on public.ai_queries using gin (shop_slugs);
alter table public.ai_queries enable row level security; -- server-only (secret key), like every table
