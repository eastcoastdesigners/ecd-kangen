import express from "express";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(join(ROOT, "public")));

// Admin CRM dashboard (the page prompts for the admin key, then talks to the
// /api/leads endpoints below). Served explicitly so the clean /admin URL works.
app.get("/admin", (_req, res) => res.sendFile(join(ROOT, "public", "admin.html")));

/* ---------------------------------------------------------------
   SELF-HOSTED CRM  (plain JSON file — no third-party services,
   no GoHighLevel, no native build step. Dead simple & portable.)
   Store the file on a persistent disk so leads survive restarts.
----------------------------------------------------------------*/
const DATA_DIR = process.env.DATA_DIR || join(ROOT, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = join(DATA_DIR, "leads.json");

function readLeads() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return []; }
}
function writeLeads(arr) {
  fs.writeFileSync(DB_FILE, JSON.stringify(arr, null, 2));
}
let nextId = (() => {
  const ls = readLeads();
  return ls.reduce((m, l) => Math.max(m, l.id || 0), 0) + 1;
})();

// Simple admin gate for the CRM endpoints.
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.key;
  if (!process.env.ADMIN_KEY) return next(); // open in local dev if unset
  if (key === process.env.ADMIN_KEY) return next();
  return res.status(401).json({ error: "unauthorized" });
}

/* ---------------------------------------------------------------
   EMAIL NOTIFICATIONS  (self-hosted SMTP — no third-party CRM/ESP
   lock-in). Fires when a new lead arrives. Fully optional: if the
   SMTP_* vars are unset, this silently no-ops so the site still
   runs locally and on a fresh deploy without email configured.
----------------------------------------------------------------*/
const SMTP_HOST = process.env.SMTP_HOST;
const NOTIFY_TO = process.env.LEAD_NOTIFY_TO; // who gets the alert (the owner)
const mailEnabled = Boolean(SMTP_HOST && NOTIFY_TO);

let transporter = null;
if (mailEnabled) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    // secure=true for port 465 (implicit TLS); false uses STARTTLS on 587.
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
  transporter.verify(err => {
    if (err) console.error("[mail] SMTP connection failed — lead emails disabled until fixed:", err.message);
    else console.log("[mail] SMTP ready — new-lead notifications will go to", NOTIFY_TO);
  });
} else {
  console.log("[mail] SMTP not configured (set SMTP_HOST + LEAD_NOTIFY_TO) — new-lead emails are off.");
}

const ADMIN_URL = process.env.ADMIN_URL || ""; // e.g. https://ecdkangen.com/admin

// Fire-and-forget: never let an email problem break a lead submission.
function notifyNewLead(lead) {
  if (!transporter) return;
  const fields = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Interest", lead.intent],
    ["Type", lead.type],
    ["Location", lead.location],
    ["Machine", lead.machine],
    ["Booked", lead.day || lead.slot ? `${lead.day} ${lead.slot}`.trim() : ""],
    ["Notes", lead.notes]
  ].filter(([, v]) => v);

  const textBody = fields.map(([k, v]) => `${k}: ${v}`).join("\n")
    + `\n\nReceived: ${lead.created}`
    + (ADMIN_URL ? `\n\nOpen the CRM: ${ADMIN_URL}` : "");

  const esc = s => String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const htmlBody = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px">
    <h2 style="color:#0e7c86;margin:0 0 4px">New ECD Kangen lead</h2>
    <p style="color:#5a6b73;margin:0 0 16px">A new submission just came in from the website.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      ${fields.map(([k, v]) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#5a6b73;white-space:nowrap">${k}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600">${esc(v)}</td>
      </tr>`).join("")}
    </table>
    <p style="color:#9aa7ad;font-size:12px;margin:14px 0 0">Received ${esc(lead.created)}</p>
    ${ADMIN_URL ? `<p style="margin:18px 0 0"><a href="${esc(ADMIN_URL)}" style="background:#0e7c86;color:#fff;padding:10px 18px;border-radius:100px;text-decoration:none;font-weight:600;font-size:14px">Open the CRM</a></p>` : ""}
  </div>`;

  const label = lead.intent === "sample" ? "free water"
    : lead.intent === "consult" ? "consult/pricing"
    : lead.intent || "lead";

  transporter.sendMail({
    from: process.env.LEAD_NOTIFY_FROM || NOTIFY_TO,
    to: NOTIFY_TO,
    replyTo: lead.email || undefined,
    subject: `New lead: ${lead.name || "Website visitor"} — ${label}`,
    text: textBody,
    html: htmlBody
  }).catch(err => console.error("[mail] failed to send lead notification:", err.message));
}

// Create a lead (public — the website forms post here)
app.post("/api/leads", (req, res) => {
  const b = req.body || {};
  const lead = {
    id: nextId++,
    created: new Date().toISOString(),
    type: b.type || "lead",
    intent: b.intent || "info",
    name: b.name || "",
    email: b.email || "",
    phone: b.phone || "",
    location: b.location || "",
    machine: b.machine || "",
    day: b.day || "",
    slot: b.slot || "",
    notes: b.notes || "",
    status: "new"
  };
  const ls = readLeads();
  ls.push(lead);
  writeLeads(ls);
  notifyNewLead(lead); // email the owner (no-op if SMTP unconfigured; never blocks the response)
  res.json({ ok: true, id: lead.id });
});

// List leads (admin), newest first
app.get("/api/leads", requireAdmin, (_req, res) => {
  const ls = readLeads().sort((a, b) => new Date(b.created) - new Date(a.created));
  res.json(ls);
});

// Update lead status (admin)
app.patch("/api/leads/:id", requireAdmin, (req, res) => {
  const ls = readLeads();
  const l = ls.find(x => x.id === Number(req.params.id));
  if (l) { l.status = req.body.status || "new"; writeLeads(ls); }
  res.json({ ok: true });
});

// Delete a lead (admin)
app.delete("/api/leads/:id", requireAdmin, (req, res) => {
  writeLeads(readLeads().filter(x => x.id !== Number(req.params.id)));
  res.json({ ok: true });
});

// CSV export (admin)
app.get("/api/leads.csv", requireAdmin, (_req, res) => {
  const rows = readLeads().sort((a, b) => new Date(b.created) - new Date(a.created));
  const cols = ["created","name","email","phone","intent","type","location","machine","day","slot","status","notes"];
  const esc = v => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
  const csv = [cols.join(",")].concat(rows.map(r => cols.map(c => esc(r[c])).join(","))).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=ecd_leads.csv");
  res.send(csv);
});

/* ---------------------------------------------------------------
   CLAUDE API PROXY  — keeps your API key server-side (never in browser)
----------------------------------------------------------------*/
const SYSTEM_PROMPT = `You are Jackie, the warm, upbeat AI assistant for ECD Kangen, an authorized independent Enagic Kangen Water distributor operated by East Coast Designers. You're like a smart, friendly guide who happens to know Kangen Water inside out.

YOUR JOB: warmly help visitors understand the machines, encourage them to try the water free or book a free 30-minute consultation, and capture interest. Keep replies short (2-4 sentences), conversational, and use contractions — sound like a helpful person, not a brochure.

WHAT YOU KNOW:
- Machines: Leveluk K8 (8-plate flagship), SD501DX (7-plate gold standard, best seller), SD501U (under-counter), JRIV (4-plate starter), Super 501 (heavy duty), Anespa DX (shower/bath system).
- Certifications (TRUE, you may state these): Enagic ionizers are certified as MEDICAL DEVICES by Japan's Ministry of Health, Labour and Welfare; manufacturing is ISO 13485 (the medical-device quality standard) and ISO 9001 certified; WQA Gold Seal; and the machines are used in hundreds of hospitals in Japan. You may say it is the only water ionizer / alkaline machine certified as a medical device in Japan. Always clarify this is a JAPANESE certification (not a US FDA medical-device clearance) if pressed.
- Payment: credit/debit cards accepted, in-house financing available, pay in full or deposit plus installments. For exact current pricing, encourage a free consult.
- Free ways to start: free info pack (anyone), free gallons of water to test (if local), free 30-min consultation.
- Every machine purchase also lets the buyer become an Enagic distributor if they choose.

CRITICAL RULES:
- NEVER make medical or health claims. Do NOT say the water or machine treats, cures, prevents, relieves, or helps any disease, condition, or symptom. The Japanese medical-device CERTIFICATION is a fact about the device's regulatory classification — it is NOT a claim that it heals anything. Keep that distinction crisp.
- If asked about health benefits, focus on hydration, taste, and water quality, and suggest they talk to their doctor for any health concern.
- Don't quote specific prices; guide to a free consult for current pricing and plans.
- Be honest and low-pressure. Nudge toward booking a consult, free info, or free water.`;

app.post("/api/chat", async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "missing_api_key" });
  }
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: req.body.messages || []
      })
    });
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join(" ").trim();
    res.json({ reply: text || "I'd love to help — the quickest way is to book a free consult or grab the free info pack above." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "chat_failed" });
  }
});

/* ---------------------------------------------------------------
   JACKIE VOICE  — live spoken assistant via OpenAI's Realtime API.
   The browser does WebRTC directly with OpenAI using a short-lived
   ephemeral key minted here, so the real OPENAI_API_KEY never leaves
   the server. Voice is OPTIONAL: with no OpenAI key, /api/realtime/
   session returns 503 and the widget stays text-only on Claude.

   IMPORTANT: these spoken instructions carry the SAME compliance
   HARD RULES as the text assistant (no health claims, no prices) —
   voice must never say something the text chat couldn't.
----------------------------------------------------------------*/
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "shimmer";

const JACKIE_VOICE_INSTRUCTIONS = `You are Jackie, a warm, upbeat assistant for ECD Kangen (an authorized independent Enagic Kangen Water distributor by East Coast Designers), having a live VOICE conversation with a website visitor.

HOW YOU SPEAK: Naturally, like a friendly person on a phone call. Use contractions. Keep answers to 1-3 short sentences. If something needs more detail, give the headline first and ask if they'd like you to go deeper. Never read lists or markdown aloud — just talk.

WHAT YOU KNOW:
- Machines: Leveluk K8 (8-plate flagship), SD501DX (7-plate gold standard, best seller), SD501U (under-counter), JRIV (4-plate starter), Super 501 (heavy duty), Anespa DX (shower/bath system).
- Certifications (TRUE — you may say these): Enagic ionizers are certified as MEDICAL DEVICES by Japan's Ministry of Health, Labour and Welfare; manufacturing is ISO 13485 and ISO 9001 certified; WQA Gold Seal; used in hundreds of hospitals in Japan. If pressed, clarify this is a JAPANESE certification, not a US FDA clearance.
- Payment: credit/debit accepted, in-house financing, pay in full or deposit plus installments. For exact pricing, point them to a free consult.
- Free ways to start: free info pack (anyone), free gallons of water to test (if local), free 30-minute consultation.
- Buying a machine also lets them become an Enagic distributor if they want.

CRITICAL RULES (never break these, even out loud):
- NEVER make medical or health claims. Do NOT say the water or machine treats, cures, prevents, relieves, or helps any disease, condition, or symptom. The Japanese medical-device CERTIFICATION is about the device's regulatory classification — it is NOT a claim that it heals anything.
- If asked about health benefits, talk about hydration, taste, and water quality, and suggest they ask their doctor for any health concern.
- Don't quote specific prices; guide them to a free consult.
- Be honest and low-pressure. Gently nudge toward booking a consult, grabbing the free info pack, or trying free water.`;

// Return a real OpenAI key usable for the Realtime API, or null.
function getRealtimeOpenAIKey() {
  const key = (process.env.OPENAI_API_KEY || "").trim();
  // An OpenRouter key (sk-or-...) cannot open a realtime session.
  if (key && !key.startsWith("sk-or-")) return key;
  return null;
}

// Mint a short-lived OpenAI Realtime client secret for the browser.
app.post("/api/realtime/session", async (req, res) => {
  const apiKey = getRealtimeOpenAIKey();
  if (!apiKey) {
    return res.status(503).json({
      error: "Voice isn't set up yet. Add an OPENAI_API_KEY on the server to enable Jackie's voice — text chat still works."
    });
  }
  try {
    // GA Realtime API: ephemeral keys come from /v1/realtime/client_secrets
    // (the Beta /v1/realtime/sessions endpoint was retired). Audio config
    // (voice, transcription, turn detection) lives under "audio".
    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: JACKIE_VOICE_INSTRUCTIONS,
          audio: {
            input: {
              transcription: { model: "whisper-1" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500
              }
            },
            output: { voice: REALTIME_VOICE }
          }
        }
      })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("[voice] realtime session failed:", JSON.stringify(data).slice(0, 300));
      return res.status(502).json({
        error: "Couldn't start the voice session. Check that the OpenAI key has Realtime API access.",
        detail: (data.error && data.error.message) || ""
      });
    }
    // GA returns the secret at top-level "value"; tolerate the older nested shape.
    const secret = data.value || (data.client_secret && data.client_secret.value);
    if (!secret) {
      console.error("[voice] no client secret in response:", JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: "Voice service returned no session token." });
    }
    res.json({ client_secret: secret, expires_at: data.expires_at, model: REALTIME_MODEL });
  } catch (e) {
    console.error("[voice]", e);
    res.status(502).json({ error: "Couldn't reach the voice service. Please try again." });
  }
});

app.get("/healthz", (_req, res) => res.send("ok"));

app.listen(PORT, () => console.log(`ECD Kangen running on :${PORT}`));
