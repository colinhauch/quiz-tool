# SDLC build TODO

Features from the article (`docs/AI_SDLC_Article.md`) not yet built here.
Ordered by ROI. Rationale for each lives in `sdlc/CLAUDE.md` (roadmap).
Check off when merged; keep this list current.

## Now

- [ ] **CLAUDE.md verification block** — add `## Commands` + `## Verifying your
  work` to root `CLAUDE.md` (real build/test/typecheck commands, "run before
  reporting done"). Prereq for the verifier subagent and auto-mode. *(Test)*
- [ ] **CLAUDE.md Refinement** - the current file has too much content and too
many assumptions. We need to refine it. 

## Next

- [ ] **`verifier` subagent** — `.claude/agents/verifier.md`: runs tests/app in
  fresh context, reports vs `plan.md`, fixes nothing. *(Build/Test)*
- [ ] **Guardrail hooks** — `.claude/settings.json`: block test-file edits during
  a fix (protects TDD); formatter on edit. *(Build/Test)*

## Later

- [ ] **Continuous evals** — `evals/` + `.github/workflows/agent-evals.yml`; run
  on changes to `CLAUDE.md`/`.claude/**`. *(Test)*
- [ ] **Close the loop** — `bands.yaml` + deterministic watcher on one metric
  (CI failure rate / post-deploy 5xx / grading-error rate); on breach, invoke
  Claude read-only to write a fresh `intent.md`. *(Maintain)*

## Follow-ups from the file-first switch

- [ ] **`to-spec` files mode** — confirm it writes `spec.md` via the tracker
  indirection (`docs/agents/issue-tracker.md`); no vendored edit.
- [ ] **Dogfood** — run one real feature through the full chain to test the
  templates.
