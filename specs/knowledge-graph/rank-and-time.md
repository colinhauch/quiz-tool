# Rank and Time

How the graph represents a world that changes, without lying about the past.

## Statements are never deleted

When Brazil's capital moved from Rio to Brasília, the Rio statement did not become false. It became *historical*. Deleting it would destroy a fact that is both true (of its period) and quizzable.

So statements carry a **rank** — `preferred`, `normal`, or `deprecated` — and temporal qualifiers. The current capital is the preferred statement; the former capital is a normal statement with an `end` date. "What is the capital of Brazil?" asks for preferred, falling back to normal when nothing is preferred. "What was the capital before Brasília?" is a temporal question over the same rows.

The alternative — delete-and-replace — would mean a change to the world silently destroys a user's answer history for that fact. **Answer events reference statement IDs, so a deleted statement is a hole in someone's learning record.** That is the constraint driving this whole design: history must remain resolvable forever.

## Three ranks, three jobs

`preferred` and `normal` distinguish *current* from *also true*. That is a question-generation concern: it is what lets a template ask "the capital" and get one answer, without the template knowing anything about time.

`deprecated` is different in kind. It marks a statement **retracted by a pack update** — not historical, but wrong, or removed by its author. Deprecated statements stop generating questions but remain in storage, because old answer events still point at them and must still resolve. This is the mechanism that makes pack updates safe: a pack can retract a claim without orphaning anyone's history. See [../packs/](../packs/).

Do not use `deprecated` for "no longer true." That is what `end` is for.

## Rank vs. time is a real distinction

> **[UNREVIEWED]** — This whole section is the agent's synthesis; the source document never drew this distinction explicitly. The claim that ranking is "mostly noise" for `many` relations is an inference and may be wrong.

Rank answers "which of these should I show?" Time answers "when was this so?" They are related but not interchangeable, and conflating them is the likely mistake here.

A statement can be preferred *and* have a start date (the current capital, since 1960). A statement can be normal with no dates at all (one of Brazil's ten borders — not preferred, not historical, just one of many). Cardinality is what decides whether preferred is meaningful: for a `many` relation, ranking is mostly noise.

The engine reads rank for selection and time for filtering, and templates that mix them — "what was the capital in 1900?" — filter on time and ignore rank entirely.
