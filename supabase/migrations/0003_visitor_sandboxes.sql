-- Public demo: anyone with the link can try Open Sign.
-- * `listed` shops show up in AI search for everyone (our seeded demo shops).
--   Shops created by visitors are private sandboxes: reachable by link, and in
--   AI search only for the browser that created them.
-- * `copied_from`: a visitor's private copy of a demo shop (to play owner).
-- * Rate limits protect the free AI quota and the sandbox.

alter table public.shops add column if not exists listed boolean not null default false;
alter table public.shops add column if not exists copied_from uuid references public.shops(id) on delete set null;
create index if not exists shops_listed_idx on public.shops (listed) where listed;

create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);
alter table public.rate_limits enable row level security;

-- Fixed-window counter. Returns true if this hit is allowed.
create or replace function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql as $$
declare allowed boolean;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits <= p_max into allowed;
  return allowed;
end $$;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;

-- Visitor sandboxes expire after 2 days (seeded demo shops are listed and kept).
create or replace function public.purge_old_sandboxes() returns integer
language sql as $$
  with gone as (
    delete from public.shops where not listed and created_at < now() - interval '2 days' returning 1
  )
  select count(*)::integer from gone;
$$;
revoke execute on function public.purge_old_sandboxes() from public, anon, authenticated;
