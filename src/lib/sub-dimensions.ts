import type { ExtendedMetric } from "@/lib/result-types";

/**
 * How `result.extended_metrics` is presented.
 *
 * These are not signals. Each is a position between two named anchors, with no
 * `level` field of its own — `score_mean` is all the payload gives. So unlike
 * the seven signals, where a documented level exists and banding the raw score
 * would override the model's calibration, banding here is the only route the
 * API leaves open.
 *
 * The band is fixed at NORMAL = 0.40-0.60. That was chosen over equal thirds
 * because every sub-dimension on a real apex run landed between 0.413 and
 * 0.534: with thirds, every row would read the middle word forever. It was also
 * chosen over a tighter 0.45-0.55 because the segment spread (`score_std`) runs
 * up to 0.075, and a band narrower than the noise would flip between takes of
 * the same person.
 */
const NORMAL_LOW = 0.4;
const NORMAL_HIGH = 0.6;

export interface SubDimensionConfig {
  /** `metric_id` from the payload. */
  id: string;
  /** What the row is called. Overrides the API's own label where it read clinically. */
  label: string;
  /**
   * The three level words, ordered low score to high score so they line up with
   * the API's low_anchor and high_anchor. No direction flag is needed because
   * every triad below is written in that order.
   */
  levels: [string, string, string];
  /** Shown on the results screen. Hidden ones are still stored for trends. */
  shown: boolean;
  /**
   * True where neither end is a problem, so the middle band must not be read as
   * "better". The VAD dimensions are the only ones like this.
   */
  neutral?: boolean;
}

/**
 * Per-metric decisions. Anything the API returns that is absent here is stored
 * but never rendered, so a new metric appearing upstream cannot arrive on the
 * screen with wording nobody chose.
 */
export const SUB_DIMENSIONS: SubDimensionConfig[] = [
  {
    id: "sleep-disturbance",
    label: "Recovery",
    levels: ["RECOVERED", "NORMAL", "UNDER-RECOVERED"],
    shown: true,
  },
  {
    // Named apart from the `fatigue` signal on purpose: both come back on the
    // same recording on different scales, 0.128 as a signal and 0.497 here.
    id: "fatigue",
    label: "Energy",
    levels: ["ENERGETIC", "NORMAL", "TIRED"],
    shown: true,
  },
  {
    id: "anhedonia",
    label: "Happiness/Anhedonia",
    levels: ["UPBEAT", "NORMAL", "FLAT"],
    shown: true,
  },
  {
    id: "energy-level",
    label: "Vitality",
    levels: ["HIGH ENERGY", "NORMAL", "LOW ENERGY"],
    shown: true,
  },
  {
    id: "burnout",
    label: "Freshness",
    levels: ["FRESH", "NORMAL", "DEPLETED"],
    shown: true,
  },
  {
    id: "psychomotor-state",
    label: "Composure",
    levels: ["COMPOSED", "NORMAL", "AMPED"],
    shown: true,
  },
  {
    // Dropped alongside Sense of Dominance: relaxed and activated are both
    // just descriptions, so a graded middle would imply both ends are not.
    id: "vad-arousal",
    label: "Activation",
    levels: ["RELAXED", "NORMAL", "ACTIVATED"],
    shown: false,
    neutral: true,
  },
  {
    id: "concentration",
    label: "Focus",
    levels: ["SHARP", "NORMAL", "SCATTERED"],
    shown: true,
  },
  {
    id: "motivation",
    label: "Drive",
    levels: ["DRIVEN", "NORMAL", "FLAGGING"],
    shown: true,
  },
  {
    // Dropped from the screen: submissive and dominant are both just
    // descriptions, and the docs call the high end "confident and assertive",
    // so a middle band labelled normal would imply both ends are not.
    id: "vad-dominance",
    label: "Sense of Dominance",
    levels: ["RESERVED", "NORMAL", "ASSERTIVE"],
    shown: false,
    neutral: true,
  },
];

const BY_ID = new Map(SUB_DIMENSIONS.map((d) => [d.id, d]));

export function configFor(metricId: string): SubDimensionConfig | undefined {
  return BY_ID.get(metricId);
}

/** Which of the three words a score falls in. 0 = low, 1 = middle, 2 = high. */
export function bandIndexFor(scoreMean: number): 0 | 1 | 2 {
  if (!Number.isFinite(scoreMean)) return 1;
  if (scoreMean < NORMAL_LOW) return 0;
  if (scoreMean > NORMAL_HIGH) return 2;
  return 1;
}

export interface ReadableSubDimension {
  id: string;
  label: string;
  /** The word for this reading. */
  level: string;
  /** All three, so a scale can dim the two it is not. */
  levels: [string, string, string];
  bandIndex: 0 | 1 | 2;
  scoreMean: number;
  scoreStd: number;
  lowAnchor: string;
  highAnchor: string;
  neutral: boolean;
}

/**
 * The sub-dimensions to render, in the order configured above rather than the
 * order the API returned them, so the screen does not reorder itself between
 * recordings.
 */
export function readableSubDimensions(
  metrics: ExtendedMetric[] | undefined
): ReadableSubDimension[] {
  if (!metrics || metrics.length === 0) return [];
  const byId = new Map(metrics.map((m) => [m.metric_id, m]));

  return SUB_DIMENSIONS.filter((config) => config.shown)
    .map((config) => {
      const metric = byId.get(config.id);
      if (!metric) return null;
      const bandIndex = bandIndexFor(metric.score_mean);
      return {
        id: config.id,
        label: config.label,
        level: config.levels[bandIndex],
        levels: config.levels,
        bandIndex,
        scoreMean: metric.score_mean,
        scoreStd: metric.score_std,
        lowAnchor: metric.low_anchor,
        highAnchor: metric.high_anchor,
        neutral: config.neutral === true,
      };
    })
    .filter((d): d is ReadableSubDimension => d !== null);
}
