-- Expired agent nonces can't be replayed anyway (the signature window has
-- passed), so they can be deleted. Called opportunistically by the server.
create or replace function public.purge_expired_nonces() returns integer
language sql as $$
  with gone as (
    delete from public.agent_nonces where expires_at < now() - interval '10 minutes' returning 1
  )
  select count(*)::integer from gone;
$$;
revoke execute on function public.purge_expired_nonces() from public, anon, authenticated;
