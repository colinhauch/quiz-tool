-- Per-environment schemas: dev + test (#71 pipeline / schema-per-env).
--
-- Single Supabase project, one Postgres database, one auth.users pool. Data is
-- isolated per environment by giving dev and test their OWN schema, each a
-- from-scratch copy of the production `public` structure (answers,
-- pack_selection, pack_selection_state + RLS + the set_pack_selection RPC).
-- prod stays on `public` and is deliberately NOT touched here.
--
-- The server selects a schema at runtime via the DB_SCHEMA wrangler var, which
-- becomes supabase-js `createClient(url, key, { db: { schema } })`. RLS still
-- keys on the shared auth.uid(), so a user's dev rows and prod rows are just
-- different tables — behaviourally correct, only the failure domain is shared.
--
-- NOTE: PostgREST only serves a schema that is on the project's exposed-schemas
-- list. `dev` and `test` must be added there (Settings → API, or the pgrst
-- db_schemas config) or the API returns "schema must be one of the following".
--
-- Idempotent: safe to re-run. Uses if-not-exists / drop-then-create throughout.

do $$
declare
  s text;
begin
  foreach s in array array['dev', 'test']
  loop
    -- Schema + role visibility. PostgREST switches into anon/authenticated; both
    -- need USAGE to resolve objects, table privileges are granted per-table below.
    execute format('create schema if not exists %I', s);
    execute format('grant usage on schema %I to anon, authenticated', s);

    -- answers: the answer log. user_id defaults to auth.uid(), pinned by RLS.
    execute format($ddl$
      create table if not exists %1$I.answers (
        id       bigint generated always as identity primary key,
        user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
        card_id  text not null,
        input    text not null,
        correct  boolean not null,
        asked_at timestamptz not null
      )$ddl$, s);
    execute format('create index if not exists answers_user_id_idx on %1$I.answers (user_id, id)', s);
    execute format('alter table %1$I.answers enable row level security', s);
    execute format('alter table %1$I.answers force row level security', s);
    execute format('drop policy if exists answers_select on %1$I.answers', s);
    execute format($ddl$create policy answers_select on %1$I.answers
      for select to authenticated using (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists answers_insert on %1$I.answers', s);
    execute format($ddl$create policy answers_insert on %1$I.answers
      for insert to authenticated with check (user_id = (select auth.uid()))$ddl$, s);

    -- pack_selection: which packs the learner chose (whole set rewritten on save).
    execute format($ddl$
      create table if not exists %1$I.pack_selection (
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        pack_id text not null,
        primary key (user_id, pack_id)
      )$ddl$, s);
    execute format('alter table %1$I.pack_selection enable row level security', s);
    execute format('alter table %1$I.pack_selection force row level security', s);
    execute format('drop policy if exists pack_selection_select on %1$I.pack_selection', s);
    execute format($ddl$create policy pack_selection_select on %1$I.pack_selection
      for select to authenticated using (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists pack_selection_insert on %1$I.pack_selection', s);
    execute format($ddl$create policy pack_selection_insert on %1$I.pack_selection
      for insert to authenticated with check (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists pack_selection_delete on %1$I.pack_selection', s);
    execute format($ddl$create policy pack_selection_delete on %1$I.pack_selection
      for delete to authenticated using (user_id = (select auth.uid()))$ddl$, s);

    -- pack_selection_state: one row per user marking a selection was ever saved.
    execute format($ddl$
      create table if not exists %1$I.pack_selection_state (
        user_id  uuid primary key default auth.uid() references auth.users (id) on delete cascade,
        saved_at timestamptz not null
      )$ddl$, s);
    execute format('alter table %1$I.pack_selection_state enable row level security', s);
    execute format('alter table %1$I.pack_selection_state force row level security', s);
    execute format('drop policy if exists pack_selection_state_select on %1$I.pack_selection_state', s);
    execute format($ddl$create policy pack_selection_state_select on %1$I.pack_selection_state
      for select to authenticated using (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists pack_selection_state_upsert on %1$I.pack_selection_state', s);
    execute format($ddl$create policy pack_selection_state_upsert on %1$I.pack_selection_state
      for insert to authenticated with check (user_id = (select auth.uid()))$ddl$, s);
    execute format('drop policy if exists pack_selection_state_update on %1$I.pack_selection_state', s);
    execute format($ddl$create policy pack_selection_state_update on %1$I.pack_selection_state
      for update to authenticated using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()))$ddl$, s);

    -- Table privileges: RLS decides which rows, the role still needs table grants.
    execute format('grant select, insert on %1$I.answers to authenticated', s);
    execute format('grant select, insert, delete on %1$I.pack_selection to authenticated', s);
    execute format('grant select, insert, update on %1$I.pack_selection_state to authenticated', s);

    -- set_pack_selection: atomic whole-set rewrite, SECURITY INVOKER so RLS and
    -- auth.uid() apply as in a direct query. search_path pinned to this schema so
    -- the unqualified table names inside resolve to the env's own tables.
    execute format($ddl$
      create or replace function %1$I.set_pack_selection(p_pack_ids text[])
      returns void
      language plpgsql
      security invoker
      set search_path = %1$L
      as $fn$
      begin
        delete from pack_selection where user_id = (select auth.uid());
        if array_length(p_pack_ids, 1) is not null then
          insert into pack_selection (pack_id) select unnest(p_pack_ids);
        end if;
        insert into pack_selection_state (saved_at) values (now())
        on conflict (user_id) do update set saved_at = excluded.saved_at;
      end;
      $fn$
    $ddl$, s);
    execute format('revoke execute on function %1$I.set_pack_selection(text[]) from public, anon', s);
    execute format('grant execute on function %1$I.set_pack_selection(text[]) to authenticated', s);
  end loop;
end $$;
