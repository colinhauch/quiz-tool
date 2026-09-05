---
name: sdlc
description: "Scaffold and navigate this repo's feature SDLC chain (intent → spec → plan → review) as markdown files under sdlc/features/<slug>/. Use when starting a new feature, resuming one across a session boundary, or when asked where a feature's docs live or what stage it's at."
---

# SDLC — the feature loop

Drives the file-based artifact chain documented in `sdlc/README.md` (the
playbook) and `sdlc/CLAUDE.md` (source-of-truth rules). **Read the playbook if
you haven't** — this skill executes what it describes; it does not restate it.

The chain: `intent.md → spec.md → plan.md → code+tests → review.md`, one folder
per feature at `sdlc/features/<slug>/`. The files are the source of truth; a
GitHub issue is an optional mirror (see `docs/agents/issue-tracker.md`).

## Starting a feature

1. **Pick a slug** — short, kebab-case, distinctive (`flag-hints`, not
   `feature-1`). Confirm it with the user if unsure.
2. **Right-size first** (playbook table). A typo or one-line fix needs no chain —
   say so and stop. Only scaffold what the change earns.
3. **Scaffold** the folder from templates:
   ```bash
   slug=<slug>
   mkdir -p "sdlc/features/$slug"
   cp sdlc/templates/intent.md "sdlc/features/$slug/intent.md"
   ```
   Copy only the templates this change needs; don't create empty `spec.md` /
   `plan.md` before their stage.
4. **Fill `intent.md`** from the conversation — the user's own words for problem,
   why, outcome, constraints, out-of-scope, open questions. Do not synthesize a
   solution here. Commit it, then stop for review.

## Advancing a stage

Each stage reads the prior committed file and writes the next. Fire the next
stage only after its input artifact is reviewed (`Status: accepted`).

| From | Do | Produces |
|---|---|---|
| `intent.md` accepted | `to-spec` (writes to the feature folder) | `spec.md` |
| `spec.md` accepted | plan mode, then commit | `plan.md` |
| `plan.md` accepted | `implement` / `tdd` | code + tests |
| code done | `code-review` (+ `@claude` on PR) | `review.md` |

When implementation departs from `plan.md`, update `plan.md` in the same commit.

## Resuming across a session boundary

This is the payoff. To pick up a feature cold:
1. `ls sdlc/features/<slug>/` — the files present tell you the stage reached.
2. Read the latest one. Its `Status` and `Open questions` say what's left.
3. Continue from there — a read, not a re-exploration.

## Where to look

- Playbook / stages / review policy: `sdlc/README.md`
- Why files, tracker relationship, measurement, roadmap: `sdlc/CLAUDE.md`
- Templates: `sdlc/templates/`
- Tracker indirection (issue mirror): `docs/agents/issue-tracker.md`
