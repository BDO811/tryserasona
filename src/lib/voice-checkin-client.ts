/**
 * Outbound voice check-in.
 *
 * What this adds that the in-app recorder does not: reach. The browser capture
 * on /checkin needs the person to be here, holding the phone, with the tab
 * open. This rings them, or texts them a link, and the check-in happens without
 * them having come to us first. That is the whole point of it — a longitudinal
 * product that can only be used pull-style gets used once.
 *
 * It is a separate service (the voice harness) rather than more code in this
 * app, because the capture has to survive the browser being closed: the carrier
 * posts recordings minutes after the call, and something has to be listening.
 *
 * Service: https://voice-call-harness-551580534721.us-central1.run.app
 * Spec:    Claude-Outputs/Amplifier_VoiceAgent_Harness_20261004/
 */

const HARNESS =
  import.meta.env.VITE_VOICE_HARNESS_URL ??
  "https://voice-call-harness-551580534721.us-central1.run.app";

export type CheckinMode = "web" | "phone";

export type CheckinStatus =
  // sms-web
  | "sending_link"
  | "link_sent"
  | "capturing"
  // phone
  | "dialing"
  | "ringing"
  | "in_call"
  // both
  | "analyzing"
  | "complete"
  | "insufficient_audio"
  | "low_quality"
  | "failed";

export const TERMINAL_STATUSES: CheckinStatus[] = [
  "complete",
  "insufficient_audio",
  "low_quality",
  "failed",
];

export const isTerminal = (s: CheckinStatus) => TERMINAL_STATUSES.includes(s);

export interface ExtendedMetric {
  metric_id: string;
  label: string;
  score_mean: number;
  score_std: number;
  low_anchor: string;
  high_anchor: string;
}

export interface VoiceCheckinSession {
  sessionId: string;
  status: CheckinStatus;
  provider: string;
  model: string;
  /** Seconds of actual speech captured. Null until analysis starts. */
  speechSeconds: number | null;
  /**
   * 48000 when the browser recorded it, 8000 when it came down a phone line.
   * Two readings at different rates are not the same measurement — see
   * `isTelephonyGrade` below.
   */
  captureSampleRate: number | null;
  smsStatus: string | null;
  error: string | null;
  quality: {
    usable: boolean;
    reason: string | null;
    voicePct: number | null;
    clarity: number | null;
    overallLevel: string | null;
  } | null;
  /** The raw Amplifier v2 job. Same shape analyzeAudio returns. */
  result: VoiceJob | null;
}

export interface VoiceJob {
  job_id?: string;
  audio_sample_rate?: number;
  audio_duration_seconds?: number;
  result?: {
    summary?: {
      overall_level?: string;
      recommended_action?: string;
      description?: { summary?: string };
    };
    signals?: Array<{
      name: string;
      label: string;
      score: number;
      level: string;
      flagged: boolean;
    }>;
    extended_metrics?: ExtendedMetric[];
    audio_quality?: {
      voice_percentage: number;
      audio_clarity: number;
      issues: string[];
    };
  };
}

export class VoiceCheckinError extends Error {
  constructor(message: string, readonly hint?: string | null) {
    super(message);
    this.name = "VoiceCheckinError";
  }
}

/** E.164 only. A malformed number dials the wrong person, which is worse than a failed request. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  // A bare 10-digit US number is the overwhelmingly common input here.
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export interface StartedCheckin {
  sessionId: string;
  status: CheckinStatus;
  provider: string;
  /**
   * A 256-bit capability that unlocks one voice capture. Open it, never log it,
   * never persist it, never put it in an analytics event. Only present on the
   * web path.
   */
  checkinUrl: string | null;
}

export async function startVoiceCheckin(
  phone: string,
  opts: { mode?: CheckinMode; model?: string } = {}
): Promise<StartedCheckin> {
  const to = normalisePhone(phone);
  if (!to) throw new VoiceCheckinError("That does not look like a phone number.");

  const res = await fetch(`${HARNESS}/voiceCall/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: to,
      mode: opts.mode ?? "web",
      // haven is the behavioural pipeline. pulse adds dehydration and blood
      // pressure, which are not Serasona's story and would need suppressing.
      model: opts.model ?? "haven",
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new VoiceCheckinError(
      body?.message ?? "Could not start the check-in.",
      body?.hint ?? null
    );
  }
  return body as StartedCheckin;
}

export async function getVoiceCheckin(sessionId: string, signal?: AbortSignal) {
  const res = await fetch(
    `${HARNESS}/voiceCall/status?session=${encodeURIComponent(sessionId)}`,
    { signal }
  );
  if (!res.ok) throw new VoiceCheckinError("Could not read the check-in status.");
  return (await res.json()) as VoiceCheckinSession;
}

/**
 * Poll to a terminal state. The ceiling is generous on purpose: a cold service
 * instance plus a slow model job can stack up, and failing a real capture
 * because we gave up early is the worst outcome available.
 */
export async function pollVoiceCheckin(
  sessionId: string,
  opts: { signal?: AbortSignal; onTick?: (s: VoiceCheckinSession) => void } = {}
): Promise<VoiceCheckinSession> {
  for (let i = 0; i < 200; i++) {
    if (opts.signal?.aborted) throw new VoiceCheckinError("Cancelled.");
    try {
      const s = await getVoiceCheckin(sessionId, opts.signal);
      opts.onTick?.(s);
      if (isTerminal(s.status)) return s;
    } catch {
      // A dropped poll is not a failed check-in. Keep going.
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new VoiceCheckinError("The check-in timed out.");
}

// --- reading the result ----------------------------------------------------

/**
 * Two of the thirteen extended metrics run bad → good; the other eleven run
 * good → bad. Putting them all on one scale without checking renders two of
 * them backwards, and backwards on a wellness screen looks like a working
 * feature — nothing appears broken, the number is just wrong.
 */
const HIGHER_IS_BETTER = new Set(["vad-valence", "vad-dominance"]);

export const SERASONA_METRICS = [
  { key: "stress", label: "Stress", metricId: "tension" },
  { key: "mood", label: "Mood", metricId: "vad-valence" },
  { key: "energy", label: "Energy", metricId: "energy-level" },
  { key: "confidence", label: "Confidence", metricId: "vad-dominance" },
  { key: "mentalFatigue", label: "Mental fatigue", metricId: "fatigue" },
  { key: "alertness", label: "Alertness", metricId: "sleep-disturbance" },
  { key: "focus", label: "Focus", metricId: "concentration" },
] as const;

export type Band = "Clear" | "Watch" | "Strained";

/**
 * Cutoffs are a starting point and are NOT calibrated. The design system's own
 * rule is that every number is relative to the user's own baseline, so this
 * should give way to a comparison against their rolling history once there is
 * one. Always render the band word — colour never carries a result alone.
 */
export const bandFor = (score: number): Band =>
  score >= 67 ? "Clear" : score >= 34 ? "Watch" : "Strained";

export interface SerasonaMetric {
  key: string;
  label: string;
  metricId: string;
  /** 0-100, higher is better. Null when the model did not return this metric. */
  score: number | null;
  band: Band | null;
  /** The model's own spread on this metric. Wide means treat it lightly. */
  confidence: number | null;
}

export function toSevenMetrics(session: VoiceCheckinSession): SerasonaMetric[] {
  const metrics = session.result?.result?.extended_metrics ?? [];
  const byId = new Map(metrics.map((m) => [m.metric_id, m]));

  return SERASONA_METRICS.map((spec) => {
    const m = byId.get(spec.metricId);
    if (!m) {
      return { ...spec, score: null, band: null, confidence: null };
    }
    const good = HIGHER_IS_BETTER.has(m.metric_id) ? m.score_mean : 1 - m.score_mean;
    const score = Math.round(good * 100);
    return { ...spec, score, band: bandFor(score), confidence: m.score_std };
  });
}

/**
 * True when the sample came down a phone line. Telephony is band-limited to
 * roughly 300-3400 Hz against the browser's full range, and nobody has yet
 * established the model scores the two equivalently. Surface it rather than
 * silently charting a phone reading next to an in-app one.
 */
export function isTelephonyGrade(session: VoiceCheckinSession): boolean {
  const rate = session.captureSampleRate ?? session.result?.audio_sample_rate ?? null;
  return rate !== null && rate <= 16000;
}

/** Copy for the states that are not a result. Kept here so the page stays about layout. */
export function failureCopy(session: VoiceCheckinSession): { title: string; body: string } {
  switch (session.status) {
    case "insufficient_audio":
      return {
        title: "Not quite enough to read",
        body:
          "We need about thirty seconds of talking and did not get there. Somewhere quiet, and answer in full sentences rather than a word or two.",
      };
    case "low_quality":
      return {
        title: "Could not read this one",
        body:
          "The recording came through but there was not enough clear speech in it to measure. Worth trying again somewhere quieter.",
      };
    default:
      return {
        title: "Something went wrong",
        body: session.error ?? "Please try again in a moment.",
      };
  }
}
