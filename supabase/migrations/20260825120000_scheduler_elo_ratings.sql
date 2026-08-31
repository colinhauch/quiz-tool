-- Elo bag-of-bags scheduler, slice #119: the rating spine (spec #118,
-- specs/learning/scheduler.md). Adds the ask-time rating snapshot to the answer
-- log and the two cache tables the scheduler reads/writes online. Both caches
-- are rebuildable by replaying answers in asked_at order — the log stays the
-- source of truth.
--
-- Applied uniformly to public (prod) and the per-env schemas dev + test, so all
-- three stay structurally identical (see 20260821000000_env_schemas_dev_test).
--
-- Idempotent: add-column-if-not-exists, create-table-if-not-exists, and
-- drop-then-create policies throughout. Safe to re-run.

do $$
declare
  s text;
begin
  foreach s in array array['public', 'dev', 'test']
  loop
    -- -----------------------------------------------------------------------
    -- answers: snapshot the scheduler's rating INPUTS at ask time. Nullable —
    -- an answer to an edge not in the graph moves no rating and carries none.
    -- P(success) is intentionally not stored (derivable from difficulty+ability).
    -- -----------------------------------------------------------------------
    execute format('alter table %1$I.answers add column if not exists card_difficulty double precision', s);
    execute format('alter table %1$I.answers add column if not exists pack_ability    double precision', s);
    execute format('alter table %1$I.answers add column if not exists k_applied       double precision', s);
    execute format('alter table %1$I.answers add column if not exists rating_pack_id  text', s);

    -- -----------------------------------------------------------------------
    -- card_difficulty: GLOBAL Elo difficulty per card, plus its global answer
    -- count (which drives the K-factor). Not owned by any user — every learner's
    -- answers move it — so RLS is permissive: any authenticated caller may read
    -- and upsert. Tampering only corrupts a cache the answer log rebuilds.
    -- -----------------------------------------------------------------------
    execute format($ddl$
      create table if not exists %1$I.card_difficulty (
        card_id      text primary key,
        difficulty   double precision not null,
        answer_count integer not null
      )$ddl$, s);
    execute format('alter table %1$I.card_difficulty enable row level security', s);
    execute format('alter table %1$I.card_difficulty force row level security', s);
    execute format('drop policy if exists card_difficulty_select on %1$I.card_difficulty', s);
    execute format($ddl$create policy card_difficulty_select on %1$I.card_difficulty
      for select to authenticated using (true)$ddl$, s);
    execute format('drop policy if exists card_difficulty_insert on %1$I.card_difficulty', s);
    execute format($ddl$create policy card_difficulty_insert on %1$I.card_difficulty
      for insert to authenticated with check (true)$ddl$, s);
    execute format('drop policy if exists card_difficulty_update on %1$I.card_difficulty', s);
    execute format($ddl$create policy card_difficulty_update on %1$I.card_difficulty
      for update to authenticated using (true) with check (true)$ddl$, s);

    -- -----------------------------------------------------------------------
    -- pack_ability: per-(learner, pack) Elo ability. user_id defaults to
    -- auth.uid() and RLS pins every row to its owner, exactly like pack_selection.
    -- -----------------------------------------------------------------------
    execute format($ddl$
      create table if not exists %1$I.pack_ability (
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        pack_id text not null,
        ability double precision not null,
        primary key (user_id, pack_id)
      )$ddl$, s);
    execute format('alter table %1$I.pack_ability enable row level security', s);
    execute format('alter table %1$I.pack_ability force row level security', s);
    execute format('drop policy if exists pack_ability_select on %1$I.pack_ability', s);
    execute format($ddl$create policy pack_ability_select on %1$I.pack_ability
      for select to authenticated using (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists pack_ability_insert on %1$I.pack_ability', s);
    execute format($ddl$create policy pack_ability_insert on %1$I.pack_ability
      for insert to authenticated with check (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists pack_ability_update on %1$I.pack_ability', s);
    execute format($ddl$create policy pack_ability_update on %1$I.pack_ability
      for update to authenticated using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()))$ddl$, s);

    -- Table privileges: RLS decides which rows, the role still needs table grants.
    execute format('grant select, insert, update on %1$I.card_difficulty to authenticated', s);
    execute format('grant select, insert, update on %1$I.pack_ability to authenticated', s);
  end loop;
end $$;
