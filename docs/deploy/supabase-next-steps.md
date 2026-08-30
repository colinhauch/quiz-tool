# Supabase — next configuration steps

Written 2026-08-21, after the dev/test/prod **environments** were finished:
one Supabase project (`fmxjevgxlnqujsqeqfwt`), data isolated by Postgres schema
(prod→`public`, dev→`dev`, test→`test`), Workers auto-deploy per branch. This doc
is the **planning backlog for the *next* session** — nothing here is implemented
yet. Ordered by priority. Each item marks whether it needs a **decision** first or
is a straight **task**.

## Current state (baseline)
- 3 schemas live: `public` (built by the original 3 migrations), `dev` + `test`
  (built by `supabase/migrations/20260821000000_env_schemas_dev_test.sql`, a
  `DO`-loop over `['dev','test']`). All exposed to PostgREST.
- Migrations were applied **directly to the live project via the MCP**
  (`apply_migration`) — there is no automated migration pipeline. `supabase/`
  holds the SQL but nothing applies it on deploy.
- Auth/users are **shared** across all three envs (one `auth.users`, one signing
  key). No failure-domain isolation. Accepted pre-launch.
- prod has 0 real rows; still pre-launch.

---

## 1. Migration workflow across the 3 schemas  ⚠️ DECISION — highest priority
The dangerous gap now that schema-per-env is live: **how does a future schema
change reach all three schemas consistently?** Today it's inconsistent — `public`
was built by three plain migrations that hardcode `public`, while `dev`/`test`
were built by a separate DO-loop. A new table or RLS policy authored the old way
would land in `public` only.

Decisions to make:
- **Authoring convention.** Every schema-changing migration must apply to all env
  schemas. Options: (a) a reusable `create/alter … for each schema in (public,
  dev, test)` DO-loop pattern (what the env migration did); (b) a stored helper
  like `apply_to_env_schemas(sql text)`; (c) restructure so *all* envs (public
  included) are provisioned by one parameterized routine = single source of truth.
  Lean: (c) long-term, (a) as the interim rule.
- **Apply mechanism.** MCP `apply_migration` (manual, what we've used) vs
  `supabase db push` from the pipeline vs a GitHub Action on merge to `dev`.
  Decide the canonical path and whether it runs per-environment.
- Watch for schema drift: `list_migrations` + `get_advisors` after any DDL.

## 2. Disable or fix Supabase Branching  — DECISION, low effort
We chose schema-per-env, so Supabase **Branching is unused**, yet its default
`main` branch sits in `MIGRATIONS_FAILED` (noise, and a trap if someone later
assumes Branching is the isolation mechanism). Decide: turn Branching **off**, or
fix the failed branch and keep it as a future option. Recommendation: disable it
to remove the contradiction with the schema-per-env decision.

## 3. Auth hardening before real users  — TASKS (mostly HITL dashboard)
- **Publish the Google OAuth consent screen.** It's in **Testing** mode → only
  allow-listed test users can sign in with Google. Publish before any real user.
- **Custom SMTP.** Built-in email sender is rate-limited (~a few/hour) — fine for
  alpha, not for real magic-link traffic. Configure SMTP (branded templates
  already authored in `docs/deploy/email-templates/`, PR #69).
- **URL config review.** Confirm Site URL + redirect allow-list cover all three
  origins (`quiz`, `quiz-dev`, `quiz-test` + localhost). dev/test callbacks were
  added; re-verify after any domain change.
- **Session/JWT + protection settings.** Review access-token TTL, refresh
  rotation, leaked-password protection, and whether MFA is wanted.

## 4. Security advisors  — TASK
- Address the pre-existing `public.rls_auto_enable()` **SECURITY DEFINER**
  advisor finding (callable by anon/authenticated via RPC) — revoke execute or
  switch to invoker if not intentional. It predates our work.
- Make `get_advisors` (security + performance) a habit after every DDL change.

## 5. Local dev + integration-test parity  — TASK
- The `supabase-storage` integration tests are **skipped** (need `SUPABASE_URL` +
  `SUPABASE_SERVICE_KEY` in a gitignored `.env` to mint a throwaway user). Decide
  whether to run them against a dedicated schema (e.g. `test`) so they never
  pollute `public`, and wire them into CI.
- Consider the Supabase CLI local stack (`supabase start`) for offline dev instead
  of hitting the cloud project.

## 6. Lower-priority / later
- **DB type generation.** Wire `supabase gen types typescript` (or the MCP
  `generate_typescript_types`) so DB types stay in sync with code.
- **Service key.** None is set today (good — the request path only needs the
  publishable key + user JWT). If a genuine admin/batch path appears, add
  `SUPABASE_SERVICE_KEY` as a **per-env** wrangler secret, kept off the request
  path.
- **Seeding dev/test.** If demoing dev/test needs fixtures, design a seed strategy
  (data is user-scoped by RLS, so seeds need a user context).
- **Backups / PITR.** Free-plan limits; revisit near launch.

---

### Suggested order for next session
1 (migration workflow — the real risk) → 2 (kill Branching noise) → 4 (advisor fix,
quick) → 3 (auth hardening, chunk of HITL) → 5 → 6. Consider filing 1–3 as GitHub
issues (project convention: specs/PRDs = issues) at the start of the session.
