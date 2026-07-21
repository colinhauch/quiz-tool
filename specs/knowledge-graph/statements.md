# Statements

The atomic unit of knowledge. Every quizzable fact is one, and every answer ever logged references one by ID.

## The object slot is a closed union

An object is **either** a reference to another entity **or** a typed literal. Two arms, closed deliberately.

The closure matters more than either arm. It is what lets every consumer — the scheduler, the answer log, the template engine, the distractor generator — exhaustively handle objects with no default case.

**A third arm is a redesign, not an extension.** Not because of the switch statements — a compiler finds those, and that would be ordinary. Because the closed union is what *forces* reification, and reification is what makes "no schema changes ever" credible ([README.md](README.md)). The escape hatch only works while there is no other way out. A third arm means something bypassed it, and the pressure to add one — from something that feels like it is "neither an entity nor a value" — is exactly the pressure reification exists to absorb. That thing is almost certainly a reification. If it truly is not, the core bet lost, and that is worth stopping over.

Reviewed 2026-07-17 against a live case: a territorial dispute feels like the archetypal third thing, and resolves to ordinary entity-valued statements — `s(Q_government_of_israel, claims, Q1218)`, `s(Q_state_of_palestine, claims, Q1218)`. Note the subjects: the claimants are *governments*, not countries. Getting that wrong is what makes a dispute look unrepresentable. Such facts are a later `disputed-land` pack; see [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md).

Literal datatypes (string, quantity, date, dateRange, boolean) are **engine-level, not pack-level**. This is the load-bearing split in the whole model: **the engine defines the literals — the kinds of data — and packs define the qualifiers that couch that data.** Literals have to be engine-level because validation and question generation reason about them directly: `literal_spread` distractors know what a quantity is, and couldn't know what an arbitrary pack-defined type is. Qualifiers, by contrast, aren't predictable enough to plan the engine around, so packs own them (see below). Adding a datatype is therefore an engine change with a version bump — a real cost, and the reason the literal set stays small and general enough to hold any *kind* of data.

## Orient asymmetric relations in their functional direction

When a relation is functional one way — each subject has at most one object (`cardinality: "one"`) — store it that way: the **many** side is the subject, the single determined value is the object. `located_in` is written city→country, never country→city, because a city sits in one country (functional) while a country holds many (not). This is already why the model stores `located_in` and *generates* `contains` rather than storing both — see `inverse_of` in [shapes.md](shapes.md) and "the inverse edge is never stored" in [../questions/](../questions/). The convention just names the principle behind that choice, so packs orient new relations the same way instead of flip-flopping.

The payoff is that a statement's orientation is predictable, which is what lets **the slot a question hides carry meaning**. Hiding the object asks for the one determined value — "what country is Tokyo in?", exactly one answer, the MVP case. Hiding the subject asks to enumerate the many — "name a city in Japan", an open set that [falls out of a query](README.md#sets-fall-out-of-queries). Without the convention, "hide the object" would mean single-answer in one pack and enumerate-many in another, and the hidden slot would tell a generator nothing.

This does not remove the need for a *card* (`statement` + hidden slot): recall and enumeration over the same fact stay different skills, tracked separately (see [../questions/](../questions/) and [../learning/](../learning/)). It makes the card's hidden slot well-defined rather than redundant — the convention is the precondition that gives the slot its single-answer-vs-enumerate meaning.

The rule applies only where a functional direction exists. **Symmetric relations have none** — `borders` is many-to-many both ways — so they store one edge (`symmetric: true`) and are enumerate-many in either direction. Orientation is a property of the relation type, decided once when the relation is defined, not per statement.

### A second constraint today: the engine hides only the object

> **[UNREVIEWED]** — reconstructed from a pack-authoring decision plus a current code limitation. Confirm the MVP engine still hides the object slot only, and that this corollary is a real authoring rule rather than a passing artifact of that limitation.

The orientation convention decides direction from the *data* (functional side becomes the object). A relation like `has_capital` is nearly one-to-one — a country has one capital, a capital serves one country — so the convention alone doesn't force a direction. What breaks the tie today is the **engine**: question selection hides the object slot only, so whatever sits in the object is the answer the learner produces. Orient the relation to put the *single quizzed answer* in the object.

That is why the capitals pack stores `has_capital` **country→city**: hiding the object asks "what is the capital of France?" — the canonical drill, and distinct from `located_in`. The reverse (`capital_of`, city→country) would, under object-only hiding, ask "Paris is the capital of what?", collapsing into a near-duplicate of `located_in`. Once the engine can hide the subject, this tiebreak weakens and the choice returns to pedagogy; until then it is a hard authoring constraint.

## Why statements carry provenance

Every statement records which pack introduced it (`pack_id`) and where that particular fact came from (`source`).

**The reason is that a pack is not homogeneous.** Origin varies *within* a pack — `core-cities` is Wikidata-derived, but any pack may mix generated facts with hand-authored ones, corrections, or a second upstream. Provenance is per-statement because the thing it records is per-statement. A pack-level field could not answer the question at all, and the question is a real one: *where did this particular entity or statement come from?*

This is what makes hand-adding a statement cheap and honest — it goes in next to the generated ones, saying plainly that it is not one of them. That is not hypothetical: [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md) *drops* cities its filter cannot state simply, and hand-authoring is the obvious way to patch a hole you dislike.

**Surfacing it is the intent, not yet the build.** The design is for the quiz card to show a subtle source line, so provenance is exercised rather than written and trusted — but the shipped card (`QuestionResponse` is `{cardId, prompt, input}`) does not carry `source` yet. It is the right thing for a learning app to say once wired: facts have origins, and the app should be willing to name them.

Two reasons this section previously gave, and why they are not the reason:

- **Licensing and attribution** are real, but they are *pack-level*. A licence belongs to a pack; it never explains a field on every row.
- **Pack update and uninstall** are made tractable by provenance — a pack update diffs by statement ID and deprecates rather than deletes; an uninstall deactivates a pack's statements; neither can dangle an answer event. This is a genuine benefit and worth keeping. But it needs only `pack_id`, and it explains nothing about `source`. An earlier version of this file called it "the real reason", displacing the author's; it was an agent's inference, and the MVP has neither update nor uninstall to exercise it. See [../packs/](../packs/).

## Qualifiers are pack-defined

Qualifiers are per-statement metadata that couches a fact — a border's length, a capital's start date, a name's period of use. Where literals are engine-level, **qualifiers are the pack's to define.** A pack declares the full set of qualifiers it uses and ships the tooling and explanation for working with them; the engine doesn't need a fixed qualifier vocabulary to function. This is deliberate: qualifier vocabularies vary too much between kinds of content to plan the engine around, so the engine provides the basic structure and each pack fills in the details it needs. See [../packs/](../packs/).

The engine may still *reserve* a few names by convention (`start`, `end`, `as_of`, `note`) so that packs which want temporal semantics spell them the same way — but for MVP it implements nothing special for them; a pack that uses `start` is just using one of its own declared qualifiers. Cross-pack coordination on a shared temporal vocabulary is a later concern, not an MVP one.

## Qualifiers are quizzable, and this was free

> Post-MVP: we don't quiz qualifiers yet. This section is here for the structural point it makes about the log, which *is* an MVP decision.

Because answer events reference a statement rather than a bare triple, asking "when did Constantinople become Istanbul?" would be just quizzing a qualifier of an existing statement. No new fact kind, no new log shape — the answer event hides the `end` qualifier of that statement and everything else works unchanged.

This is a good illustration of why the log references statements. Had it referenced subject/relation/object triples, qualifier questions would have needed a parallel logging path.

## The MVP statement carries no rank

`rank` is **not** on the engine's statement type, and **not** in the MVP pack file. Decided in the 2026-07-17 review.

The reason is not that rank is unimportant — [rank-and-time.md](rank-and-time.md) describes real jobs it does. It is that the MVP's pack has resolved every conflict *at generation time*, by filtering to claims that are current and unambiguous and excluding entities that resist — see [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md). Every statement that survives is current, unconflicted, and unretracted. A field with one legal value is not a model; it is a claim about the future that nothing tests. No consumer would filter on it, and the first pack to write `deprecated` would find that nothing respected it.

Nor is it a one-way door. Statement IDs are unstable, so this deserved a hard look — but rank does not need re-extraction from Wikidata. Because filtering already guarantees every statement is current, a later pass can assign rank locally without regenerating the pack, and regeneration is the thing that would orphan answer history. **Filtering removes the need for rank rather than making it precious.**

Rank arrives with the work that needs it: a second pack, a pack update that retracts a claim, or the first temporal facts.

## Identity and stability

Statement IDs must be stable across pack rebuilds, because **answer events reference them and history must survive a pack update.** An ETL re-run that churns IDs orphans a user's entire learning record for that pack — this is the single most destructive failure mode in the data model, and it is silent.

How to achieve that stability is unresolved. See [open-questions.md](open-questions.md).

## Related

- [rank-and-time.md](rank-and-time.md) — how a statement stops being true without being deleted.
- [identity.md](identity.md) — the same problem for entities, where it has a clean answer.
