# The engine owns question kinds; packs choose among them

A pack owns how its facts are phrased, but not how its answers are judged. The engine defines a closed set of question kinds — typed text today, multiple choice next, numeric and date later — and owns the grading for each; a pack declares which kind a relation is quizzed with and supplies the content. Adding a new *domain* is therefore a pack and nothing else, while adding a new *question kind* is one engine change that every pack then benefits from.

This is a correction, not just an addition. `specs/packs/` claimed that adding currencies, borders, or rivers meant writing a pack and never touching the engine. That conflated two different things and was already false for the second: rendered content was hard-wired to `input: "text"`, and grading resolved the hidden slot to an entity and string-matched its labels, throwing outright on a literal object. Multiple choice was listed in `TODO.md` as "really easy for the continents pack" when a pack could not express it at all.

## Considered options

**Packs own grading too** — shipping a `grade()` beside each generator, leaving the engine to schedule, store, and display — is the purest form of the original claim, and was rejected for two reasons. Answer normalisation is a genuinely shared concern (diacritic folding, punctuation, whitespace) that would get reimplemented per pack and drift. Worse, it makes the answer log's meaning depend on pack version: a pack update could silently change how past answers would have been judged, and history has to stay interpretable.

## Consequences

Rendered content becomes a discriminated union keyed by kind rather than a record with a fixed `input: "text"`, which reaches the HTTP contract and the web client, not just the engine.

Multiple choice needs plausible wrong answers, and nothing can currently query entities by type to find them. That gap is the real unknown in shipping the first new kind; it belongs with the distractor design in `specs/questions/`.
