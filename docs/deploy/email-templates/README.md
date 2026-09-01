# Supabase auth email templates

HTML templates for the transactional emails Supabase Auth sends. Styled to match
the Geography Quiz app (light theme, Indigo Ink chrome, Princeton Orange button,
serif display / sans body).

## Files

| File                  | Supabase template            | Status                     |
| --------------------- | ---------------------------- | -------------------------- |
| `magic-link.html`     | Authentication → Magic Link  | Primary — being wired up   |
| `confirm-signup.html` | Authentication → Confirm signup |                         |
| `invite.html`         | Authentication → Invite user |                            |

## How to use

1. Supabase Dashboard → **Authentication → Email Templates**.
2. Pick the matching template tab.
3. Paste the file's contents into the message body (source/HTML field).
4. Set a subject line, e.g.
   - Magic Link: `Your sign-in link for Geography Quiz`
   - Confirm signup: `Confirm your email for Geography Quiz`
   - Invite: `You're invited to Geography Quiz`
5. Save. Send yourself a test.

These are the source of truth — edit here, then re-paste. Supabase has no import,
so the Dashboard copy must be kept in sync by hand.

## Go-template variables

Supabase renders templates with Go's `text/template`. Variables used / available:

- `{{ .ConfirmationURL }}` — the magic-link / confirmation URL. **Required** and
  used verbatim as the CTA button `href` and the plain fallback link. Do not
  wrap, encode, or split it.
- `{{ .SiteURL }}` — the configured site URL. (not currently used)
- `{{ .Email }}` — the recipient's address. (not currently used)
- `{{ .Token }}` — the 6-digit OTP, if you want a code instead of a link. (not used)

## Email-HTML constraints (why the markup looks dated)

Inboxes are hostile to modern CSS, so every template deliberately:

- Uses **inline `style` attributes** on every element. The layout does not depend
  on any `<style>` block or external stylesheet.
- Uses **table-based layout** (`<table role="presentation">`), never flexbox/grid.
- Ships **no external assets** — no remote images, no web fonts. EB Garamond will
  not render in most inboxes, so display type uses a serif stack
  (`Georgia, "Times New Roman", serif`) and body type a sans stack
  (`Helvetica, Arial, sans-serif`). The wordmark is plain text, not an image.
- Uses a **bulletproof button**: a padded `<a>` for modern clients plus a VML
  `<v:roundrect>` fallback (in `<!--[if mso]>`) so Outlook renders a real button.
- Includes a **plain-text fallback link** (the raw `{{ .ConfirmationURL }}`) under
  the button, for clients that strip or mangle the button.
- Is **~600px max-width, centered**, on a light (`#f1f2f6`) background.

## Colors (pulled from `packages/web/src/index.css`)

| Token          | Hex       | Use in email                          |
| -------------- | --------- | ------------------------------------- |
| Indigo Ink     | `#27187e` | header band, headings, body text      |
| Cornflower     | `#758bfd` | card left border, fallback link       |
| Platinum       | `#f1f2f6` | page background, footer divider       |
| Princeton Orange | `#ff8600` | CTA button                          |

(`--orange-hover #e67600` is hover-only and has no effect in email, so it is not
used.) Muted greys `#6a6a80` / `#9a9aae` are email-only, for fine print.
