-- Account-synced learner display preferences (spec #216, ticket #222). One JSONB
-- document per learner holds the display/UX prefs (v1: autoZoom, autocomplete) —
-- the durable, cross-device replacement for the per-device localStorage prefs.
-- Display only: nothing here affects the learning engine (pack selection stays
-- with the scheduler). JSONB so a new preference is added without a migration.
--
-- Applied uniformly to public (prod) and the per-env schemas dev + test, so all
-- three stay structurally identical (see 20260821000000_env_schemas_dev_test).
-- Mirrors scheduler_state (20260906120000): one row per learner keyed by user_id
-- defaulting to auth.uid(), RLS enabled AND forced, owner-only select/insert/
-- update. Additionally grants service_role select for admin reads.
--
-- Idempotent: create-table-if-not-exists and drop-then-create policies
-- throughout. Safe to re-run.

do $$
declare
  s text;
begin
  foreach s in array array['public', 'dev', 'test']
  loop
    -- One row per learner: user_id defaults to auth.uid() and RLS pins every row
    -- to its owner. The whole preferences blob is one JSONB value, defaulting to
    -- an empty object so the client/server fill per-key defaults on read.
    execute format($ddl$
      create table if not exists %1$I.user_preferences (
        user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
        preferences jsonb not null default '{}'::jsonb,
        updated_at  timestamptz not null default now()
      )$ddl$, s);
    execute format('alter table %1$I.user_preferences enable row level security', s);
    execute format('alter table %1$I.user_preferences force row level security', s);
    execute format('drop policy if exists user_preferences_select on %1$I.user_preferences', s);
    execute format($ddl$create policy user_preferences_select on %1$I.user_preferences
      for select to authenticated using (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists user_preferences_insert on %1$I.user_preferences', s);
    execute format($ddl$create policy user_preferences_insert on %1$I.user_preferences
      for insert to authenticated with check (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists user_preferences_update on %1$I.user_preferences', s);
    execute format($ddl$create policy user_preferences_update on %1$I.user_preferences
      for update to authenticated using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()))$ddl$, s);

    -- Table privileges: RLS decides which rows, the role still needs table grants.
    execute format('grant select, insert, update on %1$I.user_preferences to authenticated', s);
    -- Admin (service_role bypasses RLS) reads preferences across learners.
    execute format('grant select on %1$I.user_preferences to service_role', s);
  end loop;
end $$;
