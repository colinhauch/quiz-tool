# Rank and Time

> **[UNREVIEWED]** — Rank *semantics* are deliberately out of scope until the work that needs them arrives (a second pack, a pack update, or the first temporal facts). **The MVP has no rank at all** — see [statements.md](statements.md) and [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md). Read this as a design sketch, not a decided mechanism.
>
> Two observations from live Wikidata (2026-07-17) that this file should be re-read against when its turn comes, because they were not known when it was written:
>
> - **`preferred` is rare, not the default.** Dijon's only country claim is `normal`. The fallback below ("preferred, falling back to normal") does handle this — but a reader would guess the common case is `preferred`, and it is not.
> - **Rank does not resolve the hard case.** Jerusalem has *two* `preferred` country claims — Israel and Palestine — separated by a qualifier, not by rank. "Ask for preferred" returns two answers and the template cannot choose. Wikidata's rank is an editorial layer that declines to adjudicate exactly where the world does, so a design that treats rank as a total order over truth will break on real data.

How the graph represents a world that changes, without lying about the past.

## Statements are never deleted

When Brazil's capital moved from Rio to Brasília, the Rio statement did not become false. It became *historical*. Deleting it would destroy a fact that is both true (of its period) and quizzable.

So statements carry a **rank** — `preferred`, `normal`, or `deprecated` — and temporal qualifiers. The current capital is the preferred statement; the former capital is a normal statement with an `end` date. "What is the capital of Brazil?" asks for preferred, falling back to normal when nothing is preferred. "What was the capital before Brasília?" is a temporal question over the same rows.

The alternative — delete-and-replace — would mean a change to the world silently destroys a user's answer history for that fact. **Answer events reference statement IDs, so a deleted statement is a hole in someone's learning record.** That is the constraint driving this whole design: history must remain resolvable forever.

## Three ranks, three jobs

`preferred` and `normal` distinguish *current* from *also true*. That is a question-generation concern: it is what lets a template ask "the capital" and get one answer, without the template knowing anything about time.

`deprecated` is different in kind. It marks a statement **retracted by a pack update** — not historical, but wrong, or removed by its author. Deprecated statements stop generating questions but remain in storage, because old answer events still point at them and must still resolve. This is the mechanism that makes pack updates safe: a pack can retract a claim without orphaning anyone's history. See [../packs/](../packs/).

This is **narrower than Wikidata's `deprecated`**, which flags a claim believed wrong or dubious about the world (a mismeasured value, a known-common error kept as a warning). We reuse the same vocabulary word for pack retraction — an importer should not map Wikidata-deprecated statements straight into it.

Do not use `deprecated` for "no longer true." That is what `end` is for.

## Rank vs. time is a real distinction

Rank answers "which of these should I show?" Time answers "when was this so?" They are related but not interchangeable, and conflating them is the likely mistake here.

A statement can be preferred *and* have a start date (the current capital, since 1960). A statement can be normal with no dates at all (one of Brazil's ten borders — not preferred, not historical, just one of many). Cardinality is what decides whether preferred is meaningful: for a `many` relation, ranking is mostly noise — we keep it because it comes with the Wikidata data, and can drop it later if it stays unused.

The engine reads rank for selection and time for filtering, and templates that mix them — "what was the capital in 1900?" — filter on time and ignore rank entirely.
