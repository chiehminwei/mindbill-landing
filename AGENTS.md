# AGENTS.md — mindbill-landing

Marketing/landing site for **MindBill** (IncidentFox, Inc.), the CA workers-comp
med-legal billing product. This repo is **only the public marketing site** — the
actual app lives in the separate `mindbill` repo, deployed at app.mindbill.org.

- **Live:** https://mindbill.org  (`/` rewrites to `/workers-comp` — see vercel.json)
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

## Pages (root *.html)

- `workers-comp.html` — **the homepage** (`/` rewrites here). WC/med-legal pitch;
  embeds `/video/mindbill-explainer.mp4`. Anchors: `#features #compare #founder`.
- `index.html` / `psychiatry.html` — **identical** psychiatry/TMS/Spravato pitch
  (the older homepage, now served at `/psychiatry`).
- `case-study.html` — 9-month audit case study of a real psychiatric practice.
- `apa.html` — APA 2026 conference / booth landing page.

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
  and the `/` → `/workers-comp` rewrite.

## Env vars (Vercel → Settings → Environment Variables; mirror in local `.env`)

`AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` (`appzhfpUiJMZf88TI`), `AIRTABLE_TABLE`
(`Leads`), `RETELL_API_KEY`, `RETELL_FROM_NUMBER`, `RETELL_AGENT_ID`,
`LEADS_ADMIN_TOKEN`. `.env` is gitignored.

## Gotchas

- **Git LFS required** for `video/` (`.mp4/.wav/.mov` per `.gitattributes`).
  Clone/pull without LFS and videos are pointer stubs — run `git lfs pull`.
  Repo is ~1.1G largely because of `video/` + `print/`.
- Editing `index.html` and `psychiatry.html`? They're identical copies — keep
  them in sync (or dedupe).
- Tailwind is the CDN runtime build (not compiled). Arbitrary/JIT classes work
  in-browser; there is no purge/output CSS step to run.
- `cleanUrls` means links are extensionless (`/workers-comp`, `/help`,
  `/guides/ibr-explained`); local `open file.html` won't honor that — use
  `vercel dev` to test routing.

## Status

Active, live marketing site. Homepage is currently the **workers-comp / med-legal**
pitch (psychiatry content demoted to `/psychiatry`).
