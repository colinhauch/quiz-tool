-- Feedback pipeline, slice 1 (issue #161 / spec #160).
--
-- Creates the `feedback` table with insert-only RLS across the three
-- schema-per-env schemas (public = prod, dev, test), mirroring the pattern the
-- answers / pack_selection env migration uses (a DO loop over the schema names).
-- Feedback is new in every environment, so all three are built the same way here.
--
-- RLS: enabled AND forced. An insert-only policy for `authenticated`
-- (with check user_id = auth.uid()) and NO select policy — so authenticated
-- clients can insert but can never read feedback back. Only the admin's
-- `service_role` (which bypasses RLS) reads the table. Grants follow suit:
-- insert to `authenticated`, select to `service_role`.
--
-- APPLIED 2026-08-30 to the live project via the Supabase MCP `apply_migration`,
-- as the earlier migrations were — there is no auto-apply pipeline yet (see
-- docs/deploy/migrations.md and issue #88). The filename matches the version
-- recorded in the migration history so the repo and the database agree.

do $$
declare
  s text;
begin
  foreach s in array array['public', 'dev', 'test'] loop
    execute format($f$
      create table if not exists %1$I.feedback (
        id          bigint generated always as identity primary key,
        user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
        kind        text not null check (kind in ('general', 'question')),
        card_id     text,
        comment     text not null,
        context     jsonb,
        status      text not null default 'unresolved' check (status in ('unresolved', 'resolved')),
        created_at  timestamptz not null default now()
      );

      alter table %1$I.feedback enable row level security;
      alter table %1$I.feedback force row level security;

      -- Insert-only for signed-in clients: they may write their own rows and
      -- nothing else. There is deliberately no select policy.
      drop policy if exists feedback_insert_own on %1$I.feedback;
      create policy feedback_insert_own
        on %1$I.feedback
        for insert
        to authenticated
        with check (user_id = (select auth.uid()));

      grant insert on %1$I.feedback to authenticated;
      grant select on %1$I.feedback to service_role;
    $f$, s);
  end loop;
end $$;
