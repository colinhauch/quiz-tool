---
name: sdlc
description: "Navigate this repo's feature SDLC lifecycle (intent → spec → tickets) as GitHub issues. Use when starting a feature, resuming one across a session boundary, or when asked where a feature lives or what stage it's at."
---

# SDLC — the feature lifecycle

The chain is `intent → spec → tickets → code+tests → review`, and it lives in
**GitHub issues**, one issue carried through labels. The tracker mechanics are in
`docs/agents/issue-tracker.md` — read it; this skill does not restate them.

Artifact homes by lifetime:

| Artifact | Home |
|---|---|
| Intent, spec, tickets (outlive the branch) | GitHub issue |
| Plan, review findings (die with the branch) | Branch / PR body |
| CLAUDE.md, skills, hooks (steer every session) | `prod` |

## Advancing a stage

| From | Do | Produces |
|---|---|---|
| raw idea | `/intent` | `intent`-labeled issue |
| `intent` issue | `/grill-me` / `/grill-with-docs`, then `/to-spec` | same issue relabeled `spec` |
| `spec` issue | `/to-tickets` | child issues, `ready-for-agent` |
| ticket | `/implement` / `/tdd`, then plan mode | code + tests |
| code done | `/code-review` (+ `@claude` on PR) | review in the PR |

The spec is written back into the **intent's own issue** so the original intent
stays verbatim at the top — the drift guard. Tickets must be self-sufficient: a
ticket that needs its parent spec to be actionable is defective.

## Resuming across a session boundary

To pick up a feature cold: `gh issue view <n> --comments`. Its label says the
stage; its body and comments say what's left. A read, not a re-exploration.

- Queue of intents: `gh issue list --label intent`
- Specs ready to cut: `gh issue list --label spec`
- Grabbable tickets: `gh issue list --label ready-for-agent`

`sdlc/` (the old file-based chain) is frozen historical record — don't write
there.
