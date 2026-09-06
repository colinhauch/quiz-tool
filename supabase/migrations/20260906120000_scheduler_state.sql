-- Durable scheduler state, per learner (sdlc/features/persist-bag-state). One
-- JSONB document holds the two marble bags, the `drawn` exclusion set, the held
-- `current` card, and the ratio config — everything the filtered three-level
-- draw needs to resume a learner after a refresh, a new isolate, or a new device.
-- It is a disposable cache the persisted selection can rebuild; the answer log
-- and rating caches stay the source of truth.
--
-- Applied uniformly to public (prod) and the per-env schemas dev + test, so all
-- three stay structurally identical (see 20260821000000_env_schemas_dev_test).
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
    -- to its owner, exactly like pack_ability. The whole state is one JSONB value.
    execute format($ddl$
      create table if not exists %1$I.scheduler_state (
        user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
        state jsonb not null
      )$ddl$, s);
    execute format('alter table %1$I.scheduler_state enable row level security', s);
    execute format('alter table %1$I.scheduler_state force row level security', s);
    execute format('drop policy if exists scheduler_state_select on %1$I.scheduler_state', s);
    execute format($ddl$create policy scheduler_state_select on %1$I.scheduler_state
      for select to authenticated using (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists scheduler_state_insert on %1$I.scheduler_state', s);
    execute format($ddl$create policy scheduler_state_insert on %1$I.scheduler_state
      for insert to authenticated with check (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists scheduler_state_update on %1$I.scheduler_state', s);
    execute format($ddl$create policy scheduler_state_update on %1$I.scheduler_state
      for update to authenticated using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()))$ddl$, s);

    -- Table privileges: RLS decides which rows, the role still needs table grants.
    execute format('grant select, insert, update on %1$I.scheduler_state to authenticated', s);
  end loop;
end $$;
