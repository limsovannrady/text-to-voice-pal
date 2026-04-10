import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DROPMAIL_AUTH_TOKEN = process.env.DROPMAIL_AUTH_TOKEN;
const GQL_URL = `https://dropmail.me/api/graphql/${DROPMAIL_AUTH_TOKEN}`;
const POLL_INTERVAL_MS = 3000;

// ---- In-memory state ----
let currentSession = null;   // { id, address, expiresAt }
let seenMailIds = new Set();

// ---- Dropmail GraphQL helper ----
async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Dropmail HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

// ---- Create new session ----
async function createSession() {
  const data = await gql(`
    mutation {
      introduceSession {
        id
        expiresAt
        addresses { address }
      }
    }
  `);
  const s = data.introduceSession;
  currentSession = {
    id: s.id,
    address: s.addresses[0]?.address || null,
    expiresAt: s.expiresAt,
  };
  seenMailIds = new Set();
  console.log(`[Dropmail] Session created: ${currentSession.address}`);
  await sendToTelegram(
    `📬 <b>Email Monitor បានចាប់ផ្តើម!</b>\n\n` +
    `📧 <b>Email address:</b> <code>${currentSession.address}</code>\n\n` +
    `✅ Email ណាមួយដែលផ្ញើទៅ address នេះ នឹងត្រូវបានបញ្ជូនទៅ Telegram ដោយស្វ័យប្រវត្តិ!`
  );
}

// ---- Fetch emails from session ----
async function fetchMails(sessionId) {
  const data = await gql(`
    query($id: ID!) {
      session(id: $id) {
        mails {
          id
          rawSize
          fromAddr
          toAddr
          headerSubject
          text
        }
      }
    }
  `, { id: sessionId });
  return data.session?.mails || [];
}

// ---- Send message to Telegram ----
async function sendToTelegram(text) {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    }
  );
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram: ${json.description}`);
}

// ---- Background polling loop ----
async function pollLoop() {
  try {
    if (!currentSession) {
      await createSession();
    } else {
      // Check if session is expired
      const expiry = new Date(currentSession.expiresAt).getTime();
      if (expiry < Date.now()) {
        console.log("[Dropmail] Session expired, creating new one...");
        await createSession();
      }
    }

    const mails = await fetchMails(currentSession.id);
    const newMails = mails.filter((m) => !seenMailIds.has(m.id));

    for (const mail of newMails) {
      seenMailIds.add(mail.id);
      const subject = mail.headerSubject || "(គ្មានប្រធានបទ)";
      const from = mail.fromAddr || "unknown";
      const body = mail.text ? mail.text.slice(0, 3500) : "(គ្មានខ្លឹមសារ)";

      const message =
        `📧 <b>Email ថ្មីបានមក!</b>\n\n` +
        `👤 <b>ពី:</b> ${from}\n` +
        `📌 <b>ប្រធានបទ:</b> ${subject}\n\n` +
        `📝 <b>ខ្លឹមសារ:</b>\n${body}`;

      await sendToTelegram(message);
      console.log(`[Dropmail] Forwarded email from ${from} → Telegram`);
    }
  } catch (err) {
    console.error("[Dropmail] Poll error:", err.message);
  }

  setTimeout(pollLoop, POLL_INTERVAL_MS);
}

// ---- Express API (mirrors Vercel api/ functions) ----
const app = express();
app.use(cors());
app.use(express.json());

// POST /api/email-session → create new session
// GET  /api/email-session → get current session info
app.route("/api/email-session")
  .post(async (req, res) => {
    try {
      await createSession();
      res.json(currentSession);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  })
  .get((req, res) => {
    if (!currentSession) return res.status(503).json({ error: "Session not ready" });
    res.json(currentSession);
  });

// GET /api/emails → return current mails for display (server handles forwarding)
app.get("/api/emails", async (req, res) => {
  if (!currentSession) return res.status(503).json({ error: "No active session" });
  try {
    const mails = await fetchMails(currentSession.id);
    res.json({ mails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static frontend in production
const distPath = join(__dirname, "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(join(distPath, "index.html"));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  pollLoop();
});
