# Running Supabase migrations safely

**There is no migration pipeline.** Nothing applies `supabase/migrations/*.sql`
on deploy, on merge, or on boot. Those files are a *record* of SQL that was run
by hand, not a thing that runs. Applying a migration is a manual, deliberate act
performed against the one live project (`fmxjevgxlnqujsqeqfwt`) via the Supabase
MCP. Picking the canonical mechanism is still an open decision — see
`supabase-next-steps.md` §1 and issue #88.

Two facts make this riskier than it looks, and everything below follows from them:

1. **There is one database and no staging copy.** `dev`, `test`, and prod are
   Postgres *schemas* in the same project, not separate projects. A careless
   statement reaches real data with nothing in between.
2. **The real data is in `dev`, not prod.** As of 2026-08-30: `dev` holds 234
   answers across 3 users; `public` (prod) and `test` are empty. The instinct is
   to guard `public` — that is the wrong schema. Guard `dev`.

---

## The procedure

### 1. Read the SQL and classify it

Before anything else, decide which kind of change this is. It determines whether
steps 3 and 6 are optional or mandatory.

**Additive — safe.** Cannot destroy data because it only creates things that do
not exist yet:
- `create table if not exists`
- `add column` that is nullable or has a default
- new index, new policy, new grant, new function

**Destructive — needs a backup first.** Can lose or corrupt existing rows:
- `drop table` / `drop column` / `drop policy`
- `alter column ... type` (silent coercion failures)
- `set not null` on a column with existing nulls
- any `update` / `delete` backfill
- `rename` (breaks running code mid-deploy)

If it is destructive, take a backup and read the rollback section before going on.

### 2. Baseline the row counts

Run this **before** applying, across all three schemas, and keep the output. This
is the single step that turns "I think it was fine" into proof.

```sql
select 'public' as env,
       (select count(*) from public.answers)          as answers,
       (select count(distinct user_id) from public.answers) as users,
       (select count(*) from public.card_difficulty)  as card_difficulty,
       (select count(*) from public.pack_ability)     as pack_ability,
       (select count(*) from public.pack_selection)   as pack_selection,
       (select count(*) from public.feedback)         as feedback
union all select 'dev',
       (select count(*) from dev.answers),
       (select count(distinct user_id) from dev.answers),
       (select count(*) from dev.card_difficulty),
       (select count(*) from dev.pack_ability),
       (select count(*) from dev.pack_selection),
       (select count(*) from dev.feedback)
union all select 'test',
       (select count(*) from test.answers),
       (select count(distinct user_id) from test.answers),
       (select count(*) from test.card_difficulty),
       (select count(*) from test.pack_ability),
       (select count(*) from test.pack_selection),
       (select count(*) from test.feedback);
```

Add a line whenever a table is added, or the baseline stops covering the database.

### 3. Back up, if the change is destructive

There is no automated backup step and no point-in-time restore on the current
plan. For a destructive change, snapshot the affected tables into scratch tables
in the same schema *in the same session as the migration*, so a bad result can be
restored without a support ticket:

```sql
create table dev.answers_backup_20260830 as select * from dev.answers;
```

Drop the scratch tables once the change is verified and has survived a few days
of real use — not immediately.

### 4. Write the SQL to hit every schema

Schema-per-env means a migration that names one schema silently migrates one
environment. Every schema-changing migration loops:

```sql
do $$
declare
  s text;
begin
  foreach s in array array['public', 'dev', 'test'] loop
    execute format($f$
      create table if not exists %1$I.feedback ( ... );
      alter table %1$I.feedback enable row level security;
      alter table %1$I.feedback force row level security;
      drop policy if exists feedback_insert_own on %1$I.feedback;
      create policy feedback_insert_own on %1$I.feedback ...;
    $f$, s);
  end loop;
end $$;
```

Two conventions inside that block, both load-bearing:

- **`%1$I`, never string concatenation.** `format`'s `%I` quotes the identifier
  properly; building SQL by concatenation is how you get an injection or a
  mis-quoted identifier.
- **Make it re-runnable.** `if not exists` on creates, and `drop policy if
  exists` before each `create policy`. A migration that fails halfway can then be
  re-run rather than hand-repaired — and hand-repairing a half-applied migration
  against live data is exactly the situation to design out.

### 5. Apply with `apply_migration`, not `execute_sql`

`apply_migration` records the migration in the history table. `execute_sql` runs
DDL with **no trace**, leaving the database ahead of its own record. Use
`execute_sql` only for the read-only queries in steps 2 and 6.

Pass a `name` matching the migration's filename. `apply_migration` stamps its own
timestamp, so the recorded version will differ from a timestamp you invented —
name the repo file after the version that actually gets recorded, so the two can
be reconciled later. (Known drift: `20260827000000_grant_admin_reads_to_service_role.sql`
is recorded as version `20260827065412`.)

### 6. Verify — counts, then intent

Re-run the **identical** query from step 2 and diff it against the saved output.
For an additive change every pre-existing number must be unchanged. For a
destructive one, the deltas must be exactly the ones you predicted before
applying; anything else is a rollback, not a puzzle to explain away.

Counts alone are not enough — they prove nothing was lost, not that the change
did what it was for. Verify the intent too. For RLS work that means confirming
the table is actually locked down, rather than assuming the policy took:

```sql
select n.nspname as schema,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       (select count(*) from pg_policies p
         where p.schemaname = n.nspname and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname = 'feedback' and n.nspname in ('public','dev','test')
order by n.nspname;
```

A table with `rls_enabled = false` and a policy defined is **open to the world** —
the policy is inert. Check the flag, not just the policy count.

Finish with `list_migrations` (is the new version recorded?) and `get_advisors`
(did this introduce an unprotected table or an unindexed foreign key?).

### 7. Commit the SQL

Add the file to `supabase/migrations/` — the canonical directory, alongside the
other six. Note in a header comment that it was applied, and when. The repo is
the only record of what the database looks like; a migration applied but never
committed is invisible to everyone including you.

---

## Rollback

There is no `down` migration and no automated restore. Rollback is whatever you
prepared in step 3:

- **Additive change:** usually nothing to undo. `drop table <schema>.<name>` if
  the table is genuinely new and unused. Verify it is empty first.
- **Destructive change with a backup:** restore from the scratch table.
- **Destructive change without a backup:** you are relying on Supabase's own
  backups and their retention window. Do not end up here — this is the entire
  reason step 3 exists.

## Checklist

- [ ] SQL read and classified additive vs destructive
- [ ] Row counts baselined across all three schemas, output saved
- [ ] Backup taken (destructive changes only)
- [ ] SQL loops over `['public','dev','test']` and is re-runnable
- [ ] Applied via `apply_migration`, name matching the filename
- [ ] Counts re-run and diffed — pre-existing data unchanged
- [ ] Intent verified (RLS flags, policies, grants — not just counts)
- [ ] `list_migrations` shows it; `get_advisors` is clean
- [ ] SQL committed to `supabase/migrations/`
