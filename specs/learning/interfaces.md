# Record Shapes and Interfaces (Reference)

> **[UNREVIEWED]** — Proposed, never built. Superseded by code once these exist.

Preserved from the original design. Reasoning is in [README.md](README.md).

## Answer event

Immutable, append-only.

```jsonc
{
  "id": "a_7c21",
  "user_id": "local",
  "statement_ids": ["s_9f3a"],      // the statement(s) the question was built from; 2+ for comparison
  "hidden": [{ "slot": "object", "statement_id": "s_9f3a" }],
                                    // what was concealed: an entity/literal the user had to produce.
                                    // recall hides one slot; a comparison hides both populations.
  "presented": "Which country borders Brazil?",  // the string shown, for display
  "input_mode": "multiple_choice",  // "multiple_choice" | "text" | "select_all" | …
  "correct": true,
  "answer_given": "Q414",           // entity ID, literal, or raw text
  "latency_ms": 3400,               // optional
  "asked_at": "2026-07-14T14:02:11Z",
  "session_id": "sess_04"
}
```

The row carries no `template_id`/`generator_id` and no `direction`. The **`hidden`** array is what replaces direction: it names the entity-IDs and/or literals the question concealed, and its shape is what distinguishes challenges — one hidden slot for recall, two hidden literals for a comparison. The correct answer is not stored; it is re-derivable from `statement_ids` + `hidden` (for recall the hidden slot *is* the answer; for comparison it is computed from the two hidden literals), and statements survive deprecation so that derivation stays valid. What kind of question a row was is likewise derived, never tagged.

A comparison row, for contrast:

```jsonc
{
  "statement_ids": ["s_tok_pop", "s_del_pop"],
  "hidden": [{ "slot": "object", "statement_id": "s_tok_pop" },
             { "slot": "object", "statement_id": "s_del_pop" }],
  "presented": "Which has the larger population: Tokyo or Delhi?",
  "answer_given": "Q1490", "correct": true
}
```

## Card (scheduler state)

Mutable, one row per `(user_id, statement_id, hidden_slot)` — which slot of the statement the learner had to produce (`subject` | `object` | `qualifier:<name>`). Comparison questions have no single-statement coordinate and use a virtual card — see [README.md](README.md).

```jsonc
{ "user_id": "local", "statement_id": "s_9f3a", "hidden_slot": "object",
  "due": "2026-07-19T00:00:00Z", "stability": 4.2, "difficulty": 6.1,
  "reps": 3, "lapses": 0, "last_review": "2026-07-14T14:02:11Z",
  "state": "review",                 // "new" | "learning" | "review" | "relearning"
  "algo": "fsrs-4.5", "algo_state": { /* opaque per-algorithm blob */ } }
```

`stability` and `difficulty` are named here as if FSRS-specific, while `algo_state` is the opaque blob — that overlap is unresolved and probably means the sketch is confused about which fields are universal.

## The Scheduler interface

```ts
interface Scheduler {
  /** pick the next cards to quiz for a session */
  select(userId: string, pool: CardQuery, n: number): Card[];
  /** update state after an answer */
  review(card: Card, outcome: AnswerEvent): Card;
}
```

MVP implementation: `RandomLeastRecentScheduler` — uniform over `new` plus least-recently-asked. Later: FSRS via `ts-fsrs` behind the same interface.

## Repository interfaces

`EntityRepo`, `StatementRepo`, `AnswerLogRepo`, `CardRepo`, `PackRepo`. Method signatures were never specified. See [../storage/](../storage/).

## Insight queries

Aggregations over the log joined against the graph, computed on demand:

- **Accuracy by relation type** — `speaks` vs `located_in` vs `currency`.
- **Accuracy by region** — bucket each tested statement's subject by walking `located_in` transitively up to a continent (recursive CTE). "Accuracy on `speaks` where the subject rolls up to South America: 34%."
- **Strength map** — the region × relation accuracy matrix. This is the knowledge-gaps screen.
- **Trend** — the same aggregates windowed by `asked_at`.
