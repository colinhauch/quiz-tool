# Open Questions — Question Generation

> **[UNREVIEWED]** — Questions are the author's; the reasoning under each is the agent's. Notably unverified: that loose matching corrupts the insight aggregates rather than just the one question, and that comparison questions may be "the first real crack" in the uniform model.

## How fuzzy should text-input matching be?

Text input needs to accept "Sao Paulo" for "São Paulo" and probably "St. Petersburg" for "Saint Petersburg". Aliases are already stored per language, so the matching pool exists — the question is normalization aggressiveness.

Too strict punishes typing rather than knowledge. Too loose accepts a wrong answer that happens to be close, and the answer log then records knowledge the learner doesn't have — which corrupts the insight aggregates, not just the one question. Erring loose is the safer direction for user experience and the more damaging one for data quality.

Unresolved: whether diacritic folding, punctuation stripping, and abbreviation expansion are enough, or whether edit distance is needed. Edit distance is where "close enough" becomes indefensible — "Austria" and "Australia" are two edits apart.

## Where does difficulty come from?

Currently hand-tagged per template. The alternative is deriving it from global answer statistics per statement — the facts people actually get wrong are the hard ones, regardless of what the template author guessed.

Derived difficulty is obviously better and needs data we won't have until the app has been used. The real question is whether the hand-tagged version is a stepping stone or a dead end: if difficulty is a template field now, does making it a per-statement computed value later mean templates lose the field, or gain a fallback?

## Comparison questions strain the card model

A comparison is about two statements; a card is keyed to one. The current approach — a virtual card keyed to the pair, logging both statement IDs with one primary — is unproven.

The concern: the pair space is quadratic, and a virtual card that isn't in the card table isn't schedulable by the same mechanism as everything else. This may be the first real crack in the "one uniform model" claim. See [../learning/](../learning/).
