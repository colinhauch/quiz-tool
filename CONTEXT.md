# Geography Learning Engine

A quiz app that teaches world geography from a knowledge graph, tracks every answer, and surfaces knowledge gaps. This glossary fixes the vocabulary; the reasoning behind it lives in [specs/](specs/).

## Language

### Content

**Pack**:
A tranche of authored content — statements, optionally entities, plus the generator code to quiz them — that is both how content is versioned and what a learner selects. Every pack is always loaded; selecting is a filter on what gets asked, never on what gets loaded.
_Avoid_: Tranche, module, deck, plugin, topic

**Entity**:
A thing the graph knows about, identified by its Wikidata Q-ID. Exactly one pack owns each entity; other packs assert statements over it without redefining it.
_Avoid_: Node, item, record

**Statement**:
One asserted fact — a subject entity, a relation, and an object (an entity or a literal). The atom everything else is built from: questions are generated from statements and answers are logged against them.
_Avoid_: Fact, triple, edge, assertion

**Relation**:
The kind of link a statement asserts (`located_in`, `located_in_continent`). Relation ids are global: a pack defines new ones, and never redefines another pack's.
_Avoid_: Predicate, property, relationship type

**Generator**:
Pack-owned code that turns a statement into a rendered question. The pack owns the prompt; the engine owns everything about the learning loop.
_Avoid_: Template, renderer, formatter

### Quizzing

**Card**:
A statement paired with the slot the question conceals — so one bidirectional statement yields two cards. The unit that is selected, asked, and logged.
_Avoid_: Question instance, item, prompt

**Hidden slot**:
Which part of a statement a card conceals (`object`, `subject`). Half of a card's identity.
_Avoid_: Direction, blank, gap

**Selection**:
The set of packs a learner has chosen to be quizzed on. Persisted server-side, defaults to every question-yielding pack, and may never be empty.
_Avoid_: Active set, enabled packs, filter, subscription

**Answer log**:
The append-only record of every answer, keyed by card. It records what was asked and is never filtered or rewritten by the current selection.
_Avoid_: History, results, attempts
