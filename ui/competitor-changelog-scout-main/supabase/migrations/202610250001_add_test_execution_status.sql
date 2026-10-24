-- Add the execution state consumed by the dashboard and scan function.
-- Legacy `passed = false` does not distinguish a failed run from a test never
-- run, so map it conservatively to `not_run`; preserve all existing columns.
alter table public.test_results
  add column if not exists execution_status text;

update public.test_results
set execution_status = case when passed then 'passed' else 'not_run' end
where execution_status is null;

alter table public.test_results
  alter column execution_status set default 'not_run',
  alter column execution_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.test_results'::regclass
      and conname = 'test_results_execution_status_check'
  ) then
    alter table public.test_results
      add constraint test_results_execution_status_check
      check (execution_status in ('not_run', 'passed', 'failed'));
  end if;
end $$;
