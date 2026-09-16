# Product

Product and UX concepts: what the experience should feel like, and the decisions behind it. Concepts here are organized like any other — by concept, not by screen or component — because a UX concept that spans three components has no home in the code tree, which is exactly why it needs a spec.

## A sitting has no boundary

Questions keep coming until the user stops. There is no round, no "you have completed 10 of 10," no end screen. You quiz until you're done quizzing, and you leave.

The alternative we expected to pick was a fixed-length round — ten questions, then results — because it manufactures a natural moment for the accuracy screen to appear and gives the user a sense of closure. It lost anyway. A round is state: something has to know how long it is, where you are in it, what happens if you leave halfway, whether an abandoned round counts. That is a real model to build and maintain, and it buys a moment of ceremony rather than a capability.

Two other shapes were considered. **Due-set driven** — the round is "everything the scheduler says is due" — is where this probably ends up once real spaced repetition lands, but it models a future that doesn't exist: the MVP scheduler is random-least-recent, so nothing is meaningfully *due*, and a round defined by due-ness would be a round defined by nothing. **Region selection first** — pick South America, then quiz inside it — would surface the region × relation framing in the flow itself rather than only in the results, but it costs a selection screen and a scheduler that filters by subgraph, and it presumes the user knows what they want to practice. The whole point of the accuracy screen is that they often don't.

### What this buys

**There is no session model.** Nothing tracks a sitting. The answer log is the only record that a sitting happened, and it records answers, not sittings.

**The scheduler stays a pure "what next" function.** It is asked for a card and returns one. It is never asked to plan, budget, or fill a round — which matters because the `Scheduler` interface is the seam FSRS swaps into later, and a seam with session-planning baked into it is a seam FSRS has to fight. See [../learning/](../learning/).

**The accuracy screen is navigated to, not arrived at.** This is the real cost, and it is worth naming rather than glossing: the region × relation view has no moment that produces it. The user has to go looking. If it turns out nobody looks, the fix is a reason to look — not necessarily a round.

## Colour in the summary charts means two different things

> **[UNREVIEWED]** — written from the #238/#239 build rather than from a prior decision. The rule that a pie stops working past roughly six categories is the agent's judgement call; confirm it is the line you want drawn.

The My Answers summary carries two charts, and they encode colour under opposite rules. Outcome colour is **semantic** and fixed: correct is green, incorrect is red, and skip is deliberately neither — it is the absence of an attempt, not a worse kind of wrong. Pack colour is **categorical** and means nothing at all; it is assigned by rank off a ramp that wraps, because nothing fixes how many packs there are.

Keeping the two ramps disjoint is the load-bearing part. A pack tinted the green of *correct* would read as a verdict on that pack, which is a claim the chart is not making. The same reasoning rules out the reserved Princeton Orange, which already means "the primary button" everywhere else in the app.

The forms differ for the same reason. A handful of outcomes are a pie; the packs are a horizontal stacked bar, because a pie compares many magnitudes badly — past roughly six categories the small ones become indistinguishable wedges, and [`packs/`](../../packs) holds more than that today. Both charts carry every value as text in their legend, with the drawing itself `aria-hidden`: the legend is the accessible reading, and announcing each number twice helps nobody.

## Product judgments living elsewhere

Some product decisions are already expressed as architecture in the engine specs. Numeric facts are compared rather than recalled, because approximate magnitude is what people actually know — see [../questions/](../questions/). If this file grows, those may want to move here or be linked from here.
