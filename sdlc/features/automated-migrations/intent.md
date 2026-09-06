# Intent: automated Supabase migration application on merge

Status: accepted

## Problem

There is no migration pipeline. `supabase/migrations/*.sql` files are a *record*
of SQL someone ran by hand via the Supabase MCP, not a thing that runs on merge,
deploy, or boot (`docs/deploy/migrations.md`). So a migration can be written,
reviewed, merged, and deployed while the table it creates never exists in the
live schema. That just happened: `persist-bag-state` shipped `scheduler_state`,
the Worker deployed to `dev` on merge, and every `/api/question` returned 500
because the code read a table nobody had created. The fix was pasting SQL into
the dashboard by hand — and the same trap is still armed for the next promotion
to `test` and `prod`.

## Why it matters

The manual step is invisible until it fails, and it fails as a production
outage, not a warning. It couples "the code is merged" to "someone remembered to
run the SQL, correctly, against the right schemas" — a dependency on memory that
has already broken once and will break again on every schema-changing feature.
It also blocks confident promotion: `dev → test → prod` is supposed to be a
gated flow, but today each hop hides an out-of-band manual act with no record
that it happened.

## Proposed outcome

Merging a schema change to a long-lived branch applies its migrations to that
environment automatically, as part of the same deploy — so code never runs
against a schema it expects but doesn't have.

- **Additive migrations apply automatically** (new table/column/policy/grant);
  **destructive ones pause for a human approve** in the Action (drop/alter/
  backfill/rename). Speed where it's safe, a gate where it isn't.
- **All three environments** (`dev`/`test`/`prod`) are wired, matching the
  promotion flow.
- **A failed migration blocks that environment's deploy** — the Worker does not
  ship against a schema that didn't get its change, which is exactly what caused
  the 500.
- The migration history stops drifting from the repo: what's applied is what's
  committed.

## Affected users & systems

- **The operator (solo dev)** — the person who today runs SQL by hand and eats
  the outage when they forget.
- **Learners** — indirectly: they're who sees the 500 when a table is missing.
- **CI/CD** — `.github/workflows/ci.yml` (the `checks` gate) and the CF Workers
  Builds deploy per branch; the automation sits alongside these.
- **The one Supabase project** (`fmxjevgxlnqujsqeqfwt`) and its three schemas
  (`public`/`dev`/`test`), plus its migration-history table.
- **`supabase/migrations/`** as the canonical source, and `docs/deploy/
  migrations.md` / `supabase-next-steps.md` §1 / issue #88, which this resolves.

## Constraints

- **One database, no staging copy.** `dev`/`test`/prod are schemas in a single
  project; an automated statement reaches real data with nothing in between.
- **Real data lives in `dev`, on the Supabase free plan** — no self-serve
  restore, no point-in-time recovery. The guardrail on destructive migrations is
  not optional given this.
- **Migrations are already applied out-of-band**, so the history table is
  drifted from the files (a recorded version even differs from its filename). A
  one-time reconciliation is a precondition before any auto-apply can trust the
  history.
- **Migrations must keep hitting every schema.** The existing loop-over-
  `['public','dev','test']`, idempotent, `%I`-quoted pattern stays the authoring
  convention.
- **A DB connection secret must live in GitHub** (Actions secrets) for the
  runner to reach Postgres — only the operator can add it.
- Don't weaken the existing manual runbook until the automation is trusted; it
  stays the fallback.

## Out of scope

- Rewriting or replacing the existing migrations.
- Adding a second Supabase project / true staging environment.
- Automated rollback / down-migrations (there are none today; recovery stays the
  backup-and-restore ritual in the runbook).
- Changing the schema-per-environment model, or the CF Workers Builds deploy
  itself beyond ordering the migration ahead of it.
- Data backfills or any application-level data migration.

## Open questions

- **Mechanism:** ~~Supabase CLI `db push` against the tracked history, vs. running
  the `.sql` files directly (e.g. psql).~~ **Resolved (2026-09-05): Supabase CLI
  `db push`** against the tracked history — consistent with the canonical apply
  path in `supabase-next-steps.md` §0. Requires the one-time reconciliation first.
  (Issue #88.)
- **Additive-vs-destructive detection:** who classifies a migration — a header
  tag the author sets, a static scan of the SQL, or a manifest? Getting this
  wrong is the risk (a destructive migration mislabelled additive runs
  unattended).
- **The one-time reconciliation:** exact steps to align the drifted history with
  the committed files without re-running or dropping anything.
- **Where the gate lives:** a GitHub Environments "required reviewers" approval,
  a manual `workflow_dispatch`, or a label. **Partly resolved (2026-09-05):** the
  gate policy is uniform across all three environments — **additive migrations
  apply unattended, destructive ones pause for approval, including on prod** (prod
  is *not* gated for additive-only changes). The *mechanism* of the gate (which of
  the three above) is still open for the spec.
- **Backups before auto-apply:** the runbook says "always back up first"; can/should
  the automation snapshot before applying, given the free-plan constraints?
- **Ordering with CF Workers Builds:** the deploy is triggered by CF on push, not
  by our Action — how do we guarantee migrate-then-deploy (and block the deploy on
  migration failure) when the two pipelines are separate?
