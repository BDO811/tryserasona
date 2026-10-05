/**
 * ============================================================================
 * AMPLIFIER V2 API → VISUAL MAPPING
 * ============================================================================
 *
 * The legacy L5 v1 API (`/api/v1/{type}/analyze-audio-sync`) returned
 * `result.explanations.feature_explanations.features` — a z-score table that
 * the report screens know how to render (see result-types.ts).
 *
 * The v2 API (`/v2/models/{model}/analyze` → `/v2/jobs/{id}`) returns a
 * completely different, richer shape:
 *
 *   result.signals[]         one entry per sign the model measures
 *                            { name, label, score 0-1, level, flagged }
 *   result.summary           { overall_level, recommended_action, flagged_count,
 *                              primary_signals[], description: { summary,
 *                              vocal_features[] } }
 *   result.extended_metrics  bipolar sub-dimensions with score_mean/score_std
 *                            and low/high anchors (empty when voice % is low)
 *   result.audio_quality     { voice_percentage, audio_clarity, issues[] }
 *
 * Condition jobs return `result.signal` (singular) with no `summary`.
 *
 * This module maps that into the same `VisualizedResult` the report components
 * already render, so the v2 output shows the full biomarker panel, vocal-feature
 * lab grid and detailed report rather than a bare pass/fail.
 */

import { AssessmentPathway } from "@/context/AssessmentContext";
import { rungFor } from "@/lib/result-headline";
import { isSuppressedSign } from "@/lib/suppressed-signs";
import {
  bandForSignal,
  bandLabelForSignal,
  isFlaggedBand,
  signLabel,
  type DisplayBand,
} from "@/lib/signal-band";
import {
  VisualizedResult,
  LabMetric,
  BiomarkerDefinition,
} from "@/lib/result-types";

// ============================================================================
// v2 response types
// ============================================================================

export interface V2Signal {
  name: string;
  label?: string;
  model_id?: string;
  score: number; // 0-1
  level: string; // none | low | consider | moderate | elevated | inconclusive
  flagged: boolean;
  recommended_action?: string;
  description?: {
    summary?: string;
    vocal_features?: V2VocalFeature[];
  };
}

export interface V2VocalFeature {
  feature: string;
  label: string;
  value: number;
  unit: string;
  value_interpretation: string;
}

export interface V2ExtendedMetric {
  metric_id: string;
  label: string;
  score_mean: number;
  score_std: number;
  low_anchor: string;
  high_anchor: string;
}

export interface V2AudioQuality {
  voice_percentage?: number;
  audio_clarity?: number;
  issues?: string[];
}

export interface V2Result {
  signals?: V2Signal[];
  signal?: V2Signal;
  extended_metrics?: V2ExtendedMetric[];
  audio_quality?: V2AudioQuality;
  summary?: {
    primary_signals?: string[];
    overall_level?: string;
    recommended_action?: string;
    flagged_count?: number;
    description?: {
      summary?: string;
      vocal_features?: V2VocalFeature[];
    };
  };
}

export interface V2JobDetail {
  job_id: string;
  status: string;
  created_at?: string | null;
  completed_at?: string | null;
  result?: V2Result | null;
  audio_duration_seconds?: number;
  audio_sample_rate?: number;
  model_name?: string;
  job_type?: string;
  api_version?: string;
}

/**
 * True when a job payload is a v2 response rather than a legacy v1 one.
 * v1 puts everything under `result.explanations`; v2 always carries at least
 * one of `signals` / `signal` / `audio_quality`.
 */
export function isV2Result(result: unknown): result is V2Result {
  if (!result || typeof result !== "object") return false;
  const r = result as Record<string, unknown>;
  return Array.isArray(r.signals) || !!r.signal || !!r.audio_quality;
}

// ============================================================================
// Sign reference copy
// ============================================================================

interface SignCopy {
  definition: string;
  context: string;
}

/**
 * Plain-language copy for every sign the v2 models can return. Keyed by the
 * external sign name (`signal.name`).
 */
const SIGN_COPY: Record<string, SignCopy> = {
  "mood-disruption": {
    definition:
      "A shift in the emotional colouring of speech: flatter melody, slower pacing and reduced dynamic range are the patterns most often associated with low mood.",
    context:
      "Mood shows up in voice before it shows up in what someone says. This signal reads prosody rather than content.",
  },
  anxiety: {
    definition:
      "Vocal markers of anticipatory arousal, typically faster and less regular speech, raised pitch and tighter breath support.",
    context:
      "Anxious speech tends to carry higher pitch variability and shorter, more frequent pauses than the same speaker's baseline.",
  },
  stress: {
    definition:
      "Acute load on the voice production system: increased muscular tension in the larynx measurably changes pitch and timing.",
    context:
      "This is a state measure, not a trait. It reflects the speaker at the moment of recording.",
  },
  fatigue: {
    definition:
      "Reduced vocal effort and stamina: lower loudness, softer onsets and a drift in pitch control across a sustained sample.",
    context:
      "Fatigue degrades the fine motor control of the vocal folds, which is why it is audible before it is reportable.",
  },
  dehydration: {
    definition:
      "Reduced mucosal lubrication of the vocal folds, which shows up as increased cycle-to-cycle irregularity and a drier, harsher timbre.",
    context:
      "Hydration state changes vocal fold viscosity directly, making it one of the more mechanically grounded voice signals.",
  },
  "elevated-blood-pressure": {
    definition:
      "Cardiovascular load expressed through voice: changes in phonation stability that track with vascular tone.",
    context:
      "A screening signal only. It does not replace a cuff measurement and is not a diagnosis.",
  },
  "cognitive-load": {
    definition:
      "The processing demand carried while speaking, read from pause structure, filled hesitations and articulation rate.",
    context: "Higher load lengthens planning pauses and slows articulation.",
  },
  "cognitive-impairment": {
    definition:
      "Patterns in timing, word-finding pauses and articulatory precision associated with reduced cognitive function.",
    context: "A screening signal intended to prompt formal assessment, not to substitute for one.",
  },
  "head-impact": {
    definition:
      "Motor-speech disruption consistent with recent head trauma: altered articulation timing and reduced pitch control.",
    context: "Designed for sideline and post-incident screening contexts.",
  },
  "cardiovascular-strain": {
    definition:
      "Respiratory and phonatory markers of cardiovascular effort, including breath-group length and loudness decay.",
    context: "Reflects exertional load at the time of the sample.",
  },
  "iron-deficiency": {
    definition:
      "Voice changes associated with reduced oxygen-carrying capacity, principally reduced vocal stamina and loudness.",
    context: "A screening signal that pairs with, rather than replaces, a serum ferritin test.",
  },
  "elevated-androgens": {
    definition:
      "Structural voice changes associated with androgen exposure, chiefly a lowered fundamental frequency.",
    context: "Reads slow, structural change rather than a same-day state.",
  },
  "metabolic-load": {
    definition:
      "Voice markers tracking metabolic stress, including changes in phonation stability and breath support.",
    context: "A composite signal rather than a single-analyte proxy.",
  },
  "dry-mouth": {
    definition:
      "Reduced oral lubrication, audible as increased friction noise and altered articulation of consonants.",
    context: "Commonly medication-related and often reversible.",
  },
  "airway-obstruction-pattern": {
    definition:
      "Respiratory markers consistent with restricted airflow: shortened breath groups and altered loudness contours.",
    context: "A screening signal for obstructive patterns, not a spirometry substitute.",
  },
  allergy: {
    definition:
      "Upper-airway inflammation expressed through changes in resonance and nasality.",
    context: "Tracks the inflammatory state at the time of the sample.",
  },
  "alcohol-use-pattern": {
    definition:
      "Motor-speech markers associated with alcohol exposure, including reduced articulatory precision and timing control.",
    context: "Reads pattern over time rather than a single-point intoxication level.",
  },
  "substance-use-pattern": {
    definition:
      "Speech-motor and prosodic markers associated with substance exposure.",
    context: "A pattern-level signal intended for longitudinal monitoring.",
  },
  "emotional-destabilization": {
    definition:
      "Volatility in the emotional contour of speech across a sample, rather than a single sustained state.",
    context: "Measures variance in affect, which is distinct from average mood.",
  },
  hypervigilance: {
    definition:
      "Sustained elevated arousal expressed through pitch, timing and breath patterns.",
    context: "Distinguished from anxiety by its persistence across the whole sample.",
  },
  "attention-dysregulation": {
    definition:
      "Irregular pacing and pause structure associated with unstable attentional control.",
    context: "Reads the rhythm of speech planning rather than its content.",
  },
};

const DEFAULT_SIGN_COPY: SignCopy = {
  definition:
    "A voice-derived signal produced by Swara's voice model from acoustic properties of the sample.",
  context: "Screening output. Interpret alongside clinical context, not on its own.",
};

// ============================================================================
// Vocal feature reference ranges (from the v2 vocal-feature reference)
// ============================================================================

const FEATURE_REFERENCE: Record<string, string> = {
  pitch_mean: "85-255 Hz",
  pitch_variability: "0.05-0.25",
  loudness_mean: "-30 to -10 dB",
  loudness_variability: "0.30-0.80",
  speech_rate: "3.5-7.5 syl/s",
  articulation_rate: "4.0-8.0 syl/s",
  pause_duration_mean: "0.15-0.60 s",
  voice_jitter: "< 1.0 %",
  voice_shimmer: "< 3.8 dB",
  voice_clarity_hnr: "> 7 dB",
  voice_breathiness: "20-35 dB",
};

/** Short labels so the lab grid stays legible at its smallest type size. */
const FEATURE_SHORT_LABEL: Record<string, string> = {
  pitch_mean: "PITCH",
  pitch_variability: "PITCH VAR",
  loudness_mean: "LOUDNESS",
  loudness_variability: "LOUD VAR",
  speech_rate: "SPEECH RATE",
  articulation_rate: "ARTIC RATE",
  pause_duration_mean: "PAUSE",
  voice_jitter: "JITTER",
  voice_shimmer: "SHIMMER",
  voice_clarity_hnr: "HNR",
  voice_breathiness: "BREATHINESS",
};

// ============================================================================
// Level helpers
// ============================================================================

const LEVEL_RANK: Record<string, number> = {
  none: 0,
  low: 1,
  inconclusive: 1,
  consider: 2,
  moderate: 3,
  elevated: 4,
};

/** Highest-severity level across a set of signals. */
function worstLevel(signals: V2Signal[]): string | undefined {
  let worst: string | undefined;
  let worstRank = -1;
  for (const s of signals) {
    const rank = LEVEL_RANK[(s.level || "").toLowerCase()] ?? -1;
    if (rank > worstRank) {
      worstRank = rank;
      worst = s.level;
    }
  }
  return worst;
}

function formatFeatureValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function interpretationToStatus(interpretation: string): "normal" | "elevated" | "low" {
  const i = (interpretation || "").toLowerCase();
  if (i.includes("within")) return "normal";
  if (i.includes("reduced") || i.includes("low")) return "low";
  return "elevated";
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ============================================================================
// Mappers
// ============================================================================

export function mapVocalFeaturesToLabMetrics(features: V2VocalFeature[]): LabMetric[] {
  return features.map((f) => {
    const status = interpretationToStatus(f.value_interpretation);
    return {
      label: FEATURE_SHORT_LABEL[f.feature] || f.label?.toUpperCase() || titleCase(f.feature),
      value: formatFeatureValue(f.value),
      unit: f.unit || "",
      reference: FEATURE_REFERENCE[f.feature] || f.value_interpretation || "—",
      status,
    };
  });
}

export function mapSignalsToBiomarkers(
  signals: V2Signal[],
  bands: DisplayBand[]
): BiomarkerDefinition[] {
  return signals.map((s, i) => {
    const copy = SIGN_COPY[s.name] || DEFAULT_SIGN_COPY;
    const band = bands[i] ?? bandForSignal(s.name, s.level);
    const pct = Number.isFinite(s.score) ? Math.round(s.score * 100) : 0;

    /*
      Written from the display band rather than the API's own `flagged` and
      `level` words. Those disagree with what the row shows: `flagged` is true
      from consider up, consider displays as LOW, and head-impact is held to
      ELEVATED, so a signal reading LOW on screen would have opened this
      paragraph with "Flagged at consider level".

      The paragraph is present only when the band is flagged, which is the gate
      itself. It used to be gated in the view on Math.abs(zScore) >= 2.0, where
      zScore came from a hand-written level-to-number table and the API returns
      no such statistic.
    */
    const bandWord = bandLabelForSignal(s.name, band);
    const clinicalContext = isFlaggedBand(band)
      ? `Reading ${bandWord} at ${pct}% signal strength. ${copy.context}`
      : undefined;

    return {
      title: signLabel(s.name, s.label) || titleCase(s.name),
      technicalName: s.name,
      value: String(pct),
      unit: "%",
      definition: copy.definition,
      clinicalContext,
      level: s.level,
    };
  });
}

/**
 * Transform a completed v2 job into the `VisualizedResult` the report
 * components render.
 */
export function transformV2ResultToVisualization(
  job: V2JobDetail,
  pathway: AssessmentPathway
): VisualizedResult {
  const result = job.result || {};

  // Condition jobs carry a single `signal`; model and use-case jobs carry `signals[]`.
  const signals: V2Signal[] = Array.isArray(result.signals)
    ? result.signals
    : result.signal
      ? [result.signal]
      : [];

  const summary = result.summary;
  const overallLevel = summary?.overall_level || worstLevel(signals);
  /*
    summary.overall_level, carried through as the API reports it rather than
    translated into a risk vocabulary.

    It used to pass through v2LevelToLikelihoodTier, which mapped the six
    documented levels onto NO_RISK / LOW / MODERATE / HIGH / INCONCLUSIVE. That
    collapsed consider and moderate into one value, and because NO_RISK and HIGH
    are not levels levelOf() recognises, both fell back to inconclusive: a clean
    result and the most severe result each rendered in the inconclusive grey.
  */
  const likelihoodTier = (overallLevel || "inconclusive").toUpperCase();

  const audioQuality = result.audio_quality || {};
  const voicePercentage = audioQuality.voice_percentage;
  const audioClarity = audioQuality.audio_clarity;
  const issues = audioQuality.issues || [];

  // Vocal features live on the summary for model/use-case jobs and on the
  // signal itself for condition jobs.
  const vocalFeatures =
    summary?.description?.vocal_features ||
    result.signal?.description?.vocal_features ||
    signals[0]?.description?.vocal_features ||
    [];

  const labMetrics = mapVocalFeaturesToLabMetrics(vocalFeatures);

  // Signals dropped before anything downstream sees them, so they cannot reach
  // a screen, the PDF, the saved history or the headline grading.
  const shownSignals = signals.filter((s) => !isSuppressedSign(s.name));

  /*
    Left in the order the API returned them, rather than sorted most-severe
    first. The reveal deliberately shows a mix, so a clean signal sitting next
    to a flagged one is visible instead of being pushed to the bottom.

    summary.primary_signals is not used for ordering either: it is documented as
    the "top 1-3 name values by score", and a real apex run returned six.
  */
  const orderedSignals = shownSignals;

  /*
    Counts and the grade both read the displayed band, not the raw level, so a
    per-sign override cannot leave a row reading NORMAL while the header counts
    it as a flag. head-impact is the sign that override applies to.
  */
  const displayBands = shownSignals.map((sig) => bandForSignal(sig.name, sig.level));
  const flaggedCount = displayBands.filter(isFlaggedBand).length;
  const biomarkers = mapSignalsToBiomarkers(orderedSignals, displayBands);
  // Graded from the displayed bands for the same reason the count is.
  const signalLevels = shownSignals.map((sig, i) =>
    displayBands[i] === "NORMAL" ? "low" : sig.level || ""
  );
  const classification = getV2Classification(likelihoodTier, pathway, signalLevels);
  const headlineRung = signalLevels.length > 0 ? rungFor({ levels: signalLevels }) : undefined;

  const clinicalSubtext = buildSubtext(orderedSignals, displayBands);

  const sampleRate = job.audio_sample_rate
    ? `${Math.round(job.audio_sample_rate / 1000)}kHz`
    : "48kHz";

  return {
    jobId: job.job_id,
    createdAt: job.created_at || job.completed_at || new Date().toISOString(),
    status: job.status,
    likelihoodTier,
    pathway: pathway || "WELLNESS",
    classification,
    headlineRung,
    labMetrics,
    biomarkers,
    extendedMetrics: result.extended_metrics || [],
    signals: orderedSignals.map((s) => ({
      name: s.name,
      // The API's own label. Screens run it through signLabel().
      label: s.label || titleCase(s.name),
      score: s.score,
      level: s.level,
      flagged: s.flagged,
    })),
    recommendedAction: summary?.recommended_action || result.signal?.recommended_action,
    flaggedCount,
    totalSignals: shownSignals.length,
    modelName: job.model_name,
    clinicalSubtext,
    keyStat: {
      label: "Signals Flagged",
      value: String(flaggedCount),
      suffix: shownSignals.length ? ` / ${shownSignals.length}` : "",
    },
    signalQuality: {
      // v2 has no SI-SDR figure. It reports `audio_clarity` on a 0-100 scale,
      // which is a different quantity — surfaced separately as audioClarity so
      // it is never mislabelled as a dB signal-to-noise ratio.
      audioClarity,
      // Nyquist of the capture rate: the highest frequency the recording can
      // carry. The API reports no frequency range of its own, so this is
      // labelled as a property of the capture, not of the analysis.
      captureBandwidth: job.audio_sample_rate
        ? `${Math.round(job.audio_sample_rate / 2000)}kHz`
        : undefined,
      sampleRate,
      duration: job.audio_duration_seconds || 0,
      issues,
      // v2 reports voice_percentage as 0-100; the report screens expect the
      // 0-1 fraction the legacy v1 field used.
      voicePercentage: typeof voicePercentage === "number" ? voicePercentage / 100 : undefined,
    },
  };
}


function pathwayDomainName(pathway: AssessmentPathway): string {
  return pathway === "BRAIN_AGE"
    ? "COGNITIVE"
    : pathway === "LONGEVITY"
      ? "RESPIRATORY"
      : pathway === "MENTAL_HEALTH"
        ? "AFFECTIVE"
        : pathway === "FERTILITY"
          ? "HORMONAL"
          : pathway === "SPORTS"
            ? "ATHLETIC"
            : "WELLNESS";
}

/**
 * The headline leads with what is holding up rather than what is wrong, graded
 * from the signals themselves. See lib/result-headline.ts for the ladder and
 * for why OPTIMAL is withheld when signals are flagged high.
 *
 * `levels` are the raw API levels. Passing none falls back to naming the
 * assessment, which is the only honest headline without signal data.
 */
export function getV2Classification(
  likelihoodTier: string,
  pathway: AssessmentPathway,
  _levels: string[] = []
): string {
  // Names the subject, nothing more. The assessment scale directly above this
  // line already lights the grade, so carrying the rung word here too read as
  // "ATHLETIC PROFILE NEEDS IMPROVEMENT" underneath a lit NEEDS IMPROVEMENT.
  return `${pathwayDomainName(pathway)} PROFILE`;
}

/**
 * The sentence under the result, composed from the signals actually shown.
 *
 * The API's own `summary.description.summary` is deliberately not used here.
 * The docs are explicit that it is not patient-facing: "surface it only after
 * review by qualified care staff, not as direct patient-facing output". On a
 * real apex run it also named Elevated Blood Pressure and Cognitive Impairment
 * — the canonical sign names behind apex's cardiovascular-strain and
 * cognitive-load aliases — and counted six signals against the rows on screen.
 *
 * Composing it from `signals[].label` means it can only ever name what the
 * screen shows, in the API's own v2 wording, with a count that matches the
 * rows. The narrative stays on the payload for a future staff-facing view.
 */
function buildSubtext(signals: V2Signal[], bands: DisplayBand[]): string {
  if (!signals.length) return "No voice signals were returned for this recording.";

  // Named off the displayed bands, not the API's own `flagged`. Those differ
  // wherever a per-sign override applies: with head-impact forced to moderate,
  // filtering on `flagged` listed seven names under a count of six.
  const flagged = signals
    .filter((_, i) => isFlaggedBand(bands[i]))
    .map((s) => signLabel(s.name, s.label) || titleCase(s.name));

  if (flagged.length === 0) {
    return `None of the ${signals.length} voice signals measured were flagged.`;
  }

  const names =
    flagged.length === 1
      ? flagged[0]
      : `${flagged.slice(0, -1).join(", ")} and ${flagged[flagged.length - 1]}`;

  return `${flagged.length} of ${signals.length} voice signals were flagged: ${names}.`;
}

