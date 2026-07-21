# Generator Shape (Reference)

> **[UNREVIEWED]** — Proposed, never built. Superseded by code once generators exist.

Preserved from the original design, then reframed: question generation is **pack-provided code**, not engine-owned template data. Reasoning is in [README.md](README.md) and [distractors.md](distractors.md). This file sketches the *interface* between the engine and a pack's generator; the pack fills in the body.

## The generator interface

A pack registers, per relation, a generator the engine can invoke. Sketch:

```ts
// The engine hands the generator a due card — the statement(s) and which
// slot to hide — plus the learner's level; it gets back an assembled question.
type Generator = (input: {
  statements: Statement[];       // one for recall, two for a comparison
  hiddenSlot: "subject" | "object" | `qualifier:${string}`;  // what to conceal
  level: number;                 // learner's current stability, so the generator can pitch difficulty
  graph: GraphQuery;             // to pull distractors from the same graph
}) => Question;

type Question = {
  prompt: LocalizedString;       // e.g. "Which of the following countries borders Brazil?"
  input: "multiple_choice" | "text" | "select_all";
  options?: Option[];            // assembled by the generator, distractors from `graph`
  answer: AnswerSpec;            // what counts as correct, for scoring
};
```

The old declarative fields (prompt string, option count, distractor strategy, difficulty) haven't disappeared — they've moved *inside* the generator, which composes them in code rather than declaring them as data. Capability matching (an image-based question needing `subject.media.image`) becomes the generator returning nothing when the statement lacks what it needs.

## Generation path

Scheduler picks a due card → the card names a statement and which slot to hide → the engine invokes the pack's generator for that relation → the generator assembles the prompt and options (distractors from the graph) → the engine displays it and logs the result.

## Hidden slots

- **object** — hide the object: "What country is Tokyo in?"
- **subject** — hide the subject, phrased via `inverse_of` or symmetric normalization: "Name a city in India." For `cardinality: many`, *any* valid subject is correct — which is the unresolved crediting problem in [../open-questions.md](../open-questions.md).
- **qualifier:&lt;name&gt;** — hide a qualifier (post-MVP): "When did Constantinople become Istanbul?"

## Distractor strategies

Distractor selection is a graph operation a generator calls; these are the common shapes it draws on (see [distractors.md](distractors.md)):

- **`siblings`** — same type, near in graph: other South American countries not bordering Brazil. Hard.
- **`same_type_far`** — same type, distant region: Mongolia as a Brazil-border option. Easy.
- **`same_range`** — anything satisfying the relation's range types. The baseline that only guarantees validity.
- **`literal_spread`** — for quantities: plausible wrong values at ×0.5, ×2, ×10 of truth.

## Numeric questions

Exact recall is avoided — see [README.md](README.md). A quantity generator instead produces:

- comparison — "Which has the larger population: Tokyo or Delhi?" Reads literals off both statements.
- order-of-magnitude multiple choice.
- range-bucket — "Is Tokyo's metro population <10M / 10–20M / 20–40M / >40M?"

Comparison synthesizes a virtual card keyed to the *pair* of statements, logging both IDs in the answer event (`statement_id` primary, plus a `context_statement_ids` array). That mechanism is the unresolved part — see [open-questions.md](open-questions.md).

## Temporal questions (post-MVP)

Not built for MVP. When they arrive, a temporal generator reads a statement's period qualifiers — "What was the capital of Brazil in 1900?" filters `capital` statements by date range. Because qualifiers are pack-defined (see [../knowledge-graph/statements.md](../knowledge-graph/statements.md)), the generator and the qualifier vocabulary ship together in the same pack, so there's no cross-pack vocabulary to coordinate.
