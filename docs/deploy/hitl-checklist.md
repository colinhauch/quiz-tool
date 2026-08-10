# Deploy MVP — human-only (HITL) checklist

Things an agent **cannot** do over the connected MCPs (Supabase + Cloudflare) and that need Colin at a dashboard, DNS registrar, or Google Cloud console. Tracked against the wayfinder map [#49](https://github.com/colinhauch/quiz-tool/issues/49). Update the checkboxes as you go.

Connected + already done by agent (for reference):
- Supabase project `quiz-tool` (ref `fmxjevgxlnqujsqeqfwt`, `https://fmxjevgxlnqujsqeqfwt.supabase.co`), schema + RLS migrated and proven. Publishable key `sb_publishable_fAoIRUV4B8RRdytsQRPgjw_tGhmvYdo`.

---

## 1. Google OAuth provider (Supabase → Auth → Providers → Google) — issue #53
Agent can't register an app in someone else's Google Cloud account.

- [ ] In **Google Cloud Console → APIs & Services → Credentials**, create an **OAuth 2.0 Client ID** (type: Web application).
- [ ] Authorized redirect URI: `https://fmxjevgxlnqujsqeqfwt.supabase.co/auth/v1/callback`.
- [ ] Configure the OAuth consent screen (app name, support email, scopes: `email`, `profile`, `openid`).
- [ ] Copy **Client ID** + **Client secret** into Supabase → Authentication → Providers → **Google** → enable.
- [ ] Record: client ID stored where, consent screen in testing vs published.

## 2. Magic-link email (Supabase → Auth) — issue #53
- [ ] Confirm **Email** provider is enabled and the magic-link template contains `{{ .ConfirmationURL }}` (else Supabase sends a 6-digit OTP instead of a link).
- [ ] Add the SPA callback URL to **Auth → URL Configuration → Redirect URLs** (e.g. `https://quiz.colinhauch.com/auth/callback`, and `http://localhost:5173/auth/callback` for dev).
- [ ] For real email deliverability beyond the low built-in cap, configure a custom **SMTP** provider (post-alpha ok; note the default rate limit for alpha).

## 3. ES256 asymmetric JWT signing keys (Supabase → Auth → Signing Keys) — issue #53
Research #51 recommends asymmetric ES256 over shared-secret HS256 so the Worker verifies JWTs against the public JWKS with no shared secret.

- [ ] In **Auth → Signing Keys**, generate/rotate to an **ES256 (P-256)** signing key; make it the current key.
- [ ] Confirm the JWKS is served at `https://fmxjevgxlnqujsqeqfwt.supabase.co/auth/v1/.well-known/jwks.json`.
- [ ] (No app secret to store — the Worker only needs the public JWKS URL.)

## 4. Cloudflare Worker + DNS — issue #54
Agent can create the Worker via MCP, but not authenticate `wrangler` locally or move nameservers.

- [ ] Confirm the Cloudflare account has **Workers** enabled; note the **account id**.
- [ ] `wrangler login` locally (interactive OAuth — run `! wrangler login` in the session so output lands here).
- [ ] Confirm **`colinhauch.com` DNS is managed by Cloudflare**. If not, migrate nameservers to Cloudflare — this is the long pole (propagation can take hours).
- [ ] Once deployed, add a **custom domain / route** binding `quiz.colinhauch.com` → the Worker.

## 5. Secrets for the Worker (set via `wrangler secret put`, not committed)
- [ ] `SUPABASE_URL` = `https://fmxjevgxlnqujsqeqfwt.supabase.co`
- [ ] `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_fAoIRUV4B8RRdytsQRPgjw_tGhmvYdo` (low-privilege; forwards the user JWT for RLS)
- [ ] `SUPABASE_SERVICE_KEY` = secret key — **only** if a genuine admin/batch path needs it; keep out of the request path.

## 6. Local test env (optional, to run the store integration tests fully)
The supabase-js store tests skip unless these are set (they mint a throwaway user via the admin API):
- [ ] `.env` (gitignored) with `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` so `packages/server` integration tests can create/sign-in a test user and exercise real RLS.
</content>
</invoke>
