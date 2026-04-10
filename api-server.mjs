import express from "express";
import cors from "cors";
import { createRequire } from "module";
import { PassThrough } from "stream";

const require = createRequire(import.meta.url);
const gtts = require("node-gtts");

const TELEGRAM_BOT_TOKEN = "8692133259:AAH5STtuCXv4aMJyePhJi6qJeAHwlYlrPYE";
const TELEGRAM_CHAT_ID = "5002402843";

// Languages supported by node-gtts
const GTTS_LANGS = new Set([
  "af","sq","ar","hy","ca","zh","zh-cn","zh-tw","zh-yue","hr","cs","da","nl",
  "en","en-au","en-uk","en-us","eo","fi","fr","de","el","ht","hi","hu","is",
  "id","it","ja","ko","la","lv","mk","no","pl","pt","pt-br","ro","ru","sr",
  "sk","es","es-es","es-us","sw","sv","ta","th","tr","vi","cy"
]);

// Fetch audio directly from Google TTS (no CORS issue from server side)
async function fetchGoogleTTS(text, lang) {
  const MAX = 180;
  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > MAX) {
      if (current) chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  const buffers = await Promise.all(
    chunks.map(async (chunk) => {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (!res.ok) throw new Error(`Google TTS error: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    })
  );

  return Buffer.concat(buffers);
}

// Fetch audio using node-gtts
function fetchGtts(text, lang) {
  return new Promise((resolve, reject) => {
    const tts = gtts(lang);
    const chunks = [];
    const stream = new PassThrough();
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    tts.stream(text, stream);
  });
}

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/send-voice", async (req, res) => {
  const { text, lang } = req.body;
  if (!text || !lang) {
    return res.status(400).json({ error: "text and lang are required" });
  }

  try {
    let audioBuffer;
    if (GTTS_LANGS.has(lang)) {
      audioBuffer = await fetchGtts(text, lang);
    } else {
      // Fallback to direct Google TTS HTTP (works server-side for km, etc.)
      audioBuffer = await fetchGoogleTTS(text, lang);
    }

    const formData = new FormData();
    formData.set("chat_id", TELEGRAM_CHAT_ID);
    formData.set(
      "voice",
      new Blob([audioBuffer], { type: "audio/mpeg" }),
      "voice.mp3"
    );
    formData.set(
      "caption",
      `🔊 ${text.slice(0, 100)}${text.length > 100 ? "…" : ""}`
    );

    const tgRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`,
      { method: "POST", body: formData }
    );

    const tgJson = await tgRes.json();
    if (tgJson.ok) {
      res.json({ ok: true });
    } else {
      console.error("Telegram error:", tgJson);
      res.status(500).json({ error: tgJson.description });
    }
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("API server running on port 3001");
});
