# Open Questions — System

Questions at the architecture level. Questions about a specific concept live with that concept — see the folder they belong to.

## Recording an answer: resolve it to a statement

An answer is recorded by **resolving what the user said to a statement**, then judging that statement. This is the general mechanism for every question, not a special case — it just becomes visible with subject-hidden `many` questions, which is why it's worked out here.

The rule: the user's answer resolves to a statement, and the answer is **correct if that resolved statement is a true edge in the graph that satisfies the question's hidden slot.** For a single-answer question exactly one statement qualifies, so this is indistinguishable from "did they match the source." For a `many` question — "name a city in Brazil," hiding the subject of `(?, isIn, Brazil)` — *any* true statement in the relation qualifies.

The statement the question was **generated from** is the scheduler's *reason for asking*, not the answer key. Walking "name a city in Brazil," generated from Recife:

- **User answers "Recife":** resolves to `s(Recife, isIn, Brazil)`, a true edge satisfying the slot → **correct**, credit that statement. (Single-answer questions land here too: the resolved statement equals the source.)
- **User answers "São Paulo":** resolves to `s(São Paulo, isIn, Brazil)`, a *different* true edge that still satisfies the slot → **correct**, credit São Paulo. The user was asked for *a* city and named one. Recife goes uncredited — it was never the answer key, only why the question got asked.
- **User answers "New York City":** resolves to `s(NYC, isIn, Brazil)`, which is **not** in the graph → **incorrect**, and the log records the user asserted it. This captures the actual misconception — "the user thinks NYC is in Brazil" — not a vague question-level miss.

Crediting the scheduler's picked statement regardless of the answer is wrong in both directions: on a right answer it credits a fact the user never demonstrated; on a wrong answer it marks Recife failed when the user said nothing about Recife. Crediting the *resolved* statement is the only honest recording.

**The log is then the scheduler's input directly.** Each row says which statement an answer resolved to and whether it held, so the scheduler reads back the log to see which statements are known, which were missed, and which it has scheduled but never got credited — and picks the next question from that. No separate bookkeeping.

Two consequences to pin down when this is built:
- **A scheduled pick can go un-reviewed.** If the user keeps answering "São Paulo," Recife is never credited and stays in the un-answered pool. That's correct — Recife *hasn't* been tested — but the scheduler must not re-serve the identical hidden-subject question forever expecting Recife specifically. How it varies or retires the pick is a scheduling question, not a crediting one.
- **A wrong answer credits a *false* statement.** The log gains rows for statements that aren't in the graph (`s(NYC, isIn, Brazil)`, incorrect). That's deliberate — it's misconception signal — but insight aggregation has to expect answered statements with no corresponding graph edge.

`many` questions themselves are post-MVP (MVP is single-answer only); the recording rule above is not — it's how the single-answer log works too. Touches [learning/](learning/) and [questions/](questions/), which is why it lives here.

## Does the uniform statement model cover everything? *(post-MVP watch-item)*

The knowledge graph leans hard on modeling quizzable facts uniformly as statements. One known case still pushes against that, deferred past MVP:

**Comparison questions** need a card keyed to a *pair* of statements — see [questions/open-questions.md](questions/open-questions.md).

(Subject-hidden `many` questions once looked like a second case, but the crediting rule above resolves them — each answer credits the single statement it resolves to, so no special card key is needed.)

The comparison case strains the assumption that a unit of knowledge maps to a single fact. It isn't in MVP scope, so it forces nothing yet. Worth watching: if a second genuine case appears, the card key — not the statement model — is likely what needs to change.
