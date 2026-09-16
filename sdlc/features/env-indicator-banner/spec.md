# Spec: Always-on environment indicator for non-prod  (from intent)

Status: accepted

## Summary
Every non-prod Environment (dev, test — and, fail-safe, any unrecognized one)
shows a persistent, colorful badge naming the Environment it is, so a developer
can never mistake which of quiz-dev / quiz-test / prod a browser tab is showing.
prod shows nothing. The value is authoritative: it comes from the Worker's
`DEPLOY_ENV` var (the same source `worker.ts` and the schema guard already
trust), surfaced to the SPA over a new unauthenticated `GET /api/config`
endpoint. This resolves the intent's open question in favor of the
server-injected source rather than hostname sniffing.

## Requirements
1. On dev and test, a badge naming the Environment is visible on every screen of
   the web app, without interaction.
2. On prod, no badge appears — prod is the sole Environment explicitly hidden.
3. dev and test badges are visually distinct (distinct color per Environment)
   and legible independent of color (the Environment name is shown as text, not
   conveyed by color alone).
4. The badge is visible to any viewer of a non-prod Environment, not gated on
   auth or a developer flag.
5. The Environment value is authoritative: derived from the server's
   `DEPLOY_ENV`, not from the hostname or a build-time guess.
6. Fail-safe toward showing: if the Environment cannot be determined
   (`DEPLOY_ENV` unset/unrecognized, or the config request fails), a badge is
   shown — never silent. Only an explicit `prod` suppresses it.
7. Local development (no `DEPLOY_ENV`) shows a badge too, so localhost is never
   mistaken for prod.
8. The badge must not obscure the app's own content.

## User Stories
1. As a developer with several tabs open, I want each non-prod tab to name its
   Environment, so that I never act on the wrong one.
2. As a developer, I want the dev badge and the test badge to be different
   colors, so that I can tell them apart at a glance without reading.
3. As a developer, I want prod to show no badge, so that the production UI stays
   clean and the absence of a badge reliably means "this is prod."
4. As a developer verifying a deploy, I want the badge sourced from the same
   `DEPLOY_ENV` the server trusts, so that the badge can't disagree with what the
   server actually thinks it is.
5. As a developer, I want the badge to appear even when the Environment is
   misconfigured or unknown, so that a broken config can never make a non-prod
   Environment look like prod.
6. As a developer running the app locally, I want a badge, so that localhost is
   visibly not prod.
7. As a colorblind developer, I want the Environment name spelled out, so that I
   don't rely on the color to know where I am.
8. As any visitor to a non-prod URL, I want to see that it's non-prod, so that I
   know the data here isn't production data.
9. As a developer, I want the badge to stay out of the way of the app's
   controls, so that it informs without obstructing.
10. As a maintainer, I want the Environment value exposed at one endpoint, so
    that other tools (or future admin views) can read the same source of truth.

## Implementation Decisions
- **Source of truth: `DEPLOY_ENV`.** wrangler.toml already sets `DEPLOY_ENV` per
  named environment (`prod`/`dev`/`test`); `worker.ts` already reads it. The
  badge reads the same var — no new deploy config, no hostname coupling.
- **New route `GET /api/config`** on the Hono app, returning
  `{ environment: "prod" | "dev" | "test" | "unknown" }`. Unauthenticated (it
  leaks nothing sensitive), served the same way `/health` is. `createApp` gains
  an injected Environment value (dependency-injected exactly like the existing
  `store`/`rating`/etc.), which `worker.ts` populates from `env.DEPLOY_ENV` and
  the Node entry (`index.ts`) leaves unset.
- **Normalization is fail-safe.** The server maps `DEPLOY_ENV` to the response:
  exactly `prod` → `prod`; `dev` → `dev`; `test` → `test`; anything else,
  including unset → `unknown`. `unknown` is treated by the client as non-prod
  (badge shown).
- **Client contract.** A new `getConfig()` in `apiClient` calls `/api/config`.
  A presentational component (mounted once at the app shell, above the routed
  content) fetches it on load and renders a badge unless `environment === "prod"`.
  On fetch failure it renders an `unknown` badge (fail-safe, per requirement 6).
- **Badge model is a pure mapping** `environment → { label, variant } | null`
  (null only for `prod`), so the show/hide + color decision is unit-testable
  without a DOM. Variants: `dev`, `test`, `unknown` each get a distinct color;
  local dev surfaces as `unknown` (or an explicit `local` label if the Node
  entry chooses to inject one — deferred to the plan).
- **Uses CONTEXT.md vocabulary "Environment"** (not stage/deployment/instance)
  in code and copy. Note the glossary defines only `prod`/`test`/`dev` as
  Environments; `unknown`/`local` are the fail-safe fallback, not a fourth
  Environment.
- Exact colors, badge placement, and whether local gets its own label are visual
  decisions deferred to the plan; the requirements above bound them.

## Testing Decisions
- **Good test = external behavior only.** Assert the endpoint's JSON and the
  badge's rendered presence/label, never internal wiring.
- **Server (prior art: `app.test.ts` `/health` test, which does
  `createApp({...}).request("/health")`).** New cases: `createApp` with the
  Environment `dev`/`test`/`prod` → `/api/config` returns the matching
  `environment`; with it unset → `unknown`. One seam, tested at the app boundary.
- **Client badge mapping.** Unit-test the pure `environment → badge | null`
  function: `prod → null`; `dev`/`test`/`unknown` → a descriptor with the right
  label. No DOM needed.
- **Client component (prior art: `Feedback.test.tsx` / `AuthWidget.test.tsx`,
  React Testing Library).** With `getConfig` mocked to `dev`, the badge renders
  with the dev label; mocked to `prod`, nothing renders; on a rejected fetch, an
  `unknown` badge renders.

## Flagged concerns
- **Extra request on load.** `/api/config` is one more round-trip at startup.
  It's tiny and cacheable, and the badge can render as soon as it resolves
  (fail-safe `unknown` until then or on failure), so it never blocks the app. If
  even that's unwanted, the plan could fold `environment` into an existing
  startup payload — noted, not required.
- **Local dev source.** `DEPLOY_ENV` is a Worker var; the local Node dev path
  won't have it, so local resolves to `unknown` unless `index.ts` explicitly
  injects a `local`/`dev` value. Fail-safe already shows a badge, so this is a
  labeling nicety, deferred to the plan.

## Open questions carried from intent
- **Where does the Environment value come from?** Answered: the server's
  `DEPLOY_ENV`, surfaced via `GET /api/config`. (Chosen over hostname sniffing.)
- **How does it reach the client?** Answered: a runtime fetch to `/api/config`,
  not build-time injection (the same web build ships to all three branches, so
  build-time can't distinguish them).
- **Icon vs banner, exact colors per Environment.** Deferred to the plan/design;
  requirements 1–3 and 8 bound it (persistent, per-Environment color, text
  label, non-obstructing).

## Links
Intent: sdlc/features/env-indicator-banner/intent.md
