# ECD Kangen

Website + self-hosted lead CRM + AI assistant for **ECD Kangen**, an authorized
independent Enagic Kangen Water® distributor by **East Coast Designers**.

- Full Enagic machine lineup (no prices — drives to a free consult)
- "Certified medical device in Japan" positioning, done accurately & compliantly
- Three free entry points: info pack, local water samples, 30-min consult booking
- **Self-hosted SQLite CRM** (no GoHighLevel, no third-party services)
- On-site AI chat assistant powered by Claude (key stays server-side)

---

## 1. Run it on your computer

You need [Node.js 20+](https://nodejs.org).

```bash
cp .env.example .env
# open .env and fill in ANTHROPIC_API_KEY and ADMIN_KEY
npm install
npm start
```

Visit http://localhost:3000. The CRM button is bottom-left (it'll ask for your
ADMIN_KEY the first time).

---

## 2. Put it on GitHub

```bash
git init
git add .
git commit -m "Initial ECD Kangen site"
git branch -M main
git remote add origin https://github.com/<your-username>/ecd-kangen.git
git push -u origin main
```

(Create the empty `ecd-kangen` repo on GitHub first.) The `.gitignore` already
keeps your `.env`, `node_modules`, and the database out of the repo.

---

## 3. Deploy on Railway

1. Go to railway.app → **New Project → Deploy from GitHub repo** → pick `ecd-kangen`.
2. Railway auto-detects Node and runs `npm start`.
3. In the service **Variables**, add:
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `ADMIN_KEY` — a long random secret (for CRM access)
   - `CLAUDE_MODEL` — `claude-sonnet-4-20250514`
   - `DATA_DIR` — `/data`
4. Add a **Volume** (Storage) mounted at `/data` so leads persist across deploys.
5. Open the generated URL. Done.

Later, add your custom domain in Railway's settings.

---

## Compliance (read this)

This site is built to stay on the right side of the rules:
- We say the machine is **certified as a medical device by Japan's Ministry of
  Health** (true, and a real differentiator) — but always framed as a Japanese
  device/manufacturing certification, **not** a US FDA clearance and **not** a
  claim that the water heals anything.
- **No medical/health claims** anywhere. This protects your Enagic distributor
  status and avoids FTC/FDA issues.
- **No prices** on the public site — current pricing is given on the free consult.

See `CLAUDE.md` for the full rule set Claude Code follows.
