# The loop — this repo's AI-native SDLC

How this repo takes a feature from idea to production. It adapts Anthropic's
AI-native SDLC playbook (`docs/AI_SDLC_Article.md`) to a **single developer**.
The reasoning behind the adaptation lives in `sdlc/CLAUDE.md`; this file is
the operational how-to.

## The idea in one line

Every stage ends by **committing a markdown artifact**; the next stage begins by
**reading it**. The chain is `intent → spec → plan → code+tests → review`.

For a solo dev the chain isn't about role handoffs (there are none). It earns its
place two ways:
1. **Resume across sessions.** Under a ~5-hour token budget, a fresh session
   reads the last artifact cold instead of re-exploring. Work survives the
   boundary.
2. **Audit trail.** Git history records what was asked, what got built, and why.

## Where artifacts live

```
sdlc/features/<slug>/
  intent.md   spec.md   plan.md   review.md
```

- One folder per feature. `<slug>` is a short kebab-case name (e.g.
  `flag-hints`, `scheduler-elo`).
- **The file is the source of truth.** A GitHub issue or PR may link to it, but
  the committed markdown is canonical. (This reverses the earlier issues-first
  convention; see `sdlc/CLAUDE.md`.)
- Templates in `sdlc/templates/`. Copy what you need.

## Right-size the chain

Not every change needs four files. The chain is a tool, not a tax.

| Change | Make |
|---|---|
| Typo, dep bump, one-line fix | nothing — just commit |
| Small, well-understood fix | `plan.md` only (or nothing) |
| A real feature | full chain |
| Bug fix | `intent.md` (the repro) → failing test → fix |

When in doubt, write the artifact — a cheap read later beats a re-exploration.

## The stages

Each stage: what you produce, and what drives it. A stage's committed artifact is
the gate — you review it, then fire the next stage.

### 1. Plan → `intent.md`
Capture the raw idea in your own words: problem, why, outcome, constraints,
out-of-scope, open questions. Brainstorm with Claude first if it's fuzzy. Commit
before synthesizing anything. Set `Status: accepted` when you're ready to build.

### 2. Design → `spec.md`
Turn the accepted intent into requirements + design in one pass, constrained by
`CONTEXT.md` and the `domain-modeling` / `codebase-design` skills. Use `to-spec`.
Review it against the intent: does it solve the stated problem, are the open
questions answered? Resolve **flagged concerns** before building.

### 3. Build → `plan.md` + code
Start in **plan mode**, hand Claude the spec, iterate until an unseen session could build from the plan alone. **Commit `plan.md`**, then `implement` (using test driven development). This is the highest-value resume point. If implementation departs from the plan, update `plan.md` in the same commit. Use worktrees for parallel features.

### 4. Test → tests + CI
Every session verifies its own work before you see it. Bug fixes are **test-first**
(`tdd`): write the failing test, commit it, then make it pass without editing the
test. The `checks` CI job (typecheck, tests, pack validation) is the gate on every
promotion. "Done" means the proof in `plan.md` is green.

### 5. Deploy → `review.md` + PR
Run `code-review` (and/or `@claude` on the PR) against the **Review policy** below;
record findings in `review.md`. Open a PR into `dev`. Promotion `dev → test → prod`
is by PR, gated by `checks`. You are the human at the gate — findings inform, they
don't auto-merge.

### 6. Maintain → new `intent.md`
Not built yet. The eventual close: a signal (CI failure rate, post-deploy 5xx,
grading-error rate) trips a deterministic watcher, which invokes Claude to
diagnose and write a fresh `intent.md` back into the queue. See the roadmap in
`sdlc/CLAUDE.md`.

## Review policy

What the review passes cover (the `code-review` skill and any `@claude` pass run
these). Findings go in the feature's `review.md`.

- **Bugs** — logic errors, broken edge cases, regressions.
- **Security** — injection, auth gaps, PII in logs, RLS holes.
- **Spec / plan compliance** — does the diff do what `spec.md` required and
  `plan.md` described?
- **Standards** — repo conventions (`CLAUDE.md`, `CONTEXT.md`).

**Important vs Nit:** reserve *Important* for anything that breaks behavior, leaks
data, or breaks a policy. Style and naming are nits — cap at five per review,
summarize the rest as a count. Skip generated files and anything CI already
enforces.

## What we deliberately skip

The enterprise column of the article controls *many humans* and is pure overhead
for one dev: PRDs, committees, sign-offs, separation-of-duties approval hooks,
MDM/managed settings, OpenTelemetry export, DORA dashboards. Ignored on purpose.
