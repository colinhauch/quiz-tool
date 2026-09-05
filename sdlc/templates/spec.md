# Spec: <title>  (from intent)

Status: draft | accepted

Requirements + design in one pass. Produced from `intent.md`, constrained by the
repo's skills (`domain-modeling`, `codebase-design`) and `CONTEXT.md` vocabulary.
See the `to-spec` skill for the fuller shape.

## Summary
<One paragraph: what we're building and why, restating the accepted intent.>

## Requirements
<Numbered, testable. Each maps to something the plan proves.>

## User Stories
<A long, numbered list, each `As an <actor>, I want <feature>, so that <benefit>`.
Extensive on purpose — writing them out surfaces edge actors (accessibility,
preference toggles, unusual question/data shapes) the requirements list misses.>

## Design
<How it fits the existing system: packages/packs touched, data shape, routes,
key interfaces. Use CONTEXT.md terms. Reference existing code, don't restate it.>

## Testing Decisions
<What makes a good test here (assert external behavior, not implementation). The
seam(s) you'll test at — prefer one existing, highest seam. Prior art: similar
tests in the codebase. And, explicitly, anything deliberately NOT automated and
why — a named decision, not a silent gap.>

## Flagged concerns
<Where the design strains a constraint or a policy, or where two goals conflict.
The points you'd escalate to a reviewer. Empty is a valid answer — say so.>

## Open questions carried from intent
<Each intent open question: answered here, or explicitly deferred.>

## Out of Scope
<What this spec deliberately does not do. Echo the intent's out-of-scope and
refine it with anything the design newly rules out.>

## Links
Intent: sdlc/features/<slug>/intent.md
