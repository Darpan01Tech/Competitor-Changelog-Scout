-- Optional hosted scheduling. Requires pg_cron, pg_net and Vault configured by an operator.
-- This migration is intentionally additive; it does not alter application tables.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.review_rate_limits (
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index if not exists review_rate_limits_user_time_idx on public.review_rate_limits (user_id, attempted_at);
alter table public.review_rate_limits enable row level security;
revoke all on public.review_rate_limits from anon, authenticated;
grant all on public.review_rate_limits to service_role;

create or replace function public.consume_review_rate_limit(p_user_id uuid, p_limit integer default 20, p_window_seconds integer default 60)
returns boolean language plpgsql security definer set search_path = '' as $$
declare recent_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  delete from public.review_rate_limits where attempted_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into recent_count from public.review_rate_limits
    where user_id = p_user_id and attempted_at >= now() - make_interval(secs => p_window_seconds);
  if recent_count >= p_limit then return false; end if;
  insert into public.review_rate_limits(user_id) values (p_user_id);
  return true;
end $$;
revoke all on function public.consume_review_rate_limit(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_review_rate_limit(uuid, integer, integer) to service_role;

create table if not exists public.edge_rate_limits (
  function_name text not null,
  bucket_key text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists edge_rate_limits_bucket_time_idx
  on public.edge_rate_limits (function_name, bucket_key, attempted_at);
alter table public.edge_rate_limits enable row level security;
revoke all on public.edge_rate_limits from anon, authenticated;
grant all on public.edge_rate_limits to service_role;

create or replace function public.consume_edge_rate_limit(
  p_function_name text,
  p_bucket_key text,
  p_limit integer default 12,
  p_window_seconds integer default 60
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare recent_count integer;
begin
  if p_function_name not in ('insights') or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit parameters';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_function_name || ':' || p_bucket_key, 0)
  );
  delete from public.edge_rate_limits
    where function_name = p_function_name
      and attempted_at < pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds);
  select count(*) into recent_count from public.edge_rate_limits
    where function_name = p_function_name
      and bucket_key = p_bucket_key
      and attempted_at >= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds);
  if recent_count >= p_limit then return false; end if;
  insert into public.edge_rate_limits(function_name, bucket_key)
    values (p_function_name, p_bucket_key);
  return true;
end $$;
revoke all on function public.consume_edge_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(text, text, integer, integer)
  to service_role;

-- Keep the scheduler secret out of cron.job.command. Resolve it from Vault only
-- when the scheduled command runs, and allow only the two fixed function paths.
create or replace function public.invoke_scout_schedule(p_target text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  function_url text;
  cron_secret text;
  target_url text;
  request_id bigint;
begin
  if p_target not in ('scan', 'verify') then
    raise exception 'Unsupported scheduled target';
  end if;
  select decrypted_secret into function_url
    from vault.decrypted_secrets where name = 'SCOUT_SCAN_FUNCTION_URL' limit 1;
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'SCOUT_CRON_SECRET' limit 1;
  if function_url is null or cron_secret is null then
    raise exception 'Scheduled function URL or secret is missing from Vault';
  end if;
  target_url := case when p_target = 'scan' then function_url
    else replace(function_url, '/scan-competitors', '/verify-entries') end;
  if target_url = function_url and p_target = 'verify' then
    raise exception 'Configured URL must end in /scan-competitors';
  end if;
  select net.http_post(
    url := target_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-scheduler-secret', cron_secret),
    body := '{}'::jsonb
  ) into request_id;
  return request_id;
end $$;
revoke all on function public.invoke_scout_schedule(text) from public, anon, authenticated;

do $$
declare
  function_url text;
  cron_secret text;
begin
  select decrypted_secret into function_url
    from vault.decrypted_secrets where name = 'SCOUT_SCAN_FUNCTION_URL' limit 1;
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'SCOUT_CRON_SECRET' limit 1;

  if function_url is null or cron_secret is null then
    raise notice 'Collector schedules not installed: add SCOUT_SCAN_FUNCTION_URL and SCOUT_CRON_SECRET to Supabase Vault, then rerun this migration.';
    return;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname in ('competitor-scan-12-hourly', 'entry-verification-15-minute');
  perform cron.schedule('competitor-scan-12-hourly', '0 */12 * * *',
    'select public.invoke_scout_schedule(''scan'');');
  perform cron.schedule('entry-verification-15-minute', '*/15 * * * *',
    'select public.invoke_scout_schedule(''verify'');');
end $$;
