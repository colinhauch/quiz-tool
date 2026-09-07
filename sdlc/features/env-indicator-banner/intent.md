# Intent: Always-on environment indicator for non-prod

Status: draft

## Problem
As a developer I keep losing track of which deployed environment a given tab is
actually showing. dev / test / prod look identical in the browser, so I can't
tell at a glance whether quiz-dev is really the dev environment I think it is,
or whether I'm about to poke at something in prod. There's nothing on the page
that tells me the environment.

## Why it matters
Confusing environments risks doing the wrong thing in the wrong place —
testing against prod, or trusting a change I think is live but isn't. Right now
the only way to know is to read the URL carefully, which is easy to get wrong.
A persistent visual cue removes that whole class of mistake.

## Proposed outcome
Every non-prod environment shows a clear, always-present visual indicator (e.g.
a colorful icon or banner) naming the environment — a distinct color per env so
dev and test are instantly distinguishable. prod shows nothing at all. Local dev
gets its own indicator too, so localhost is never mistaken for prod. Any visitor
to the page sees it; it's not gated to logged-in developers.

## Affected users & systems
- The main quiz web app (packages/web). Admin app is out of scope for now.
- Anyone viewing a non-prod environment (not just developers).
- Likely needs some notion of "current environment" threaded into the app —
  possibly sourced from Cloudflare / the Worker's per-branch config (see Open
  questions).

## Constraints
- The indicator must NEVER appear on prod. Prod is the one environment
  explicitly hidden.
- Fail-safe toward showing: if the environment is unknown or misconfigured,
  show the indicator anyway. A false "non-prod" badge is acceptable; a silent
  prod-looking non-prod env is not.
- Shows the environment name only (dev / test / local). It does not need to
  prove which git branch/commit is deployed — we trust the label.
- Must not obscure the app's own content.

## Out of scope
- The @geo/admin visualizer app.
- Proving/verifying which branch or build is actually deployed (branch/commit
  provenance).
- Gating, auth, or hiding the indicator from any class of viewer.

## Open questions
- Where does the "current environment" value come from? The three envs already
  deploy with per-branch config (wrangler.toml / CI); is there an existing
  env var or binding that identifies the environment, or does one need adding?
- How does the value reach the client — baked in at build time, served by the
  Worker, or read from the hostname? (Hostname is the simplest fail-safe source
  but couples the indicator to domains.)
- Icon vs banner, and exact colors per env — deferred to the spec/design.
