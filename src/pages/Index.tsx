import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, Mail, CheckCircle, Inbox, Wifi } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const POLL_MS = 3000;
const SESSION_KEY = "dm_session";
const SEEN_KEY = "dm_seen";

interface MailItem {
  id: string;
  fromAddr: string;
  toAddr: string;
  headerSubject: string;
  text: string;
  rawSize: number;
}

interface Session {
  id: string;
  address: string;
  expiresAt: string;
}

const Index = () => {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [mails, setMails] = useState<MailItem[]>([]);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [selectedMail, setSelectedMail] = useState<MailItem | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Helpers ----
  const saveSession = (s: Session) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  };

  const loadSession = (): Session | null => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s: Session = JSON.parse(raw);
      if (new Date(s.expiresAt).getTime() < Date.now()) return null;
      return s;
    } catch { return null; }
  };

  const loadSeenIds = (): string[] => {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
  };

  const saveSeenIds = (ids: string[]) => {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  };

  // ---- Create new session ----
  const createSession = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email-session", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSession(data);
      setMails([]);
      setSeenIds([]);
      saveSession(data);
      saveSeenIds([]);
      setSelectedMail(null);
      toast({ title: "📧 Email address ថ្មីបានបង្កើតរួចហើយ!" });
    } catch (err: any) {
      toast({ title: `បរាជ័យ: ${err.message}`, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ---- Poll for new emails ----
  const pollEmails = useCallback(async (sess: Session, seen: string[], showLoader = false) => {
    if (showLoader) setChecking(true);
    try {
      const res = await fetch("/api/check-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sess.id, seenIds: seen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      if (data.mails) {
        setMails(data.mails);
        if (data.forwarded > 0) {
          const newIds = data.mails
            .filter((m: MailItem) => !seen.includes(m.id))
            .map((m: MailItem) => m.id);
          const merged = [...seen, ...newIds];
          setSeenIds(merged);
          saveSeenIds(merged);
          toast({ title: `📨 Email ថ្មី ${data.forwarded} បានបញ្ជូនទៅ Telegram!` });
        }
      }
    } catch (err: any) {
      console.error("poll error:", err.message);
    } finally {
      if (showLoader) setChecking(false);
    }
  }, [toast]);

  // ---- Start polling loop ----
  const startPolling = useCallback((sess: Session, seen: string[]) => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollEmails(sess, seen);
    pollTimer.current = setInterval(() => {
      setSeenIds((currentSeen) => {
        pollEmails(sess, currentSeen);
        return currentSeen;
      });
    }, POLL_MS);
  }, [pollEmails]);

  // ---- On mount: restore or create session ----
  useEffect(() => {
    const saved = loadSession();
    const seen = loadSeenIds();
    if (saved) {
      setSession(saved);
      setSeenIds(seen);
      startPolling(saved, seen);
    } else {
      createSession();
    }
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, []);

  // Restart polling when session changes
  useEffect(() => {
    if (!session) return;
    startPolling(session, seenIds);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [session?.id]);

  const copyEmail = () => {
    if (!session?.address) return;
    navigator.clipboard.writeText(session.address);
    toast({ title: "✅ Email address បានចម្លងរួចហើយ!" });
  };

  const handleNewSession = () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SEEN_KEY);
    createSession();
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Header */}
        <div className="text-center pt-8 pb-2 space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Email → Telegram
          </h1>
          <p className="text-muted-foreground text-sm">
            Email ចូលមក → បញ្ជូនទៅ Telegram ដោយស្វ័យប្រវត្តិ
          </p>
          <div className="inline-flex items-center gap-1.5 text-xs text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400 px-3 py-1 rounded-full">
            <Wifi className="w-3 h-3" />
            Forward ភ្លាមៗ
          </div>
        </div>

        {/* Email Address Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              អាសយដ្ឋាន Email
            </span>
            {checking && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" />
                កំពុងពិនិត្យ...
              </span>
            )}
          </div>

          {session ? (
            <div className="flex items-center gap-2">
              <div
                className="flex-1 bg-muted rounded-xl px-4 py-3 font-mono text-sm text-foreground break-all select-all"
                data-testid="text-email-address"
              >
                {session.address}
              </div>
              <Button
                size="icon"
                variant="outline"
                className="shrink-0 h-11 w-11 rounded-xl"
                onClick={copyEmail}
                data-testid="button-copy-email"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="h-12 bg-muted animate-pulse rounded-xl" />
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => session && pollEmails(session, seenIds, true)}
              disabled={!session || checking}
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
              ពិនិត្យឥឡូវ
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleNewSession}
              disabled={loading}
              data-testid="button-new-email"
            >
              <Mail className="w-3.5 h-3.5" />
              Email ថ្មី
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            🤖 ពិនិត្យរៀងរាល់ 3 វិនាទី · Email ចូលមក → Telegram ភ្លាមៗ
          </p>
        </div>

        {/* Email List */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              Email ទទួលបាន
            </span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {mails.length}
            </span>
          </div>

          {mails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-4">
              <Inbox className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                នៅមិនទាន់មាន Email ណាមួយឡើយ
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                ផ្ញើ Email ទៅ address ខាងលើ ដើម្បីសាកល្បង
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {mails.map((mail) => (
                <div
                  key={mail.id}
                  className="px-5 py-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() =>
                    setSelectedMail(selectedMail?.id === mail.id ? null : mail)
                  }
                  data-testid={`card-mail-${mail.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <p className="text-sm font-medium text-foreground truncate">
                          {mail.headerSubject || "(គ្មានប្រធានបទ)"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        ពី: {mail.fromAddr}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(mail.rawSize / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  {selectedMail?.id === mail.id && (
                    <div className="mt-3 p-3 bg-muted rounded-xl text-xs text-foreground whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                      {mail.text || "(គ្មានខ្លឹមសារ)"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Index;
