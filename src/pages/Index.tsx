import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Play, Square, Volume2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TELEGRAM_BOT_TOKEN = "8692133259:AAH5STtuCXv4aMJyePhJi6qJeAHwlYlrPYE";
const TELEGRAM_CHAT_ID = "5002402843";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "km", label: "ខ្មែរ (Khmer)" },
  { code: "fr", label: "Français" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" },
  { code: "th", label: "ไทย" },
];

const Index = () => {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [lang, setLang] = useState("en");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [rate, setRate] = useState([1]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      setVoices(v);
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const filteredVoices = voices.filter((v) => v.lang.startsWith(lang));

  const handlePlay = () => {
    if (!text.trim()) return;
    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = rate[0];

    const voice = filteredVoices.find((v) => v.name === selectedVoice);
    if (voice) utter.voice = voice;
    else if (filteredVoices.length > 0) utter.voice = filteredVoices[0];

    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);

    utterRef.current = utter;
    setIsSpeaking(true);
    speechSynthesis.speak(utter);
  };

  const handleStop = () => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const fetchAudioChunk = async (chunk: string): Promise<ArrayBuffer> => {
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob&ttsspeed=${rate[0]}`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(ttsUrl)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error("TTS fetch failed");
    return res.arrayBuffer();
  };

  const handleSendToTelegram = async () => {
    if (!text.trim()) return;
    setIsSending(true);
    try {
      // Google TTS limit ~200 chars per request — split into chunks
      const MAX = 180;
      const words = text.trim().split(" ");
      const chunks: string[] = [];
      let current = "";
      for (const word of words) {
        if ((current + " " + word).trim().length > MAX) {
          if (current) chunks.push(current.trim());
          current = word;
        } else {
          current = (current + " " + word).trim();
        }
      }
      if (current) chunks.push(current.trim());

      // Fetch all chunks and merge ArrayBuffers
      const buffers = await Promise.all(chunks.map(fetchAudioChunk));
      const totalLength = buffers.reduce((sum, b) => sum + b.byteLength, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of buffers) {
        merged.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }

      const audioBlob = new Blob([merged], { type: "audio/mpeg" });

      const formData = new FormData();
      formData.append("chat_id", TELEGRAM_CHAT_ID);
      formData.append("voice", audioBlob, "voice.mp3");
      formData.append("caption", `🔊 ${text.slice(0, 100)}${text.length > 100 ? "…" : ""}`);

      const res = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`,
        { method: "POST", body: formData }
      );

      if (res.ok) {
        toast({ title: "បានផ្ញើសំឡេងទៅ Telegram រួចរាល់! 🎙️" });
      } else {
        const err = await res.json();
        console.error("Telegram error:", err);
        toast({ title: "ផ្ញើបានបរាជ័យ", variant: "destructive" });
      }
    } catch (e) {
      console.error(e);
      toast({ title: "ផ្ញើបានបរាជ័យ", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
            <Volume2 className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Text to Speech
          </h1>
          <p className="text-muted-foreground text-sm">
            បម្លែងអត្ថបទទៅជាសម្លេង · Convert text to voice
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-5">
          {/* Text input */}
          <Textarea
            placeholder="សរសេរអត្ថបទនៅទីនេះ... / Type your text here..."
            className="min-h-[140px] resize-none text-base"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          {/* Language */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                ភាសា / Language
              </label>
              <Select value={lang} onValueChange={(v) => { setLang(v); setSelectedVoice(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Voice */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                សម្លេង / Voice
              </label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger>
                  <SelectValue placeholder={filteredVoices.length ? "Select voice" : "No voices"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredVoices.map((v) => (
                    <SelectItem key={v.name} value={v.name}>
                      {v.name.length > 28 ? v.name.slice(0, 28) + "…" : v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Speed */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ល្បឿន / Speed: {rate[0].toFixed(1)}x
            </label>
            <Slider min={0.5} max={2} step={0.1} value={rate} onValueChange={setRate} />
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <Button
              className="flex-1 h-12 text-base gap-2"
              onClick={isSpeaking ? handleStop : handlePlay}
              disabled={!text.trim()}
            >
              {isSpeaking ? (
                <>
                  <Square className="w-4 h-4" /> Stop
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Play
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="h-12 px-5 gap-2"
              onClick={handleSendToTelegram}
              disabled={!text.trim() || isSending}
              data-testid="button-send-telegram"
            >
              <Send className="w-4 h-4" />
              {isSending ? "កំពុងផ្ញើ..." : "Telegram"}
            </Button>
          </div>
        </div>


      </div>
    </div>
  );
};

export default Index;
