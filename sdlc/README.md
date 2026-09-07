# The loop — this repo's AI-native SDLC

How this repo takes a feature from idea to production. It adapts Anthropic's
AI-native SDLC playbook (`docs/AI_SDLC_Article.md`) to a **single developer**.
The reasoning behind the adaptation lives in `sdlc/CLAUDE.md`; this file is the
operational how-to. Tracker mechanics (the `gh` commands) live in
`docs/agents/issue-tracker.md`.

## The idea in one line

A feature is **one GitHub issue carried through labels**, `intent → spec`, then
cut into ticket issues. Each stage is a lossy compression of the last, so a cold
session reads the current issue instead of re-exploring.

Two things earn the ceremony for a solo dev:
1. **Resume across sessions.** A fresh session reads the issue cold under a token
   budget instead of re-deriving context.
2. **Audit trail.** The issue and its edit history record what was asked, what got
   built, and why — the original intent stays verbatim at the top of the spec.

## Where the SDLC lives

| Artifact | Home | Lifetime |
|---|---|---|
| Intent, spec, tickets | GitHub issue | outlive any branch |
| Plan, review findings | branch / PR body | die with the branch |
| CLAUDE.md, skills, hooks | `prod` | steer every session |

**Issues are canonical.** There are no `sdlc/features/<slug>/*.md` artifacts.

## Right-size the chain

The chain is a tool, not a tax.

| Change | Do |
|---|---|
| Typo, dep bump, one-line fix | nothing — just commit |
| Small, well-understood fix | a ticket issue (or nothing) |
| A real feature | full chain: intent → spec → tickets |
| Bug fix | an issue with the repro → failing test → fix |

## The stages

Each stage's issue (at its current label) is the gate — review it, then fire the
next stage.

### 1. Capture → `intent` issue
Run `/intent`. It brainstorms the raw idea with you, then opens a GitHub issue
labeled `intent`: problem, why, roughly-better, out-of-scope, open questions. No
design. Intents accumulate as a queue (`gh issue list --label intent`) and can be
worked in any order.

### 2. Spec → relabel the same issue `spec`
A working session takes one intent, grills it (`/grill-me`, `/grill-with-docs`,
constrained by `CONTEXT.md` and the `domain-modeling` / `codebase-design` skills),
then `/to-spec` writes the spec **back into the same issue** and relabels it
`intent` → `spec`. The original intent stays verbatim at the top — the drift
guard. Resolve flagged concerns before building.

### 3. Tickets → child issues
`/to-tickets` cuts the spec issue into child issues, each sized to one session,
with native blocking edges, labeled `ready-for-agent`. **Each ticket must be
self-sufficient** — a ticket that needs its parent spec to be actionable is
defective.

### 4. Build → plan + code
Start in **plan mode**, hand Claude the ticket, iterate until an unseen session
could build from the plan alone. The plan lives in the branch/PR, not an issue.
Then `/implement` (test-driven). If implementation departs from the plan, keep the
plan honest in the same commit. Use worktrees for parallel features.

### 5. Test → tests + CI
Every session verifies its own work before you see it. Bug fixes are **test-first**
(`/tdd`): write the failing test, commit it, then make it pass without editing the
test. The `checks` CI job (typecheck, tests, pack validation) gates every
promotion. "Done" means the tests are green.

### 6. Review → PR
Run `/code-review` (and/or `@claude` on the PR) against the **Review policy**
below; findings go in the PR, not a file. Open a PR into `dev`. Promotion
`dev → test → prod` is by PR, gated by `checks`. You are the human at the gate.

## Review policy

One pass covering bugs plus spec compliance (the `code-review` skill and any
`@claude` pass run these):

- **Bugs** — logic errors, broken edge cases, regressions.
- **Security** — injection, auth gaps, PII in logs, RLS holes.
- **Spec compliance** — does the diff do what the spec issue required?
- **Standards** — repo conventions (`CLAUDE.md`, `CONTEXT.md`).

**Important vs Nit:** reserve *Important* for anything that breaks behavior, leaks
data, or breaks a policy. Style and naming are nits — cap at five per review,
summarize the rest as a count. Skip generated files and anything CI already
enforces.

## What we deliberately skip

The enterprise column of the article controls *many humans* and is overhead for
one dev: PRD committees, sign-offs, separation-of-duties approval hooks,
MDM/managed settings, OpenTelemetry export, DORA dashboards. Ignored on purpose.
