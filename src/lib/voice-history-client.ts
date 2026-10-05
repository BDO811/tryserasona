import type { SignalReading } from "@/lib/longitudinal";

/**
 * Client for the voiceHistory Cloud Function, which owns the Firestore
 * collection. The browser never touches Firestore directly, so no credentials
 * ship in this bundle. See gcp-functions/voice-history/index.js.
 */

const DEFAULT_VOICE_HISTORY_URL =
  "https://us-central1-amits-playground-po.cloudfunctions.net/voiceHistory";

const VOICE_HISTORY_URL =
  (import.meta.env.VITE_VOICE_HISTORY_URL as string | undefined) || DEFAULT_VOICE_HISTORY_URL;

export interface StoredSignal {
  name: string;
  label: string;
  score: number;
  level: string | null;
  flagged: boolean;
}

export interface StoredSession {
  sessionId: string;
  capturedAt: number;
  model: string | null;
  pathway: string | null;
  signals: StoredSignal[];
  summary: {
    overallLevel: string | null;
    recommendedAction: string | null;
    flaggedCount: number | null;
    totalSignals: number | null;
  } | null;
}

export interface SessionToSave {
  email: string;
  model?: string | null;
  pathway?: string | null;
  capturedAt?: number;
  signals: Array<{
    name: string;
    label?: string;
    score: number;
    level?: string | null;
    flagged?: boolean;
  }>;
  summary?: {
    overallLevel?: string | null;
    recommendedAction?: string | null;
    flaggedCount?: number | null;
    totalSignals?: number | null;
  } | null;
}

/**
 * Persist one completed analysis.
 *
 * Resolves to false rather than throwing on failure: history is an enhancement
 * to the report, and a Firestore outage should never stop a user seeing the
 * results they just recorded.
 */
export async function saveSession(session: SessionToSave): Promise<boolean> {
  if (!session.email) return false;

  try {
    const response = await fetch(VOICE_HISTORY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capturedAt: Date.now(), ...session }),
    });
    if (!response.ok) {
      console.warn(`[voice-history] Save failed with status ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[voice-history] Save failed:", error);
    return false;
  }
}

/** Fetch a user's stored sessions, oldest first. Empty array on failure. */
export async function fetchHistory(email: string): Promise<StoredSession[]> {
  if (!email) return [];

  try {
    const response = await fetch(`${VOICE_HISTORY_URL}?email=${encodeURIComponent(email)}`);
    if (!response.ok) {
      console.warn(`[voice-history] Fetch failed with status ${response.status}`);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch (error) {
    console.warn("[voice-history] Fetch failed:", error);
    return [];
  }
}

/**
 * Regroup stored sessions into one reading series per signal, which is the
 * shape the longitudinal maths works on. A signal missing from a given session
 * simply has no reading for it.
 */
export function toSignalSeries(
  sessions: StoredSession[]
): Array<{ name: string; label: string; readings: SignalReading[] }> {
  const byName = new Map<string, { name: string; label: string; readings: SignalReading[] }>();

  for (const session of sessions) {
    for (const signal of session.signals) {
      const existing = byName.get(signal.name);
      const reading: SignalReading = {
        sessionId: session.sessionId,
        capturedAt: session.capturedAt,
        score: signal.score,
      };
      if (existing) {
        existing.readings.push(reading);
        // Prefer the most recent label; wording can change between model versions.
        existing.label = signal.label || existing.label;
      } else {
        byName.set(signal.name, {
          name: signal.name,
          label: signal.label || signal.name,
          readings: [reading],
        });
      }
    }
  }

  return [...byName.values()];
}
