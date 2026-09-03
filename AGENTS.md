# AGENTS.md — mindbill-landing

Marketing/landing site for **MindBill** (IncidentFox, Inc.), the CA workers-comp
med-legal billing product. This repo is **only the public marketing site** — the
actual app lives in the separate `mindbill` repo, deployed at app.mindbill.org.

- **Live:** https://mindbill.org  (workers-comp homepage; legacy `/workers-comp` redirects to `/`)
- **GitHub:** `chiehminwei/mindbill-landing`  (origin)

## Stack / build

- **No build step.** Static HTML files, one page = one `*.html`.
- Styling is **Tailwind via CDN** (`https://cdn.tailwindcss.com`) + Google Fonts
  (Inter Tight / Instrument Serif / JetBrains Mono). No bundler, no node_modules.
- `package.json` is a near-empty stub (`"type": "module"`, no deps, no scripts) —
  it exists mainly so Vercel treats `api/*.js` as ES modules.
- Two **Vercel serverless functions** under `api/` (the only dynamic code):
  - `api/lead.js` — `POST /api/lead`, two-step conference lead capture →
    Airtable, fires a Retell AI demo call on step 1.
  - `api/leads.js` — `GET /api/leads?token=…` → CSV/JSON export of leads
    (token-gated by `LEADS_ADMIN_TOKEN`).

## Analytics / tracking

**Every new public page MUST carry the Google Tag Manager snippets.** There is no
build step, no shared layout, and no templating — nothing is inherited, so a page
that omits them is simply invisible to analytics and to every ad platform. This is
the single easiest thing to forget when adding a page.

Container: **`GTM-NNJWFXB7`** (GTM account *MindBill* / container *mindbill.org*).

1. Immediately after `<meta charset="utf-8" />` in `<head>`:

```html
  <!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-NNJWFXB7');</script>
  <!-- End Google Tag Manager -->
```

2. Immediately after the opening `<body>` tag:

```html
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-NNJWFXB7"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
```

Keep `<meta charset>` first — the spec wants it inside the first 1024 bytes. GTM
says "as high in the `<head>` as possible"; directly after charset satisfies both.
Leave the snippet inline (do not move it to an external `.js`): it is inline by
design so it starts loading with no extra round-trip.

**Do not add vendor tracking tags to page HTML.** Pixels, conversion tags and
triggers (Google Ads, Meta, LinkedIn) are configured in the GTM container, not in
this repo. `attribution.js` is the exception: it is first-party plumbing that
preserves campaign context, decorates the single Calendly booking URL with UTMs,
and pushes vendor-neutral funnel events into `dataLayer`. It does not load a
pixel or send data by itself.

**Conversions fire on a valid Calendly redirect to `/thank-you`.** All demo CTAs
use the same Calendly event; `attribution.js` adds the incoming campaign UTMs and
landing-page variant to that URL. `thank-you.html` accepts the redirect, pushes
`demo_booking_confirmed`, and loads GTM only when `invitee_uuid` is present. The
Google Ads page-view conversion remains deduped on that UUID. Direct visits to
`/thank-you` deliberately do not load GTM, so they cannot become fake bookings.

Two things must stay true or the page silently stops working:

- **Calendly's Confirmation Page must redirect to `https://mindbill.org/thank-you`
  with "Pass event details" ticked.** Without that tick there is no
  `invitee_uuid`, so the dedup key is empty and a refresh double-counts.
- **The page must stay `noindex`.** The UUID gate prevents false conversions,
  and `noindex` keeps the confirmation page out of organic search entirely.

The page degrades cleanly with no query string (no name, no slot, no reschedule
links) — so a direct visit looks intentional rather than broken.

Exempt: `video/scenes*.html` — unlinked video-production mockups, not public pages.

Verify a new page after deploy (2 = both snippets present):

```bash
curl -s https://mindbill.org/<new-page> | grep -c GTM-NNJWFXB7
```

A snippet in the HTML does not prove it ran — in the browser console,
`typeof window.google_tag_manager` must be `'object'`.

## Pages (root *.html)

- `index.html` — **the homepage**. WC/med-legal pitch. Anchors:
  `#features #compare #founder`.
- `psychiatry.html` — psychiatry/TMS/Spravato pitch at `/psychiatry`.
- `case-study.html` — 9-month audit case study of a real psychiatric practice.
- `apa.html` — APA 2026 conference / booth landing page.
- `thank-you.html` — post-booking confirmation page (`/thank-you`). `noindex`.
  Calendly redirects here after a booking; it reads `invitee_uuid` /
  `invitee_full_name` / `event_start_time` and campaign UTMs, then strips the PII
  and campaign parameters from the URL before tags read them. GTM is gated on a
  real UUID and the page pushes `demo_booking_confirmed` — see *Analytics /
  tracking*.

## Directories

- `guides/` — 9 public WC billing reference articles (MLFS, CAS codes, IBR,
  second review, EOR, penalty/interest, etc.) + `index.html`.
- `help/` — 37 product help-doc pages + `index.html` (categorized doc hub).
- `help-img/` — ~90 screenshots used by `help/`.
- `img/` — product screenshots used on landing pages.
- `video/` — **427M, git-LFS** explainer videos + raw clips/audio/scenes
  subdirs (53 `.mp4`s). Served from `/video/...`.
- `print/` — 150M of print collateral (banners, brochures, business-card
  PDFs/PNGs) for conferences. Not web-served content.
- `retell/` — Retell booth-agent prompt + config (`*.md`, `*.json`) for the
  AI demo call.

## Run / preview locally

It's static — just open a page, or serve the folder:

```bash
open workers-comp.html              # quick view (clean-URL rewrites won't apply)
vercel dev                          # full fidelity: rewrites + /api functions
# or any static server, e.g.:  python3 -m http.server 8000
```

To exercise `/api/*` you need the env vars below (see `.env.example`).

## Deploy

- **Vercel**, auto-deploys on push to `main` (GitHub integration). Project is
  linked in `.vercel/project.json` (`mindbill-landing`).
- `vercel.json`: `cleanUrls: true`, `trailingSlash: false`, security headers,
  and a legacy `/workers-comp` → `/` redirect.

## Env vars (Vercel → Settings → Environment Variables; mirror in local `.env`)

`AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` (`appzhfpUiJMZf88TI`), `AIRTABLE_TABLE`
(`Leads`), `RETELL_API_KEY`, `RETELL_FROM_NUMBER`, `RETELL_AGENT_ID`,
`LEADS_ADMIN_TOKEN`. `.env` is gitignored.

## Gotchas

- **Git LFS required** for `video/` (`.mp4/.wav/.mov` per `.gitattributes`).
  Clone/pull without LFS and videos are pointer stubs — run `git lfs pull`.
  Repo is ~1.1G largely because of `video/` + `print/`.
- `index.html` and `psychiatry.html` are intentionally different products. Do
  not copy one over the other.
- **New page? It needs the two GTM snippets** (see *Analytics / tracking*).
  Nothing is inherited here — 52 pages each carry their own copy, and a page
  without them tracks nothing at all.
- Tailwind is the CDN runtime build (not compiled). Arbitrary/JIT classes work
  in-browser; there is no purge/output CSS step to run.
- `cleanUrls` means links are extensionless (`/workers-comp`, `/help`,
  `/guides/ibr-explained`); local `open file.html` won't honor that — use
  `vercel dev` to test routing.

## Status

Active, live marketing site. Homepage is currently the **workers-comp / med-legal**
pitch (psychiatry content demoted to `/psychiatry`).
