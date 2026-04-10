const AUTH_TOKEN = process.env.DROPMAIL_AUTH_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GQL = `https://dropmail.me/api/graphql/${AUTH_TOKEN}`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Dropmail HTTP error: ${res.status}`);
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
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    }
  );
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram error: ${json.description}`);
  return json;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId, seenIds = [] } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  try {
    const data = await gql(`
      query($id: ID!) {
        session(id: $id) {
          mails {
            id
            rawSize
            fromAddr
            toAddr
            downloadUrl
            text
            headerSubject
          }
        }
      }
    `, { id: sessionId });

    const mails = data.session?.mails || [];
    const newMails = mails.filter((m) => !seenIds.includes(m.id));

    for (const mail of newMails) {
      const subject = mail.headerSubject || "(គ្មានប្រធានបទ)";
      const from = mail.fromAddr || "unknown";
      const body = mail.text ? mail.text.slice(0, 3000) : "(គ្មានខ្លឹមសារ)";

      const message =
        `📧 <b>Email ថ្មីបានមក!</b>\n\n` +
        `👤 <b>ពី:</b> ${from}\n` +
        `📌 <b>ប្រធានបទ:</b> ${subject}\n\n` +
        `📝 <b>ខ្លឹមសារ:</b>\n${body}`;

      await sendToTelegram(message);
    }

    return res.json({
      mails,
      forwarded: newMails.length,
    });
  } catch (err) {
    console.error("check-emails error:", err);
    return res.status(500).json({ error: err.message });
  }
}
