# Spec: automated Supabase migration application on merge  (from intent)

Status: draft

Requirements + design in one pass. Produced from `intent.md`, constrained by
`docs/deploy/migrations.md` (the manual runbook this automates), `wrangler.toml`
(the deploy model), and issue #88 / #146.

## Summary

Today `supabase/migrations/*.sql` files are a record of SQL applied by hand via
the MCP; nothing applies them on merge or deploy. A schema change can merge,
deploy, and 500 in production because the table it reads was never created —
which just happened with `scheduler_state` on `dev`. This feature makes a merge
to a long-lived branch apply that branch's migrations to its schema
**automatically, in the same pipeline as the deploy, before the Worker ships** —
so code never runs against a schema missing its change. Additive migrations
apply unattended; destructive ones **stop the pipeline** for the human to run
the existing runbook. The mechanism is the Supabase CLI `db push` against the
tracked migration history (decided in intent).

## Requirements

Each is testable; the plan proves each.

1. **Migrate before deploy, same pipeline.** On a push to `dev`/`test`/`prod`,
   the branch's migrations apply to that branch's schema *before* `wrangler
   deploy` runs for that branch.
2. **A failed migration blocks that branch's deploy.** If the apply step fails
   (any non-zero exit), `deploy:ci` does not run — the Worker does not ship
   against a schema that didn't get its change.
3. **Additive migrations apply unattended.** A migration classified additive and
   carrying the explicit additive marker applies with no human in the loop, on
   all three environments including prod.
4. **Destructive / unclassified migrations halt the pipeline (fail-closed).** A
   migration matching any destructive pattern, or lacking the additive marker, is
   *not* auto-applied on any environment; the pipeline fails loudly and directs
   the operator to `docs/deploy/migrations.md`. This is the "gate" — uniform
   across dev/test/prod (per intent decision).
5. **Classification is default-deny.** A migration auto-applies only if BOTH (a)
   it carries an explicit `-- migration: additive` header AND (b) a static scan
   finds no destructive pattern. Missing marker → halt. Destructive pattern
   present despite an additive marker → halt (marker cannot override the scan).
6. **The classifier is a pure, unit-tested function** over migration file text →
   `additive | needs-review`, with an exhaustive fixture suite (the single new
   test seam).
7. **History reconciliation is a documented one-time precondition**, run and
   verified before the first auto-apply is enabled; after it, `db push` is the
   canonical apply path and MCP `apply_migration` is retired.
8. **The manual runbook stays the destructive path and the fallback**, unweakened
   (intent constraint). Nothing in this feature removes the ability to apply by
   hand.
9. **Migrations keep hitting every schema** via the existing loop-over-
   `['public','dev','test']`, idempotent, `%I`-quoted authoring convention —
   unchanged. (Note: `db push` per-branch applies files whose *body* loops all
   schemas; see Flagged concerns.)

## Design

### Where it runs (resolves intent Q6, ordering)

CF Workers Builds is the deploy pipeline: on push to a long-lived branch it runs
the `wrangler.toml` `[build]` command, then `packages/server` `deploy:ci`
(branch-aware `wrangler deploy [--env …]`). GitHub Actions `ci.yml` only runs on
*PRs* (the `checks` gate) and does no deploy — so it cannot own ordering against
a CF-triggered deploy. Therefore the migration apply must live **in the CF Builds
pipeline, ahead of `deploy:ci`**, which is also the "one pipeline, no second
system" recommendation of #146.

Concretely: a new `migrate:ci` script (in `packages/server`, alongside
`deploy:ci`) runs `supabase db push` for the current `WORKERS_CI_BRANCH`, and the
CF Builds deploy command becomes `pnpm migrate:ci && pnpm deploy:ci`. `db push`
returning non-zero aborts the `&&` chain — requirement 2, for free.

### The gate, fail-closed (resolves intent Q4)

CF Builds has no "required reviewers" approval button (GitHub Environments do,
but Environments gate Actions, not CF Builds). Rather than split into two
pipelines — which the intent puts out of scope ("don't change the CF deploy
beyond ordering the migration ahead of it") — the gate is a **fail-closed stop**:
`migrate:ci` first classifies every pending (unapplied) migration; if any is
`needs-review`, it exits non-zero *before* pushing, printing the runbook pointer.
The human then applies that migration via `docs/deploy/migrations.md` (which
records it in history), and re-triggers the build; now nothing is pending and the
pipeline proceeds. The "approval" is thus the human doing the deliberate,
backed-up destructive apply the runbook already prescribes — reusing the trusted
path instead of inventing an unattended destructive apply.

### Classification (resolves intent Q2)

A pure function `classifyMigration(sql: string): 'additive' | 'needs-review'`:

- Returns `additive` iff the file contains the header marker `-- migration:
  additive` AND no destructive pattern matches.
- Destructive patterns (case-insensitive, comment-stripped): `drop table`,
  `drop column`, `drop policy` (bare drops), `alter column … type`, `set not
  null`, `update`/`delete` as DML statements, `rename`, `truncate`. Also flag
  `on delete cascade` (installs a destructive future path — the feedback-table
  lesson in the runbook) as `needs-review`.
- Everything else, including a missing marker, → `needs-review`.

Author contract: additive migrations opt in with the one-line header; anything
unmarked is treated as needing review. This is deliberately conservative — a
mislabeled destructive migration is the top risk (intent), so the scan overrides
the marker and the default is deny.

### Determining "pending" migrations

`supabase migration list` diffs local files against the remote history table for
the linked project. `migrate:ci` classifies exactly the files that list reports
as not-yet-applied, so an already-applied destructive migration never re-halts
the pipeline.

### Reconciliation precondition (resolves intent Q3)

Before enabling auto-apply, the drifted history is reconciled once (per
`supabase-next-steps.md` §0): `supabase migration repair --status reverted
<phantom-version>` for the known apply-time-stamped versions (e.g. the
`20260821061407` / `20260827065412` drift), then `supabase db push` to align. All
existing migrations are idempotent, so re-apply is safe. `migration list` fully
aligned is the gate to flip the pipeline on. This is a documented manual step in
the plan, not code.

### Secrets & config

`SUPABASE_ACCESS_TOKEN` (and, if `db push` needs it, the DB password / pooler
URL) added as CF Workers Builds environment secrets — only the operator can do
this (intent constraint). `supabase link --project-ref fmxjevgxlnqujsqeqfwt` (or
a committed `supabase/config.toml` project ref) so the CLI targets the project in
CI. No service key on the request path (unchanged).

### Backups under auto-apply (resolves intent Q5)

The unattended path is additive-only (requirement 3), and additive DDL cannot
destroy existing rows — so the auto-apply path does **not** attempt an automated
snapshot (which is awkward on the free plan and in CI anyway). Every destructive
migration goes through the runbook, whose step 1 is the mandatory scratch-table
backup. Thus "back up before every migration" is preserved exactly where it can
lose data, and skipped only where it provably cannot.

## Flagged concerns

- **`db push` per-branch vs. schema-loop body.** `db push` applies a file to the
  linked project against the tracked history; our files loop *inside* over all
  three schemas. Pushing on the `dev` branch would run the whole loop (touching
  `public`/`test` too), and the history table is project-global, so the second
  branch's push sees the file already applied. This needs to be pinned down in
  the plan: likely `db push` runs once (on one branch, e.g. prod) and is a no-op
  on the others, OR the authoring convention shifts to per-schema files. **This
  is the load-bearing open item** and should be resolved with a prototype push
  against `dev` before wiring CI. (Ties to requirement 9.)
- **CF Builds secret exposure.** `SUPABASE_ACCESS_TOKEN` in CF Builds grants
  broad project access from an automated context; a compromised build could run
  arbitrary SQL. Accepted as the cost of automation, but worth noting vs. the
  current no-CI-secret posture (`ci.yml` deliberately holds no Supabase secret).
- **No approval UI.** Destructive changes get a hard stop, not a one-click
  approve. That is heavier for the operator than a GitHub Environments button,
  but avoids the out-of-scope two-pipeline rebuild. Revisit if destructive
  migrations become frequent.

## Open questions carried from intent

- **Q1 Mechanism** — Resolved in intent: Supabase CLI `db push`.
- **Q2 Additive-vs-destructive detection** — Resolved (Design → Classification):
  explicit additive header + fail-closed static scan, default-deny.
- **Q3 Reconciliation** — Resolved as a documented one-time precondition
  (Design → Reconciliation); exact repair commands land in the plan.
- **Q4 Where the gate lives** — Resolved: fail-closed stop inside `migrate:ci`,
  uniform across all environments (per intent decision); destructive apply routes
  to the manual runbook.
- **Q5 Backups before auto-apply** — Resolved: unattended path is additive-only,
  so no automated snapshot; destructive path keeps the runbook's mandatory
  backup.
- **Q6 Ordering with CF Workers Builds** — Resolved: `pnpm migrate:ci && pnpm
  deploy:ci` in the CF Builds command; failure aborts the chain before deploy.
- **DEFERRED to plan:** the `db push` per-branch vs. schema-loop interaction (see
  Flagged concerns) — resolve via a prototype push before CI wiring.

## Links

Intent: sdlc/features/automated-migrations/intent.md
Related: issue #88 (mechanism), issue #146 (automate apply), docs/deploy/migrations.md, docs/deploy/supabase-next-steps.md §0–1
