const AUTH_TOKEN = process.env.DROPMAIL_AUTH_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GQL = `https://dropmail.me/api/graphql/${AUTH_TOKEN}`;

// Module-level state — persists across warm Vercel invocations
let sessionId = null;
let sessionAddress = null;
let sessionExpiresAt = null;
const seenMailIds = new Set();

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Dropmail HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

async function sendToTelegram(text) {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
    }
  );
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram: ${json.description}`);
}

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
  sessionId = s.id;
  sessionAddress = s.addresses[0]?.address || null;
  sessionExpiresAt = s.expiresAt;
  seenMailIds.clear();
  await sendToTelegram(
    `📬 <b>Email Monitor ចាប់ផ្តើម!</b>\n\n` +
    `📧 <b>Email address:</b> <code>${sessionAddress}</code>\n\n` +
    `✅ Email ណាមួយផ្ញើទៅ address នេះ នឹងបញ្ជូនទៅ Telegram ដោយស្វ័យប្រវត្តិ!`
  );
  console.log(`[Cron] New session: ${sessionAddress}`);
}

async function pollEmails() {
  const data = await gql(`
    query($id: ID!) {
      session(id: $id) {
        mails {
          id
          fromAddr
          headerSubject
          text
          rawSize
        }
      }
    }
  `, { id: sessionId });

  const mails = data.session?.mails || [];
  const newMails = mails.filter((m) => !seenMailIds.has(m.id));

  for (const mail of newMails) {
    seenMailIds.add(mail.id);
    const subject = mail.headerSubject || "(គ្មានប្រធានបទ)";
    const from = mail.fromAddr || "unknown";
    const body = mail.text ? mail.text.slice(0, 3500) : "(គ្មានខ្លឹមសារ)";
    await sendToTelegram(
      `📧 <b>Email ថ្មីបានមក!</b>\n\n` +
      `👤 <b>ពី:</b> ${from}\n` +
      `📌 <b>ប្រធានបទ:</b> ${subject}\n\n` +
      `📝 <b>ខ្លឹមសារ:</b>\n${body}`
    );
    console.log(`[Cron] Forwarded email from ${from}`);
  }

  return { total: mails.length, forwarded: newMails.length };
}

export default async function handler(req, res) {
  try {
    const expired = sessionExpiresAt && new Date(sessionExpiresAt).getTime() < Date.now();
    if (!sessionId || expired) {
      await createSession();
    }
    const result = await pollEmails();
    return res.json({ ok: true, address: sessionAddress, ...result });
  } catch (err) {
    console.error("[Cron] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
