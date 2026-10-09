import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import {
  startVoiceCheckin,
  pollVoiceCheckin,
  normalisePhone,
  failureCopy,
  isTelephonyGrade,
  toSevenMetrics,
  VoiceCheckinError,
  type CheckinMode,
  type CheckinStatus,
  type VoiceCheckinSession,
} from "@/lib/voice-checkin-client";

/**
 * The phone check-in. Serasona reaches out instead of waiting to be opened.
 *
 * Gated on Plus, because that is what Plus is sold as: "Serasona calls you
 * weekly, no app required." Core and Free get the in-app recorder at /checkin,
 * which is the better capture anyway — this one is about reach.
 *
 * Two deliveries behind one page:
 *   "Text me a link"  the browser records at full quality, they just do not
 *                     have to be in the app when we decide to ask
 *   "Call me"         an actual phone call, works on a landline, lower audio
 *                     fidelity (see the note on the button)
 */

const PHONE_KEY = "serasona.checkinPhone";

const WAITING_COPY: Partial<Record<CheckinStatus, string>> = {
  sending_link: "Sending the link…",
  link_sent: "Sent. Tap it on your phone when you are ready.",
  capturing: "Listening…",
  dialing: "Connecting…",
  ringing: "Ringing your phone now.",
  in_call: "On the call.",
  analyzing: "Reading your voice…",
};

const CheckinByPhone = () => {
  const { isEntitled } = useAuth();
  const navigate = useNavigate();

  const [phone, setPhone] = useState(() => localStorage.getItem(PHONE_KEY) ?? "");
  const [mode, setMode] = useState<CheckinMode>("web");
  const [session, setSession] = useState<VoiceCheckinSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Plus is the phone tier. Everyone below it has the in-app recorder.
  const entitled = isEntitled("plus");

  useEffect(() => () => abort.current?.abort(), []);

  const begin = useCallback(async () => {
    const e164 = normalisePhone(phone);
    if (!e164) {
      setError("That does not look like a phone number.");
      return;
    }
    setError(null);
    setStarting(true);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    try {
      const started = await startVoiceCheckin(e164, { mode });
      localStorage.setItem(PHONE_KEY, phone);

      // Signed in and on this device: skip the SMS entirely and go straight to
      // the capture page. Cheaper, instant, and it sidesteps carrier filtering.
      if (mode === "web" && started.checkinUrl) {
        window.location.href = started.checkinUrl;
        return;
      }

      setSession({
        sessionId: started.sessionId,
        status: started.status,
        provider: started.provider,
        model: "haven",
        speechSeconds: null,
        captureSampleRate: null,
        smsStatus: null,
        error: null,
        quality: null,
        result: null,
      });

      const final = await pollVoiceCheckin(started.sessionId, {
        signal: controller.signal,
        onTick: setSession,
      });
      setSession(final);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof VoiceCheckinError
          ? [err.message, err.hint].filter(Boolean).join(" ")
          : "Could not start the check-in."
      );
    } finally {
      setStarting(false);
    }
  }, [phone, mode]);

  if (!entitled) return <Navigate to="/pricing" replace />;

  // ---- result -------------------------------------------------------------
  if (session?.status === "complete") {
    const metrics = toSevenMetrics(session);
    const telephony = isTelephonyGrade(session);

    return (
      <div className="min-h-screen bg-background px-6 py-16">
        <div className="max-w-md mx-auto space-y-8">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-primary">Done</p>
            <h1 className="font-serif text-3xl text-foreground">Your check-in</h1>
          </div>

          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {metrics.map((m) => (
              <div key={m.key} className="flex items-baseline justify-between px-6 py-4">
                <span className="text-foreground">{m.label}</span>
                {m.score === null ? (
                  <span className="text-sm text-muted-foreground">not read</span>
                ) : (
                  <span className="flex items-baseline gap-3">
                    {/* The word, always. Colour never carries a result alone. */}
                    <span className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                      {m.band}
                    </span>
                    <span className="font-serif text-2xl text-foreground tabular-nums">{m.score}</span>
                  </span>
                )}
              </div>
            ))}
          </div>

          {telephony && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              This one came over a phone line, which carries less of your voice than the app does.
              Read it alongside other calls rather than against your in-app check-ins.
            </p>
          )}

          <div className="flex gap-3">
            <Button asChild className="flex-1">
              <Link to="/history">See my trend</Link>
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setSession(null)}>
              Again
            </Button>
          </div>
          <Button variant="ghost" className="w-full" onClick={() => navigate("/account")}>
            Back to account
          </Button>
        </div>
      </div>
    );
  }

  // ---- terminal failure ---------------------------------------------------
  if (session && session.status !== "analyzing" && !WAITING_COPY[session.status]) {
    const copy = failureCopy(session);
    return (
      <div className="min-h-screen bg-background px-6 py-16">
        <div className="max-w-md mx-auto space-y-6">
          <h1 className="font-serif text-3xl text-foreground">{copy.title}</h1>
          <p className="text-muted-foreground leading-relaxed">{copy.body}</p>
          <Button className="w-full" onClick={() => setSession(null)}>
            Try again
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate("/account")}>
            Back to account
          </Button>
        </div>
      </div>
    );
  }

  // ---- waiting ------------------------------------------------------------
  if (session) {
    return (
      <div className="min-h-screen bg-background px-6 py-16">
        <div className="max-w-md mx-auto space-y-6">
          <p className="text-xs font-mono uppercase tracking-wider text-primary">In progress</p>
          <h1 className="font-serif text-3xl text-foreground">
            {WAITING_COPY[session.status] ?? "Working…"}
          </h1>
          {session.speechSeconds !== null && (
            <p className="text-sm text-muted-foreground">
              {Math.round(session.speechSeconds)} seconds of speech captured.
            </p>
          )}
          <p className="text-sm text-muted-foreground leading-relaxed">
            You can close this page. The results will be in your account either way.
          </p>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              abort.current?.abort();
              navigate("/account");
            }}
          >
            Back to account
          </Button>
        </div>
      </div>
    );
  }

  // ---- start --------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-md mx-auto space-y-8">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-primary">Plus</p>
          <h1 className="font-serif text-3xl text-foreground">Check in by phone</h1>
          <p className="text-muted-foreground mt-2 leading-relaxed">
            No app needed. We reach you, you talk for a few minutes, the reading lands in your account.
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground" htmlFor="phone">
            Your number
          </label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(617) 555-0123"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode("web")}
            className={`rounded-2xl border p-4 text-left transition ${
              mode === "web" ? "border-primary bg-card" : "border-border bg-card/50"
            }`}
          >
            <span className="block text-foreground">Text me a link</span>
            <span className="block text-sm text-muted-foreground mt-1">
              Records in your browser. Best quality.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("phone")}
            className={`rounded-2xl border p-4 text-left transition ${
              mode === "phone" ? "border-primary bg-card" : "border-border bg-card/50"
            }`}
          >
            <span className="block text-foreground">Call me</span>
            <span className="block text-sm text-muted-foreground mt-1">
              Works on any phone. Carries less of your voice.
            </span>
          </button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full" onClick={begin} disabled={starting || !phone.trim()}>
          {starting ? "Starting…" : mode === "phone" ? "Call me now" : "Send the link"}
        </Button>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Your voice is analysed and then deleted. Nothing you say is read for its content. What is
          measured is the sound of your voice.
        </p>

        <Button variant="ghost" className="w-full" onClick={() => navigate("/account")}>
          Back to account
        </Button>
      </div>
    </div>
  );
};

export default CheckinByPhone;
