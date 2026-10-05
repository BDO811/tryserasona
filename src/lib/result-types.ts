import { AssessmentPathway } from "@/context/AssessmentContext";

/**
 * The shape the report screens read, and the display helper they share.
 *
 * These used to live in cognitive-api-visual-mapping alongside the v1
 * transform. That module was scoped to the BRAIN_AGE pathway by its own header
 * yet acted as the fallback for every pathway, and the app now runs entirely on
 * the v2 API, so it has been removed. The types stay because they describe what
 * the screens consume, not which API produced it.
 */

export interface LabMetric {
  label: string;
  value: string;
  unit: string;
  reference: string;
  status: "normal" | "elevated" | "low";
}

export interface BiomarkerDefinition {
  title: string;
  technicalName: string;
  value: string;
  unit: string;
  definition: string;
  /** Set only when the display band is flagged. Absent means nothing to add. */
  clinicalContext?: string;
  /** Raw v2 level, so a screen can band it without matching back by name. */
  level?: string;
}

/** v2 `extended_metrics[]` entry — a bipolar sub-dimension score. */
export interface ExtendedMetric {
  metric_id: string;
  label: string;
  score_mean: number;
  score_std: number;
  low_anchor: string;
  high_anchor: string;
}

/** v2 `signals[]` entry, reduced to what the report screens need. */
export interface SignalSummary {
  name: string;
  label: string;
  score: number; // 0-1
  level: string;
  flagged: boolean;
}

export interface VisualizedResult {
  jobId: string;
  createdAt: string;
  status: string;
  /** Mirrors summary.overall_level, uppercased. */
  likelihoodTier: string;

  pathway: AssessmentPathway;
  /** Names the assessment. The grade lives on the scale, not here. */
  classification: string;

  labMetrics: LabMetric[];
  biomarkers: BiomarkerDefinition[];
  extendedMetrics?: ExtendedMetric[];
  signals?: SignalSummary[];

  recommendedAction?: string;
  flaggedCount?: number;
  totalSignals?: number;
  modelName?: string;
  /** Which rung of the assessment scale this result landed on. */
  headlineRung?: string;

  clinicalSubtext: string;
  keyStat: {
    label: string;
    value: string;
    suffix: string;
  };

  signalQuality?: {
    /** v2 `audio_quality.audio_clarity`, 0-100. */
    audioClarity?: number;
    /** v2 `audio_quality.voice_percentage`, as a 0-1 fraction. */
    voicePercentage?: number;
    sampleRate: string;
    duration: number;
    /** Nyquist of `audio_sample_rate`. A property of the capture, not of the analysis. */
    captureBandwidth?: string;
    /** Codes from `audio_quality.issues`, empty when the recording was clean. */
    issues?: string[];
  };
}

/**
 * Display wording for `summary.overall_level`.
 *
 * One entry per documented level, all six distinct. The NO_RISK and HIGH keys
 * that used to sit here were from a translation layer that has been removed:
 * they are not levels the API returns, and mapping onto them collapsed consider
 * and moderate into a single outcome.
 *
 * Anything unrecognised returns the input unchanged rather than inventing a
 * label for a level this build has not seen.
 */
export function formatLikelihoodTierForDisplay(tier: string): string {
  const map: Record<string, string> = {
    NONE: "Nothing Detected",
    LOW: "Normal",
    CONSIDER: "Worth Considering",
    MODERATE: "Continue to Monitor",
    ELEVATED: "Review Recommended",
    INCONCLUSIVE: "Inconclusive",
  };
  return map[tier.toUpperCase()] || tier;
}
