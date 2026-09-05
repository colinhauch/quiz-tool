# Working in `sdlc/`

This folder is the repo's AI-native SDLC. `README.md` is the playbook (the
operational how-to); this file is the working notes — the *why*, the source-of-
truth rules, and the roadmap. Read the playbook first.

## Source of truth

**The files in `sdlc/features/<slug>/` are canonical.** `intent.md`, `spec.md`,
`plan.md`, `review.md` are the record of what was asked, decided, planned, and
found. If a fact matters, it lives in a file, not only in an issue or a PR.

We chose files over GitHub issues (reversing the earlier issues-first
convention) for two reasons: the artifact chain sits next to the code it
produced, and the whole `sdlc/` tree is copyable to another repo. This is the
article's "repo as source of truth" configuration.

## GitHub issues run in parallel (supplementary)

Issues stay useful for what files do badly: **status, assignment, and blocking
relationships** (GitHub native dependencies — real, UI-visible edges, already
wired for `/wayfinder`). The rule:

- An issue is a **mirror + tracker**, never the record. Its body links to the
  feature folder; it does not hold the canonical spec/plan text.
- The tracker is configured in `docs/agents/issue-tracker.md` — the single place
  that resolves "publish to the issue tracker." Skills read that indirection, so
  the file-vs-issue decision lives in one spot.

## Measurement comes free from git

Because artifacts are committed files, cycle-time needs no separate store: the
git timestamps of `intent.md → spec.md → plan.md → merge` for a feature folder
give every interval the article measures. A future dashboard is just a script
over `git log -- sdlc/features/<slug>/`. Don't build a metrics store; query git.

## The skill

`sdlc/skill/` holds the `sdlc` skill, symlinked into `.claude/skills/sdlc`. It
scaffolds a feature folder from `templates/` and navigates the chain. Editing it
here updates the live skill (it's the same files through the symlink). Keeping
the source under `sdlc/` keeps the whole concern in one portable tree.

## Roadmap (not built)

Ordered by ROI; each ~one session, independently useful.

1. **Wire the chain end to end** — `sdlc` skill scaffolds; `to-spec` writes
   `spec.md`; plan mode commits `plan.md`; `code-review` writes `review.md`.
2. **Self-verify + guardrail hooks** — a `verifier` subagent
   (`.claude/agents/verifier.md`) that runs tests/app in fresh context vs
   `plan.md`; a hook blocking test-file edits during a fix (protects TDD).
3. **Close the loop (Maintain)** — a deterministic watcher on one metric (CI
   failure rate / post-deploy 5xx / grading-error rate) that, on breach, invokes
   Claude read-only to diagnose and writes a fresh `intent.md` into the queue.

## Deliberately skipped

The enterprise controls in the article govern *many humans* and are overhead for
one dev: PRDs, committees, sign-offs, separation-of-duties hooks, MDM/managed
settings, OpenTelemetry export, DORA dashboards.
