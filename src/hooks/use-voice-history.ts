import { useEffect, useRef, useState } from "react";
import { useAssessment } from "@/context/AssessmentContext";
import { analyzeSignalHistory, changeSinceLastVisit, type LongitudinalRead } from "@/lib/longitudinal";
import {
  fetchHistory,
  saveSession,
  toSignalSeries,
  type StoredSession,
} from "@/lib/voice-history-client";

export interface SignalHistory {
  name: string;
  label: string;
  read: LongitudinalRead;
  /** Change from the user's previous visit. Null on a first visit. */
  sinceLastVisit: { previous: number; latest: number; change: number } | null;
}

export interface VoiceHistoryState {
  loading: boolean;
  /** Every stored session for this user, oldest first. */
  sessions: StoredSession[];
  /** One positioned read per signal, most-recent-deviation first. */
  signals: SignalHistory[];
  /** True when the user had sessions on record before this one. */
  isReturning: boolean;
}

const EMPTY: VoiceHistoryState = {
  loading: false,
  sessions: [],
  signals: [],
  isReturning: false,
};

/**
 * Load a user's session history, optionally persisting the current result first.
 *
 * The save is awaited before the fetch so the history that comes back includes
 * the session the user just recorded. It runs at most once per result: a
 * re-render, or a trip to the detailed view and back, must not write a
 * duplicate session and skew the user's own baseline.
 */
export function useVoiceHistory({ save = false }: { save?: boolean } = {}): VoiceHistoryState {
  const { userProfile, visualizedResult, pathway } = useAssessment();
  const email = userProfile.email?.trim() || "";
  const jobId = visualizedResult?.jobId || "";

  const [state, setState] = useState<VoiceHistoryState>(EMPTY);
  const savedJobIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!email) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    const run = async () => {
      // Count prior sessions before writing this one, so "returning member"
      // means they had history already rather than that they have any at all.
      let priorSessionCount = 0;

      const shouldSave =
        save && jobId && visualizedResult?.signals?.length && !savedJobIds.current.has(jobId);

      if (shouldSave) {
        savedJobIds.current.add(jobId);
        const existing = await fetchHistory(email);
        priorSessionCount = existing.length;
        await saveSession({
          email,
          model: visualizedResult.modelName ?? null,
          pathway: pathway ?? null,
          signals: visualizedResult.signals!,
          summary: {
            overallLevel: visualizedResult.likelihoodTier ?? null,
            recommendedAction: visualizedResult.recommendedAction ?? null,
            flaggedCount: visualizedResult.flaggedCount ?? null,
            totalSignals: visualizedResult.totalSignals ?? null,
          },
        });
      }

      const sessions = await fetchHistory(email);
      if (cancelled) return;

      const signals: SignalHistory[] = toSignalSeries(sessions)
        .map((series) => {
          const read = analyzeSignalHistory(series.readings);
          if (!read) return null;
          return {
            name: series.name,
            label: series.label,
            read,
            sinceLastVisit: changeSinceLastVisit(series.readings),
          };
        })
        .filter((s): s is SignalHistory => s !== null)
        // Largest absolute move from baseline first: that is what a returning
        // user is looking for when they open the page.
        .sort((a, b) => Math.abs(b.read.deviation ?? 0) - Math.abs(a.read.deviation ?? 0));

      setState({
        loading: false,
        sessions,
        signals,
        isReturning: shouldSave ? priorSessionCount > 0 : sessions.length > 1,
      });
    };

    run().catch((error) => {
      console.warn("[useVoiceHistory] Failed:", error);
      if (!cancelled) setState({ ...EMPTY, loading: false });
    });

    return () => {
      cancelled = true;
    };
    // visualizedResult is intentionally not a dependency: it is a new object on
    // every render, and jobId already identifies the result that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, jobId, save, pathway]);

  return state;
}
