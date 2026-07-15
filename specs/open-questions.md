# Open Questions — System

> **[UNREVIEWED]** — The questions are the author's. The analysis is the agent's and is where it went furthest beyond the source: the livelock argument against crediting the answered card, and the "is 'everything is a statement' holding?" question, which the author never asked. Both are worth checking rather than accepting.

Questions at the architecture level. Questions about a specific concept live with that concept — see the folder they belong to.

## Reverse `many` questions: who gets the credit?

"Name a city in Brazil" accepts any valid answer. But a card is keyed to `(statement, direction)`, and the question was generated from *one* statement while a dozen would satisfy it.

Proposal: credit the statement matching whatever the user actually said. Answer "São Paulo," credit the São Paulo card.

Why it isn't settled: the scheduler chose a card — say, Recife — and scheduled that fact because it judged the user needed it. Crediting São Paulo instead means the scheduler's decision was silently discarded, and a user who always answers with the same easy city never gets asked about the rest. The card the scheduler picked is never reviewed, so it stays due forever and keeps being picked, generating a question the user keeps answering with São Paulo. That is a livelock, not just an accounting quirk.

The alternatives are worse in different ways: crediting the scheduled card records knowledge the user didn't demonstrate. Rejecting valid answers that aren't the scheduled one is indefensible to a user. Possibly the reverse-`many` question shouldn't be keyed to a single statement at all — but then what is it keyed to?

Touches [learning/](learning/) and [questions/](questions/), which is why it lives here.

## Is "everything is a statement" holding?

Two places currently push against the uniform model, and it is worth watching whether they are exceptions or a pattern:

**Comparison questions** need a card keyed to a *pair* of statements — see [questions/open-questions.md](questions/open-questions.md).

**Reverse `many` questions** need a card that isn't keyed to one statement either (above).

Both strain the same joint: the assumption that a unit of knowledge maps to a single fact. If a third case appears, that assumption is probably wrong and the card key — not the statement model — is what needs to change.
