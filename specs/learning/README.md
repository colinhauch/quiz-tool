# Learning

What the user knows, what to ask next, and where the gaps are. This is the half of the app that isn't geography.

## The log is immutable and append-only

Every answer is a row: user, statement, direction, template, correctness, what they said, how long it took, when. Rows are never updated and never deleted.

**The log never stores derived judgments.** Not "Colin is weak on South American languages," not a skill score, not a mastery level. Only what happened.

This is the highest-leverage decision in the concept, and the reason is retroactivity: **derived judgments are always recomputed, so a better analysis applies to your entire history the day you write it.** Store a skill score and you have frozen the analysis that produced it; every improvement thereafter only applies to answers given after the improvement, and the old rows are permanently interpreted by a model you have since decided was wrong. Recomputing is cheap and the log is small. Never trade this away for a cache without a specific measured reason.

## The knowledge coordinate is (statement, direction)

Not the statement. Not the entity. The pair.

Knowing Tokyo → Japan and being able to produce Tokyo when asked for a city in Japan are different skills, learned at different rates, forgotten at different rates. Collapsing them would mean a learner who has only ever been asked forward questions appears to know something they cannot actually retrieve. See [../questions/](../questions/).

The consequence is that cards key on `(user, statement, direction)`, and that key is load-bearing throughout — it is the thing comparison questions don't fit, and it is why they need a virtual card.

## The scheduler is an interface from day one

`select` picks what to ask; `review` updates state after an answer. Two methods.

The MVP implementation is deliberately trivial — random over new and least-recently-asked. It exists to prove the seam, not to teach anyone. FSRS goes in later behind the same interface, and cards carry an algorithm tag and an opaque per-algorithm state blob so that algorithms can coexist and cards can migrate individually rather than in a big-bang rewrite.

The reason to build the interface before needing it: a scheduler that reaches into storage or question generation is not swappable, and by the time you want to swap it, the entanglement is everywhere. The interface is cheap now and impossible later.

## Insights are aggregations, computed on demand

Accuracy by relation type. Accuracy by region. The region × relation matrix — that matrix is the "knowledge gaps" screen, and it is the point of the whole app.

Region rollup works by walking `located_in` edges transitively up to a continent, so "accuracy on languages in South America" is a traversal joined against the log. Nothing is precomputed; nothing is stored as a fact.

**Every future pack's answers join into these aggregates automatically**, because every pack's statements have the same shape and every answer references a statement. A languages pack shipped two years from now aggregates against cities data from today with no integration work. That property — the thing that makes the app's central promise possible — is a direct consequence of the uniform fact model in [../knowledge-graph/](../knowledge-graph/), and it is what that model was bought for.

## Multi-user schema, single-user product

Every user-side row carries a `user_id`, and the MVP hardcodes one local user.

This is the cheapest hedge in the system: a column now, versus a migration across the log and the card table later. Adding accounts becomes auth plus a users table plus sync — the data model does not change. Deferring the column costs a migration of exactly the tables you least want to migrate, because they are the ones holding irreplaceable user history.
