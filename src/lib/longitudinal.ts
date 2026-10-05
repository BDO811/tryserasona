/**
 * Longitudinal signal tracking.
 *
 * Implements the engine described in the "longitudinal signal tracking"
 * explainer (30 July 2026): a score is not reported as a bare number but as a
 * position relative to the user's own recent readings plus a direction of
 * travel. History is kept per user, per signal.
 *
 * The four rules from that document drive everything below:
 *
 *   Recent sessions weigh more   - the baseline is an exponentially weighted
 *                                  mean, so it moves as new readings arrive.
 *   Bursts count once            - repeated recordings in one sitting collapse
 *                                  to a single reading and cannot move the
 *                                  baseline.
 *   Small moves read flat        - a direction is reported only once the move
 *                                  exceeds the user's own spread.
 *   Under three sessions         - no baseline is reported and the read stays
 *                                  provisional.
 *
 * A score is the likelihood a condition is present, not its severity, and none
 * of these outputs are a diagnosis.
 */

/** A single stored reading for one signal. */
export interface SignalReading {
  /** Identifies the recording session this reading came from. */
  sessionId: string;
  /** Epoch milliseconds the recording was captured. */
  capturedAt: number;
  /** Model score, 0-1. */
  score: number;
}

export type TrendDirection = "rising" | "falling" | "flat";

export interface LongitudinalRead {
  /** The most recent reading's score. */
  latest: number;
  /**
   * Exponentially weighted mean of every reading *before* the latest one.
   * Null until the user has enough history to support one.
   */
  baseline: number | null;
  /** latest - baseline. Null when there is no baseline. */
  deviation: number | null;
  /**
   * Direction of travel, gated on the user's own spread. Null when there is no
   * baseline; "flat" when the move is inside the spread.
   */
  direction: TrendDirection | null;
  /** Standard deviation of the pre-latest readings: the user's usual range. */
  spread: number | null;
  /** The band drawn around the baseline on the chart. Null without a baseline. */
  band: { low: number; high: number } | null;
  /** Count of readings after bursts have been collapsed. */
  sessions: number;
  /** True while the read is not yet backed by a baseline. */
  provisional: boolean;
  /** Change in the baseline per session across the whole series. */
  driftPerSession: number | null;
  /** Slope per session across the recent window only. */
  shortTermSlope: number | null;
  /** The readings actually used, bursts already collapsed, oldest first. */
  readings: SignalReading[];
  /** The baseline as it stood at each reading, for drawing the drift line. */
  baselineSeries: (number | null)[];
}

/**
 * Two recordings closer together than this belong to the same sitting. The
 * explainer calls these bursts: someone recording three times in a row to see
 * what happens should not be able to drag their own baseline.
 */
export const BURST_WINDOW_MS = 30 * 60 * 1000;

/** Below this many collapsed readings, no baseline is reported. */
export const MIN_SESSIONS_FOR_BASELINE = 3;

/**
 * Weight decay per session going backwards. 0.75 puts roughly half the weight
 * on the three most recent readings, which matches "recent sessions weigh more"
 * without letting a single reading dominate.
 */
const DECAY = 0.75;

/** How many trailing readings count as the recent window for the short-term trend. */
const RECENT_WINDOW = 3;

/**
 * A spread this small means the user is effectively flat, and dividing by it
 * would turn rounding noise into a reported direction.
 */
const MIN_MEANINGFUL_SPREAD = 0.02;

/**
 * Collapse bursts: readings within BURST_WINDOW_MS of the previous kept reading
 * are averaged into it rather than counted separately. Returns oldest first.
 */
export function collapseBursts(
  readings: SignalReading[],
  windowMs: number = BURST_WINDOW_MS
): SignalReading[] {
  const sorted = [...readings].sort((a, b) => a.capturedAt - b.capturedAt);
  const collapsed: Array<{ reading: SignalReading; scores: number[] }> = [];

  for (const reading of sorted) {
    const open = collapsed[collapsed.length - 1];
    if (open && reading.capturedAt - open.reading.capturedAt < windowMs) {
      // Same sitting. Fold it into the open reading; the sitting still counts once.
      open.scores.push(reading.score);
      continue;
    }
    collapsed.push({ reading, scores: [reading.score] });
  }

  return collapsed.map(({ reading, scores }) => ({
    ...reading,
    score: scores.reduce((sum, s) => sum + s, 0) / scores.length,
  }));
}

/**
 * Exponentially weighted mean, most recent reading weighted highest.
 * Returns null for an empty input.
 */
export function weightedBaseline(scores: number[], decay: number = DECAY): number | null {
  if (scores.length === 0) return null;

  let weightedSum = 0;
  let weightTotal = 0;
  // Walk backwards so the newest reading gets weight 1 and older ones decay.
  for (let i = scores.length - 1, age = 0; i >= 0; i--, age++) {
    const weight = Math.pow(decay, age);
    weightedSum += scores[i] * weight;
    weightTotal += weight;
  }
  return weightedSum / weightTotal;
}

/** Population standard deviation. Null for fewer than two scores. */
export function spreadOf(scores: number[]): number | null {
  if (scores.length < 2) return null;
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  return Math.sqrt(variance);
}

/**
 * Least-squares fit over a series indexed 0..n-1. Null for fewer than two
 * points. Returning the intercept as well as the slope lets a caller draw the
 * fitted line itself, rather than only knowing which way it leans.
 */
export function fitLine(scores: number[]): { slope: number; intercept: number } | null {
  const n = scores.length;
  if (n < 2) return null;

  const meanX = (n - 1) / 2;
  const meanY = scores.reduce((sum, s) => sum + s, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - meanX) * (scores[i] - meanY);
    denominator += (i - meanX) ** 2;
  }
  if (denominator === 0) return null;

  const slope = numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}

/** Least-squares slope per index step. Null for fewer than two points. */
export function slopeOf(scores: number[]): number | null {
  return fitLine(scores)?.slope ?? null;
}

/**
 * Report a direction only past the user's own spread. A move smaller than their
 * usual variation is not a signal, it is noise, so it reads flat.
 */
export function directionFor(deviation: number, spread: number | null): TrendDirection {
  const threshold = Math.max(spread ?? 0, MIN_MEANINGFUL_SPREAD);
  if (Math.abs(deviation) <= threshold) return "flat";
  return deviation > 0 ? "rising" : "falling";
}

/**
 * Turn a user's raw reading history for one signal into a positioned read.
 * Returns null when there is nothing to report on at all.
 */
export function analyzeSignalHistory(
  rawReadings: SignalReading[],
  options: { burstWindowMs?: number } = {}
): LongitudinalRead | null {
  const readings = collapseBursts(rawReadings, options.burstWindowMs);
  if (readings.length === 0) return null;

  const scores = readings.map((r) => r.score);
  const latest = scores[scores.length - 1];
  const priorScores = scores.slice(0, -1);
  const sessions = readings.length;

  // The baseline describes where the user has been, so it is built from the
  // readings before the latest one. Including the latest would let it drag its
  // own reference point and shrink every deviation toward zero.
  const hasBaseline = sessions >= MIN_SESSIONS_FOR_BASELINE;
  const baseline = hasBaseline ? weightedBaseline(priorScores) : null;
  const spread = hasBaseline ? spreadOf(priorScores) : null;
  const deviation = baseline === null ? null : latest - baseline;
  const direction = deviation === null ? null : directionFor(deviation, spread);

  // The baseline as it stood at each point, so the chart can draw its drift.
  const baselineSeries = scores.map((_, i) =>
    i >= MIN_SESSIONS_FOR_BASELINE - 1 ? weightedBaseline(scores.slice(0, i)) : null
  );
  const knownBaselines = baselineSeries.filter((b): b is number => b !== null);

  return {
    latest,
    baseline,
    deviation,
    direction,
    spread,
    band:
      baseline === null || spread === null
        ? null
        : { low: baseline - spread, high: baseline + spread },
    sessions,
    provisional: !hasBaseline,
    driftPerSession: slopeOf(knownBaselines),
    shortTermSlope: slopeOf(scores.slice(-RECENT_WINDOW)),
    readings,
    baselineSeries,
  };
}

/**
 * The change from the user's previous visit, independent of the baseline. This
 * is the "what moved since last time" number, not the positioned read.
 */
export function changeSinceLastVisit(
  rawReadings: SignalReading[]
): { previous: number; latest: number; change: number } | null {
  const readings = collapseBursts(rawReadings);
  if (readings.length < 2) return null;

  const latest = readings[readings.length - 1].score;
  const previous = readings[readings.length - 2].score;
  return { previous, latest, change: latest - previous };
}

/** Format a deviation or change the way the explainer prints it: signed, 2dp. */
export function formatSigned(value: number): string {
  const rounded = value.toFixed(2);
  // Avoid printing "-0.00" for a value that rounds to zero.
  if (Number(rounded) === 0) return "0.00";
  return value > 0 ? `+${rounded}` : `−${Math.abs(value).toFixed(2)}`;
}
