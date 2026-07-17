# Mission: Knowledge-graph data modelling

> **DRAFT** — reconstructed by an agent from the #2 review session, not yet confirmed by Colin.
> The mission steers every future lesson; a wrong one steers them all wrong. Correct it before it sets.

## Why

Colin is locking the entity/statement model for the geography engine — decisions that outlive the MVP,
because answer-log history references these records forever and a migration means orphaning a user's
learning record. Most of the specs around that model were drafted by an agent and are unverified
reconstructions. He can't tell a load-bearing modelling convention from an agent's tidiness without
knowing how the field actually works, and he intends to make the calls himself rather than take a
recommendation on trust.

## Success looks like

- Reading `specs/knowledge-graph/` and telling, unaided, which claims are real modelling constraints
  and which are invented neatness — the vouch / correct / **demote** call, made without the agent.
- Judging when a field justified by a deferred feature ("aliases are already stored per language") is
  cheap insurance versus an unpaid claim about the future.
- Knowing what Wikidata's model actually commits us to, having inherited its Q-IDs.
- Grilling an agent's spec rationale on the merits, in the agent's own vocabulary.

## Constraints

- **Grounded in live decisions, not general interest.** Lessons trace to open tickets on the
  [MVP map](https://github.com/colinhauch/quiz-tool/issues/1). Each should pay off within days.
- **Sources over parametric knowledge.** This repo's whole `[UNREVIEWED]` problem is reconstructed
  reasoning that read as recorded fact. Lessons cite primary sources or don't make the claim.
- **Short.** Colin is mid-review; a lesson competes with shipping.
- Workspace lives at `docs/teaching/`, not the repo root — `specs/` is the repo's doc system and this
  must not be mistaken for part of it.

## Out of scope

- Building the MVP. The map's destination is decisions.
- Wikidata semantics the MVP never exercises — rank/temporal semantics are explicitly out of scope on
  the map (the statement *shape* is not).
- General i18n engineering (message catalogues, pluralisation, RTL layout). The question is naming in
  a knowledge graph, not localising an app.
