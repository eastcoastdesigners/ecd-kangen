# CLAUDE.md — ECD Kangen

Context for Claude Code working in this repo.

## What this is
A website + lead system for **ECD Kangen**, an authorized independent Enagic
Kangen Water distributor operated by **East Coast Designers (ECD)**. The owner
sells Enagic machines and recruits distributors. The site must out-rank and
out-convert competitor distributor sites.

## Stack (intentionally simple, fully self-hosted)
- **Node 20 + Express** (`src/server.js`) — one small server.
- **better-sqlite3** — the CRM database. **No third-party CRM. Never integrate
  GoHighLevel** — the owner is building this to *replace* GoHighLevel-style tools.
- **Static frontend** in `public/index.html` (single file: HTML/CSS/JS).
- **Claude API** powers the on-site chat assistant (**Jackie**, text mode),
  proxied through `/api/chat` so the API key stays server-side.
- **OpenAI Realtime API** powers Jackie's optional **live voice** mode. The
  browser does WebRTC directly with OpenAI using a short-lived ephemeral key
  minted by `/api/realtime/session` (the real `OPENAI_API_KEY` never leaves the
  server). Voice is optional — with no OpenAI key, the mic shows a friendly
  "not set up" message and text chat still works. The spoken instructions carry
  the SAME compliance HARD RULES as the text prompt.

## Run locally
```
cp .env.example .env   # fill in ANTHROPIC_API_KEY and ADMIN_KEY
npm install
npm start              # http://localhost:3000
```

## Endpoints
- `POST /api/leads` — public; website forms submit here. Emails the owner on
  each new lead if SMTP is configured (see below).
- `GET  /api/leads` — admin; needs `?key=ADMIN_KEY`.
- `PATCH/DELETE /api/leads/:id` — admin (PATCH sets `status`: new/contacted/won/lost).
- `GET  /api/leads.csv` — admin CSV export.
- `POST /api/chat` — Claude proxy for Jackie's text chat.
- `POST /api/realtime/session` — mints a short-lived OpenAI Realtime token for
  Jackie's live voice (503 if `OPENAI_API_KEY` unset).
- `GET  /admin` — full CRM dashboard page (`public/admin.html`); prompts for the
  admin key, then uses the `/api/leads` endpoints above.
- `GET  /healthz` — health check.

## Email notifications (self-hosted SMTP)
A new lead triggers an email to the owner via `nodemailer`. It's **optional and
fully self-hosted** — no third-party CRM/ESP. Configure with `SMTP_HOST`,
`SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `LEAD_NOTIFY_TO`,
`LEAD_NOTIFY_FROM`, and `ADMIN_URL` (see `.env.example`). If `SMTP_HOST` or
`LEAD_NOTIFY_TO` is unset it silently no-ops; sending is fire-and-forget so an
email failure never blocks a lead submission.

## Deployment
GitHub -> Railway. `railway.toml` is set up. Add a Railway **Volume** mounted at
`/data` and set `DATA_DIR=/data` so the leads database survives redeploys. Set
`ANTHROPIC_API_KEY`, `ADMIN_KEY`, and `CLAUDE_MODEL` as Railway variables. For
Jackie's voice, also set `OPENAI_API_KEY` (optional; voice stays off without it).

## HARD RULES — compliance (do not violate)
1. **No health/medical claims.** Never state or imply the water/machine treats,
   cures, prevents, relieves, or helps any disease, condition, or symptom.
   This protects the owner's distributor status and avoids FTC/FDA trouble.
2. **The "medical device" line is ALLOWED but must stay accurate:** Enagic
   ionizers are *certified as medical devices by Japan's Ministry of Health* and
   built to ISO 13485. Always frame it as a Japanese regulatory/manufacturing
   certification — NOT a US FDA clearance and NOT a health claim.
3. **No specific prices on the public site.** Drive to a free consult for current
   pricing. Always surface: credit/debit accepted, in-house financing, pay in
   full / deposit + installments.
4. Keep the three free entry points prominent: free info pack, free local water
   samples, free 30-minute consultation (with booking).

## Trademarks
Kangen Water®, Enagic®, Leveluk® belong to Enagic Co., Ltd. Keep the footer
disclaimer intact on every page.

## Good next tasks
- ✅ Done: email notification on new leads (self-hosted SMTP via nodemailer).
- ✅ Done: proper admin dashboard page at `/admin` (replaces the old modal).
- Add SMS notification on new leads (self-hosted gateway / SMTP-to-SMS).
- Add location landing pages for SEO (e.g. /kangen-water-connecticut).
- Real calendar integration for consults.
