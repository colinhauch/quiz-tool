# Learning

> **[UNREVIEWED]** — The retroactivity argument for never storing derived judgments is stated much more forcefully here than in the source ("never trade this away without a specific measured reason"). The agent believes it; the author should confirm it's a rule and not just a preference.

What the user knows, what to ask next, and where the gaps are. This is the half of the app that isn't geography.

## The log is immutable and append-only

Every answer is a row: user, the statement(s) the question was built from, what was **hidden** from the user, the string they were shown, what they answered, whether it was correct, how long it took, and when. Rows are never updated and never deleted.

The row stores no template or generator reference and no `direction` field. Instead it records the **hidden** array — the entity-IDs and/or literals the question concealed — because that, together with the statement(s), is what makes the question a question and what distinguishes one challenge from another. "Given Tokyo, name its country" hides the object; "name a city in Japan" hides the subject; "which is bigger, Tokyo or Delhi?" references two population statements and hides both populations. What *kind* of challenge a row was is derivable from the shape of `hidden` plus the statements — it is never stored as a tag. Everything else about the question reaches through the statement IDs.

### Correctness comes from resolving the answer to a statement

Correctness is not compared against the statement the question was *generated from*. The user's answer is **resolved to a statement**, and the answer is correct if that resolved statement is a true edge in the graph satisfying the question's hidden slot. See [../open-questions.md](../open-questions.md) for the full walkthrough.

This matters for the row shape: the generated-from statement (the scheduler's reason for asking) and the resolved statement (what the user actually produced) can differ. "Name a city in Brazil" generated from Recife, answered "São Paulo," resolves to and credits `s(São Paulo, isIn, Brazil)` — not Recife. The row records the *resolved* statement(s), so the log reflects what the user demonstrated, and the scheduler reads the log to see which generated-from picks remain un-credited. A wrong answer can resolve to a statement that is *not* in the graph (`s(NYC, isIn, Brazil)`); the log stores it anyway as misconception signal, so insight aggregation must tolerate answered statements with no matching edge.

**The log never stores derived judgments.** Not "Colin is weak on South American languages," not a skill score, not a mastery level. Only what happened.

This is the highest-leverage decision in the concept, and the reason is retroactivity: **derived judgments are always recomputed, so a better analysis applies to your entire history the day you write it.** Store a skill score and you have frozen the analysis that produced it; every improvement thereafter only applies to answers given after the improvement, and the old rows are permanently interpreted by a model you have since decided was wrong. Recomputing is cheap and the log is small. Never trade this away for a cache without a specific measured reason.

## The knowledge coordinate is (statement, what's hidden)

Not the statement. Not the entity. The statement paired with what the question concealed.

Knowing Tokyo → Japan and being able to produce Tokyo when asked for a city in Japan are different skills, learned at different rates, forgotten at different rates. Collapsing them would mean a learner who has only ever been asked to name the country appears to know something they cannot actually retrieve. The two differ precisely in *what was hidden* — the object in one, the subject in the other. See [../questions/](../questions/).

The consequence is that cards key on `(user, statement, hidden-slot)` — which slot of the statement the learner had to produce. That key is load-bearing throughout, and comparison questions are still the case it doesn't fit: a comparison references two statements and hides a value from each, so it has no single `(statement, slot)` coordinate and needs a virtual card. The answer *log* represents comparison cleanly (it records an array of statements and an array of hidden values); it is the single-statement *card key* that strains.

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

## Deeper

- [interfaces.md](interfaces.md) — *reference.* The proposed answer-event and card shapes, the `Scheduler` interface, and the insight queries.
