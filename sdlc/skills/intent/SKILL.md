---
name: intent
description: "The SDLC entry point. Brainstorm a raw idea with the originator, then capture it as a GitHub issue labeled `intent`. Use when someone says '/intent', has a feature idea to develop, or wants to turn a jotted note into a real intent."
---

# /intent — capture the idea

Stage 1 of the lifecycle (`docs/agents/issue-tracker.md`). Turns a raw idea into
an `intent`-labeled GitHub issue. You **interview**, you do **not** design — no
solution, no implementation. That's the spec's job (`/to-spec`).

## Do

1. **Get the idea.** From the argument or the conversation.
2. **Right-size.** A typo or one-liner earns no intent — say so and stop.
3. **Brainstorm until concrete.** Ask what an analyst would: who's affected, what
   they can't do today, what "better" looks like, hard constraints, what's out of
   scope, what's still unknown. One question at a time. Stop when the body below
   can be filled without guessing.
4. **Write the issue** in the originator's own words. Leave real unknowns under
   Open questions — don't invent answers.
   ```bash
   gh issue create --label intent --title "<short imperative title>" --body "$(cat <<'EOF'
   ## Problem / who's affected

   ## Why now

   ## Roughly what better looks like

   ## Out of scope

   ## Open questions
   EOF
   )"
   ```
5. **Correct.** Show it, let them fix what you misheard, then stop. The intent
   sits in the queue until a `/to-spec` session grills it and relabels this same
   issue `intent` → `spec`.

## Don't

- Don't propose a design, architecture, or tasks.
- Don't open a spec or tickets — later stages own those.
- Don't answer Open questions to look finished; unresolved is a valid state.
