# Issue tracker: GitHub

Intents, specs, tickets, PRDs, and triage for this repo all live as GitHub
issues; use the `gh` CLI for all operations. An SDLC feature is one issue that
moves through labels — see "SDLC lifecycle" below.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## SDLC lifecycle (issues, source of truth)

An artifact's home is its lifetime. Anything that **outlives a branch** —
intent, spec, tickets — is a GitHub issue. Anything **born and dying with a
branch** — plan, review findings — lives in the branch or the PR body, never
here. There are no `sdlc/features/<slug>/*.md` artifacts anymore; `sdlc/` is
frozen historical record (see its README).

Three main stages (one proto-stage), distinguished by label, in the same tracker:

- **`ideas`** - [the proto-stage] Single, brief concepts that can be turned into 
more developed intents later. Currently stored at `sdlc/ideas.md`.
- **`intent`** — cheap capture: what's wanted, why, roughly. Created in seconds
  (`/intent`). Accumulates as a queue.
- **`spec`** — a working session takes one intent, grills it (`/grill-me`,
  `/grill-with-docs`), and writes the spec back into the **same issue**,
  relabeling `intent` → `spec`. One URL; the edit history keeps the original
  intent verbatim at the top, which is the guard against spec-vs-intent drift.
- **tickets** — `/to-tickets` cuts the spec issue into child issues, each sized
  to one session, labeled `ready-for-agent`.

**Ticket self-sufficiency:** a ticket that requires reading its parent spec to
be actionable is defective. Each stage is a lossy compression of the one before;
that caps re-read spend on a cold start.

## When a skill says "publish to the issue tracker"

Create a GitHub issue. A spec relabels its originating intent issue in place; a
new intent or a ticket is a fresh issue. There is no file to write.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
