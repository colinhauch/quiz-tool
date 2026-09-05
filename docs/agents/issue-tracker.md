# Issue tracker: GitHub

Tickets, PRDs, and triage for this repo live as GitHub issues; use the `gh` CLI
for all operations. **Exception:** the feature SDLC artifacts (intent/spec/plan/
review) are files, not issues — see "SDLC artifacts are files" below.

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

## SDLC artifacts are files (source of truth)

The feature SDLC chain — `intent.md`, `spec.md`, `plan.md`, `review.md` — is
**canonical as files** under `sdlc/features/<slug>/`, not as issues. See
`sdlc/README.md` (playbook) and `sdlc/CLAUDE.md` (source-of-truth rules). A
GitHub issue may exist as an **optional linked mirror** for status/assignment/
blocking, but it never holds the canonical artifact text — its body points at the
file. This overrides the generic rules below whenever the thing being published
is one of those artifacts.

## When a skill says "publish to the issue tracker"

**If it's an SDLC artifact (a spec, plan, intent, or review):** write the file to
`sdlc/features/<slug>/<artifact>.md` first — that is the published record. Then,
only if the user wants issue-side tracking, create a GitHub issue whose body is a
short summary plus a link to the file (never a copy of the full artifact). The
`to-spec` skill says "publish to the issue tracker"; for a spec this means write
`spec.md`, with the mirror issue optional.

**Otherwise (tickets, PRDs, triage items):** create a GitHub issue as usual.
Tickets are the tracking layer where issues earn their place (native blocking
edges, assignment); they link back to the feature folder.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`. For an SDLC artifact, read the file in
`sdlc/features/<slug>/` — it is the record; the issue is only a pointer.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
