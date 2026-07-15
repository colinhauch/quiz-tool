# Template Shape (Reference)

> **[UNREVIEWED]** — Proposed, never built. Superseded by code once templates exist.

Preserved from the original design. Reasoning is in [README.md](README.md) and [distractors.md](distractors.md).

## A template

```jsonc
{
  "id": "mc_object",
  "relation": "borders",
  "direction": "forward",
  "prompt": { "en": "Which of the following countries borders {subject}?" },
  "input": "multiple_choice",
  "options": 4,
  "distractors": "siblings",          // strategy
  "difficulty": 2,                    // 1–5; informs input-mode selection
  "requires": []                      // capabilities, e.g. ["subject.media.image"]
}
```

`requires` is the capability-matching hook from [../packs/](../packs/) — a template asking for an image is simply not eligible for packs without one.

## Generation path

Scheduler picks a due card → the card names a statement and a direction → an eligible template is chosen (capabilities satisfied, difficulty appropriate) → the prompt renders with localized labels → options are assembled per the distractor strategy.

## Directions

- **forward** — hide the object: "What country is Tokyo in?"
- **reverse** — hide the subject, phrased via `inverse_of` or symmetric normalization: "Name a city in India." For `cardinality: many`, *any* valid subject is correct — which is the unresolved crediting problem in [../open-questions.md](../open-questions.md).
- **qualifier:&lt;name&gt;** — hide a qualifier: "When did Constantinople become Istanbul?"

## Distractor strategies

The registry the snapshot in [distractors.md](distractors.md) refers to:

- **`siblings`** — same type, near in graph: other South American countries not bordering Brazil. Hard.
- **`same_type_far`** — same type, distant region: Mongolia as a Brazil-border option. Easy.
- **`same_range`** — anything satisfying the relation's range types. The baseline that only guarantees validity.
- **`literal_spread`** — for quantities: plausible wrong values at ×0.5, ×2, ×10 of truth.

## Numeric templates

Exact recall is avoided — see [README.md](README.md).

- `compare_two` — "Which has the larger population: Tokyo or Delhi?" Reads literals off both statements.
- `order_of_magnitude_mc`
- `range_bucket_mc` — "Is Tokyo's metro population <10M / 10–20M / 20–40M / >40M?"

`compare_two` synthesizes a virtual card keyed to the *pair* of statements, logging both IDs in the answer event (`statement_id` primary, plus a `context_statement_ids` array). That mechanism is the unresolved part — see [open-questions.md](open-questions.md).

## Temporal templates

Key off the core `start`/`end` qualifiers uniformly across packs. "What was the capital of Brazil in 1900?" filters `capital` statements by date range; "When did X become Y?" targets `qualifier:start`.
