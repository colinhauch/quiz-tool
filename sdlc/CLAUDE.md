# Working in `sdlc/`

This folder is the home of the repo's AI-native SDLC: the process docs and the
skills that drive it. `README.md` is the playbook (the operational how-to); this
file is the working notes — the *why* and the rules. Read the playbook for detail.

## The SDLC in a few lines

A feature moves `intent → spec → tickets → code+tests → review`. It lives in
**GitHub issues**: one issue carried through labels (`intent` → `spec`), then cut
into child ticket issues. `/intent` captures, `/to-spec` grills an intent into a
spec written back into the **same** issue, `/to-tickets` cuts `ready-for-agent`
child issues, then `/implement` or `/tdd` builds. Full stage-by-stage detail,
right-sizing, and the review policy are in `README.md`.

## Source of truth: GitHub issues

**Issues are canonical**, not files. The intent, the spec, and each ticket are
issues; the spec's originating intent stays verbatim at the top of its issue (the
drift guard). The tracker mechanics — how to create/label/query, and how each
stage maps to `gh` — live in `docs/agents/issue-tracker.md`, the single place
that resolves "publish to the issue tracker." Skills read that indirection.

An artifact's home is its lifetime:

| Artifact | Home |
|---|---|
| Intent, spec, tickets (outlive the branch) | GitHub issue |
| Plan, review findings (die with the branch) | Branch / PR body |
| CLAUDE.md, skills, hooks (steer every session) | `prod` |

**Ticket self-sufficiency:** a ticket that needs its parent spec to be actionable
is defective. Each stage is a lossy compression of the one before — that caps
re-read spend on a cold start.

## The skills

Skill sources live under `sdlc/skills/<name>/`, each symlinked into
`.claude/skills/<name>`, so the concern stays one portable tree. Folder name =
skill name; add a skill by adding a folder and a symlink. Editing here updates the
live skill.

- `sdlc/skills/sdlc/` → `sdlc` — navigates the issue lifecycle (resume cold).
- `sdlc/skills/intent/` → `intent` — Stage 1 front door: `/intent` interviews a
  raw idea and opens an `intent`-labeled issue.

## Retired

The old file-based artifact chain — `sdlc/features/<slug>/*.md`, `sdlc/templates/`,
`sdlc/ideas.md` — is gone; issues replaced it. Those paths are kept only as
historical record. Don't scaffold `sdlc/features/` or write artifacts there.

## Deliberately skipped

The enterprise controls in the article (`docs/AI_SDLC_Article.md`) govern *many
humans* and are overhead for one dev: PRDs-as-committees, sign-offs,
separation-of-duties hooks, MDM/managed settings, OpenTelemetry export, DORA
dashboards.
