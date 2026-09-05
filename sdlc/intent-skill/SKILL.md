---
name: intent
description: "The SDLC entry point. Brainstorm a raw idea with the originator, then write it up as sdlc/features/<slug>/intent.md. Use when someone says '/intent', has a feature idea to develop, or wants to turn a jotted note in sdlc/ideas.md into a real intent."
---

# /intent — capture the idea

Stage 1 of the loop (`sdlc/README.md`). Turns a raw idea into a committed
`intent.md`. You **interview**, you do **not** design — no solution, no
implementation. That's the spec's job.

## Do

1. **Get the idea.** From the argument, the conversation, or a note in
   `sdlc/ideas.md`. If it started in `ideas.md`, delete that entry once the
   intent is committed.
2. **Right-size** (playbook table). A typo or one-liner earns no intent — say so
   and stop.
3. **Brainstorm until concrete.** Ask what an analyst would: who's affected, what
   they can't do today, what "better" looks like, hard constraints, what's out of
   scope, what's still unknown. One question at a time. Stop when the template
   below can be filled without guessing.
4. **Scaffold** — pick a short kebab-case slug, then:
   ```bash
   slug=<slug>
   mkdir -p "sdlc/features/$slug"
   cp sdlc/templates/intent.md "sdlc/features/$slug/intent.md"
   ```
5. **Fill it** in the originator's own words. Leave real unknowns in Open
   questions — don't invent answers.
6. **Correct.** Show it, let them fix what you misheard.
7. **Commit** `intent.md` (`Status: draft`) and stop. Author + timestamp are the
   record. They set `Status: accepted` when ready; `/to-spec` takes it from there.

## Don't

- Don't propose a design, architecture, or tasks.
- Don't scaffold `spec.md` / `plan.md` — later stages own those.
- Don't answer Open questions to look finished; unresolved is a valid state.
