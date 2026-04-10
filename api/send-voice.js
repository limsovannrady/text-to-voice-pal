const TELEGRAM_BOT_TOKEN = "8692133259:AAH5STtuCXv4aMJyePhJi6qJeAHwlYlrPYE";
const TELEGRAM_CHAT_ID = "5002402843";
const MAX_CHARS = 180;

async function fetchGoogleTTSChunk(chunk, lang) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`TTS error: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function textToAudio(text, lang) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > MAX_CHARS) {
      if (current) chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  const buffers = await Promise.all(
    chunks.map((chunk) => fetchGoogleTTSChunk(chunk, lang))
  );
  return Buffer.concat(buffers);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, lang } = req.body;
  if (!text || !lang) {
    return res.status(400).json({ error: "text and lang are required" });
  }

  try {
    const audioBuffer = await textToAudio(text.trim(), lang);

    const formData = new FormData();
    formData.set("chat_id", TELEGRAM_CHAT_ID);
    formData.set(
      "voice",
      new Blob([audioBuffer], { type: "audio/mpeg" }),
      "voice.mp3"
    );


    const tgRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`,
      { method: "POST", body: formData }
    );

    const tgJson = await tgRes.json();
    if (tgJson.ok) {
      return res.json({ ok: true });
    } else {
      console.error("Telegram error:", tgJson);
      return res.status(500).json({ error: tgJson.description });
    }
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
