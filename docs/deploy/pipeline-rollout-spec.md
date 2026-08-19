# Spec: Development pipeline (branches, CI, CD)

> Status: ready-for-agent. Synthesized from a design conversation on 2026-08-18/19.
> This is a **PRD to be split into tickets**. The durable procedure doc it produces
> is `docs/deploy/pipeline.md` (a deliverable within this spec, not yet written).

## Problem Statement

There is no development pipeline. The whole app (UI + API on one Cloudflare
Worker) is deployed by running `wrangler deploy` by hand — usually by an agent —
with no automated tests gating the change and no separation between what is being
tried out and what real users see. There is one long-lived branch (`main`), ~30
stale local/remote branches, and no CI at all. "Deploy" is a manual, unguarded,
all-or-nothing act against production, and there is no place to preview a change
running live before it ships.

The developer wants a proper-but-basic CI/CD pipeline: work on a feature branch,
open a PR, have tests run and gate the merge, collect features on an integration
branch, promote to a pre-production environment to look at it live, then promote
to production — with production deploying automatically from git the way it does
in Cloudflare's git integration.

## Solution

A three-tier promotion pipeline built from two systems the developer already
uses and likes:

- **GitHub** owns source control, the merge gates (CI), and branch protection.
- **Cloudflare Workers Builds** owns deployment (git-connected, automatic).

Work flows through three long-lived branches by promotion:

```
feat/*  --(PR, squash)-->  dev  --(PR, merge)-->  test  --(PR, merge)-->  prod
```

- **dev** — integration branch; features land here.
- **test** — pre-production; gets a stable live preview URL to eyeball changes.
- **prod** — production; merging here auto-deploys the whole app to
  `quiz.colinhauch.com`.

GitHub Actions runs tests on every PR and blocks the merge until they pass.
Cloudflare Workers Builds, connected to the repo, deploys `prod` to the
production domain and gives every non-production branch its own stable
`<branch>-quiz-tool.<subdomain>.workers.dev` preview URL, posted as a PR comment.

## User Stories

1. As the developer, I want three long-lived branches named `prod`, `test`, and `dev`, so that code has a clear promotion path from integration to production.
2. As the developer, I want short branch names, so that they are quick to type and read.
3. As the developer, I want `prod` to be the default/production branch (renamed from `main`), so that there is exactly one production branch and no lingering `main`.
4. As the developer, I want to work on `feat/*` branches and open a PR into `dev`, so that no unreviewed/untested code lands on an integration branch directly.
5. As the developer, I want CI to run automatically on every PR, so that I never merge code that fails typecheck, unit tests, or pack validation.
6. As the developer, I want the CI check to be *required* before a merge is allowed, so that the gate cannot be bypassed by accident.
7. As the developer, I want fast checks on PRs into `dev` and `test` (typecheck, unit tests, pack validation), so that the common path stays quick.
8. As the developer, I want a place in the pipeline (the `dev`→`test` gate) reserved for slower journey/integration tests, so that I can add them later without slowing every PR.
9. As the developer, I want promotion from `test`→`prod` to require that `test`'s checks were already green rather than re-running a heavy suite, so that promotion is fast and I am not paying for redundant runs.
10. As the developer, I want to collect many merged features on `dev` before promoting, so that I can batch a coherent set of changes into a release.
11. As the developer, I want to promote `dev` into `test` with a PR, so that promotion is an explicit, reviewable act.
12. As the developer, I want `test` mapped to a stable preview URL, so that I can look at the pre-production app live before it ships.
13. As the developer, I want every non-production branch (including feature branches) to get its own stable preview URL posted to the PR, so that I can preview any change running live without affecting production.
14. As the developer, I want merging to `prod` to automatically deploy the whole app (UI + API) to `quiz.colinhauch.com`, so that shipping is a git operation, not a manual command.
15. As the developer, I want feature branches squashed into `dev`, so that `dev` history stays tidy and each feature is one commit.
16. As the developer, I want promotions (`dev`→`test`, `test`→`prod`) to use merge commits, so that the three long-lived branches share history and never diverge into phantom conflicts.
17. As the developer, I want feature branches auto-deleted after merge, so that the branch list stays clean.
18. As the developer, I want a PR to be up-to-date with its target before merging, so that CI runs against the state that will actually land.
19. As the developer, I want branch protection to *not* apply to me (admin), so that I can bypass in a genuine emergency, given that merge-direction is enforced by discipline anyway.
20. As the developer, I want the merge-direction rule (prod←test←dev) enforced by discipline for now rather than tooling, so that I avoid the complexity of a custom source-branch-check Action while the team is just me.
21. As the developer, I want the whole procedure documented in `docs/deploy/pipeline.md` with pointers from the root `CLAUDE.md` and `packages/server/CLAUDE.md`, so that future me and agents can find and follow it.
22. As the developer, I want the Cloudflare-dashboard connection step recorded in `docs/deploy/hitl-checklist.md`, so that the one human-only setup step is tracked.
23. As the developer, I want the ~30 stale branches pruned and the ~10 open PRs retargeted off old `main`, so that the repo reflects the new model.
24. As an agent picking up work, I want each pipeline setup task as a discrete ticket with scope and acceptance criteria, so that I can execute one unit at a time.

## Implementation Decisions

### Branch model

- Rename `main` → `prod`; set `prod` as the GitHub default branch and the
  Cloudflare production branch.
- Create `test` and `dev` off `prod`.
- Promotion only: `feat/*` → `dev` → `test` → `prod`.
- Merge-direction (prod only from test, test only from dev) is enforced by
  **discipline**, not a GitHub Action. GitHub cannot natively restrict a PR's
  source branch; a custom check is deliberately deferred.

### Merge strategy

- `feat/*` → `dev`: **squash** (feature branch is disposable, auto-deleted).
- `dev` → `test` and `test` → `prod`: **merge commit** (keeps the long-lived
  branches in sync; squashing promotions would make them diverge and generate
  phantom conflicts on identical code).
- GitHub only allows merge styles repo-wide, not per-branch. Therefore: enable
  **both** squash and merge-commit, **disable rebase-merge**, and rely on
  discipline to pick the right button per gate. This rule lives in the docs.
- Feature branches are rebased onto their target to satisfy the
  up-to-date-before-merge rule; long-lived branches are never rebased/rewritten.

### CI — GitHub Actions (the merge gate)

- One workflow triggered on `pull_request` targeting `dev`, `test`, and `prod`.
- Steps: checkout, set up Node 24 + pnpm 10.33, `pnpm install`, then
  `tsc -b` (typecheck), `vitest run` (unit), `packs:validate`.
- No secrets. The Supabase service key is **not** added to GitHub Actions; the
  supabase-js store integration tests remain local-only for now.
- The `dev`→`test` gate is where slower journey/integration tests will be added
  later; today it runs the same fast suite (nothing heavier exists yet).
- `test`→`prod` adds no new run; it requires `test`'s checks to already be green.
- The workflow's job/check name must be stable so branch protection can require
  it by name.

### CD — Cloudflare Workers Builds (deployment)

- Connect the repo in Workers Builds (human step; see HITL below).
- Production branch = `prod`; deploy command = `wrangler deploy` →
  `quiz.colinhauch.com`.
- Enable **non-production branch builds**; non-prod deploy command stays the
  default `wrangler versions upload`, which yields a stable per-branch preview
  URL `<branch>-quiz-tool.<subdomain>.workers.dev`, posted to the PR.
- Root directory = `packages/server`; the existing `[build]` step
  (`pnpm bundle-packs`) regenerates the pack bundle before every deploy.
- This replaces the manual `wrangler deploy` path as the way production changes.

### Environments / data

- **Known debt, accepted for alpha:** Workers cannot vary bindings per branch
  within one Worker, so all preview versions share **production's Supabase
  database** (`fmxjevgxlnqujsqeqfwt`). `test` and `dev` previews read/write prod
  data. Isolating them would require separate Workers / Wrangler environments,
  which was deliberately declined for now. Revisit before real users' data is at
  risk.

### Branch protection (GitHub)

- On `dev`, `test`, `prod`: require a PR, require the CI status check to pass,
  require the branch to be up-to-date before merge.
- Repo settings: auto-delete head branch on merge; allow squash + merge-commit;
  disable rebase-merge.
- Do **not** include administrators in the rules.

### Documentation

- `docs/deploy/pipeline.md`: full procedure (branch model, gates, merge rules,
  how CF deploys, the shared-DB debt).
- Root `CLAUDE.md` and `packages/server/CLAUDE.md`: short pointers to it.
- `docs/deploy/hitl-checklist.md`: add the Workers Builds connect step.

## Testing Decisions

This spec is infrastructure, not a code module, so the "seam" is the pipeline's
own observable behavior rather than a unit under test. Verification surfaces:

- **The CI workflow is the primary test seam.** A good check here exercises
  external behavior (does the suite pass on a clean checkout?), not internals.
  Prior art: `pnpm test` (`vitest run`), `pnpm typecheck` (`tsc -b`), and
  `pnpm packs:validate` already exist and are what the workflow runs. The
  workflow must go green on the current tip before protection requires it.
- **Deploy behavior is verified by observation**, mirroring the existing HITL
  checklist checks: after a `prod` deploy, `GET /health` → 200; after a non-prod
  push, the branch preview URL resolves and serves the app.
- **Branch protection is verified** by confirming a PR with a failing check
  cannot be merged, and that direct pushes to the protected branches are refused
  (for non-admins).
- Modules under test are unchanged by this spec; no new application tests are in
  scope. The journey/integration test tier is explicitly deferred to a later
  ticket at the `dev`→`test` gate.

## Out of Scope

- Tooling-enforced merge-direction (source-branch-check Action) — discipline for
  now.
- Per-environment data isolation / a separate Supabase for non-prod previews —
  accepted debt.
- Journey / end-to-end / integration tests in CI, and the Supabase service key
  in GitHub secrets — deferred; the gate is reserved but empty.
- Custom preview domains (e.g. `test.quiz.colinhauch.com`) — native
  `*.workers.dev` preview URLs are sufficient.
- Rollbacks, gradual deploys, and staging SMTP/email deliverability.

## Further Notes

- Renaming `main`→`prod` retargets the ~10 open PRs and requires updating the CF
  production-branch setting; this is captured as housekeeping (T6) and as part of
  the CF connect step (T4).
- The single human-only step is connecting Workers Builds in the Cloudflare
  dashboard (no API available to the agent). Everything else — branches,
  protection, workflow, docs, housekeeping — is agent-doable via `git`, `gh`, and
  file edits.

---

## Suggested ticket split

Dependency-ordered. Owner = who can execute it.

- **T1 — Establish branch topology** (agent). Rename `main`→`prod`, set default
  branch, create `test` and `dev`, push. *Blocks T2, T4, T6.*
- **T2 — Repo settings + branch protection** (agent). Squash+merge on,
  rebase-merge off, auto-delete head branch; protect `dev`/`test`/`prod` (require
  PR + CI check + up-to-date; admins excluded). *Depends on T1, T3 (needs the CI
  check name).*
- **T3 — GitHub Actions CI workflow** (agent). `.github/workflows/ci.yml` running
  `tsc -b` + `vitest run` + `packs:validate` on PRs to the three branches; stable
  check name; green on current tip. *Depends on nothing; referenced by T2.*
- **T4 — Connect Cloudflare Workers Builds** (**human**). Dashboard: connect repo,
  production branch = `prod`, enable non-prod builds, root dir = `packages/server`,
  deploy = `wrangler deploy`. Retire manual deploy. *Depends on T1.*
- **T5 — Pipeline documentation** (agent). Write `docs/deploy/pipeline.md`; add
  pointers to root `CLAUDE.md` and `packages/server/CLAUDE.md`; add CF-connect
  step to `docs/deploy/hitl-checklist.md`. *Depends on T1–T4 decisions.*
- **T6 — Housekeeping** (agent + human). Retarget open PRs off old `main`; prune
  stale `worktree-*` / merged branches. *Depends on T1.*
