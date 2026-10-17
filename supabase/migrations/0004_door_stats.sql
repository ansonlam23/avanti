-- Door log counts, aggregated in the database (PostgREST caps plain selects
-- at 1000 rows, and the dashboard polls every few seconds).
create or replace function public.door_stats(p_shop uuid)
returns table (type text, reason text, n bigint)
language sql stable as $$
  select e.type, e.reason, count(*)::bigint
  from public.events e
  where e.shop_id = p_shop and e.type in ('order_verified', 'bot_blocked')
  group by e.type, e.reason;
$$;
revoke execute on function public.door_stats(uuid) from public, anon, authenticated;
