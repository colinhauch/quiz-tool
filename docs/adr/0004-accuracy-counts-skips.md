# The outcome pie counts skips against accuracy; the table reports attempt-adjusted accuracy beside it

The My Answers summary (#233) reports two different accuracy figures on purpose. The **pie** divides the whole Answer Log three ways — correct, incorrect, skip — so its correct share is *absolute accuracy*: `correct / all answers`. The **table** beside it reports *attempted accuracy*: `correct / (all − skips)`. Both are labelled; neither is presented as "the" accuracy.

This exists because a *Skip* (an answer submitted with no input) is a third of the real data — 164 of 476 logged answers at the time of the decision — so the choice of denominator is not a rounding detail. The same learner reads as **42.6%** absolute and **65.1%** attempted. Publishing one number without saying which it is would misrepresent the log by more than twenty points.

## Considered options

**Attempted accuracy alone** (skips excluded everywhere) was the recommendation and was rejected. It flatters: it answers "when you commit to a guess, how often are you right", and quietly deletes a third of the record to do it. A learner who skips half their cards is not a 65% learner in any sense that matters.

**Absolute accuracy alone** was rejected once it became clear it is arithmetically identical to the pie's correct wedge — the same number rendered twice, side by side, while the genuinely interesting quantity (how often you attempt at all) went unreported.

Reporting both, in different places, is what makes the gap between them legible. The gap *is* the finding: it describes how the learner is using the app, which is distinct from what they know.

## Consequences

**A skip is not a fourth outcome in storage.** Nothing in the schema changes. A skip is `input === ""`, derived at read time, and is still recorded `correct: false` — so it remains a subset of incorrect everywhere except the summary, which is the only place that separates them. Every answer ever logged is classified retroactively, with no migration.

**If a real Skip control is ever added, this ADR needs revisiting, not extending.** An explicit skip and a blank submission would stop being the same event, and the three-way partition here silently assumes they are. (At the time of writing, no blank answer has ever been graded correct, so the partition has no overlap.)

**"Accuracy" is never safe unqualified** in this codebase — in UI copy, in a variable name, or in conversation. It resolves to two different numbers. Say which.
