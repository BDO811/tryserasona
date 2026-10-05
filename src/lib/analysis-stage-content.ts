import type { AmplifierModelName } from "@/lib/pathway-model-map";
import { isSuppressedSign } from "@/lib/suppressed-signs";

/**
 * Readable copy for the analysis screen's six stages.
 *
 * Every line below names something the v2 API actually reports, taken from the
 * API reference at docs.amplifierhealth.com:
 *
 *   Stage 1  result.audio_quality        (voice_percentage, audio_clarity, issues)
 *   Stage 2  signal.description.vocal_features  (the prosody half)
 *   Stage 3  signal.description.vocal_features  (the voice-quality half)
 *   Stage 4  the selected model's own sign list, from the v2 model registry
 *   Stage 5  result.extended_metrics     (sub-dimension scoring)
 *   Stage 6  result.summary              (levels, flags, recommended_action)
 *
 * The point is to give someone waiting something real to read, so the detail
 * line rotates through these rather than showing one fixed label per stage. Stage 5
 * carries the longest list on purpose: it is the stage that absorbs however
 * much a slow job overruns the pacing target, so it needs the most to say.
 */

/** How long each detail line holds before the next one. */
export const DETAIL_ROTATE_MS = 1600;

export interface StageContent {
  /** The headline for the stage. */
  text: string;
  /** Detail lines, shown in order as [01], [02], [03]... and then looping. */
  details: string[];
}

/**
 * Sign labels for every model in the v2 registry, so stage 4 names the signals
 * the user's chosen model genuinely measures. Showing "elevated blood pressure"
 * during a mental-state scan would be describing work that is not happening.
 */
const MODEL_SIGNS: Record<AmplifierModelName, Array<{ name: string; label: string }>> = {
  pulse: [
    { name: "mood-disruption", label: "MOOD DISRUPTION" },
    { name: "anxiety", label: "ANXIETY" },
    { name: "stress", label: "STRESS" },
    { name: "fatigue", label: "FATIGUE" },
    { name: "dehydration", label: "DEHYDRATION" },
    { name: "elevated-blood-pressure", label: "ELEVATED BLOOD PRESSURE" },
  ],
  clarity: [
    { name: "cognitive-impairment", label: "COGNITIVE IMPAIRMENT" },
    { name: "speech-timing", label: "SPEECH TIMING" },
    { name: "lexical-retrieval", label: "LEXICAL RETRIEVAL" },
    { name: "articulation-precision", label: "ARTICULATION PRECISION" },
    { name: "pause-structure", label: "PAUSE STRUCTURE" },
    { name: "response-latency", label: "RESPONSE LATENCY" },
  ],
  haven: [
    { name: "mood-disruption", label: "MOOD DISRUPTION" },
    { name: "anxiety", label: "ANXIETY" },
    { name: "stress", label: "STRESS" },
    { name: "hypervigilance", label: "HYPERVIGILANCE" },
    { name: "attention-dysregulation", label: "ATTENTION DYSREGULATION" },
    { name: "fatigue", label: "FATIGUE" },
  ],
  tide: [
    { name: "elevated-blood-pressure", label: "ELEVATED BLOOD PRESSURE" },
    { name: "metabolic-load", label: "METABOLIC LOAD" },
    { name: "dehydration", label: "DEHYDRATION" },
    { name: "iron-deficiency", label: "IRON DEFICIENCY" },
    { name: "fatigue", label: "FATIGUE" },
    { name: "dry-mouth", label: "DRY MOUTH" },
  ],
  aria: [
    { name: "elevated-androgens", label: "ELEVATED ANDROGENS" },
    { name: "iron-deficiency", label: "IRON DEFICIENCY" },
    { name: "dehydration", label: "DEHYDRATION" },
    { name: "mood-disruption", label: "MOOD DISRUPTION" },
    { name: "fatigue", label: "FATIGUE" },
    { name: "anxiety", label: "ANXIETY" },
    { name: "elevated-blood-pressure", label: "ELEVATED BLOOD PRESSURE" },
  ],
  breath: [
    { name: "airway-obstruction-pattern", label: "AIRWAY OBSTRUCTION PATTERN" },
    { name: "allergy", label: "ALLERGY" },
    { name: "respiratory-resonance", label: "RESPIRATORY RESONANCE" },
    { name: "breath-support", label: "BREATH SUPPORT" },
    { name: "expiratory-flow", label: "EXPIRATORY FLOW" },
    { name: "nasal-resonance", label: "NASAL RESONANCE" },
  ],
  harbor: [
    { name: "alcohol-use-pattern", label: "ALCOHOL USE PATTERN" },
    { name: "substance-use-pattern", label: "SUBSTANCE USE PATTERN" },
    { name: "emotional-destabilization", label: "EMOTIONAL DESTABILIZATION" },
    { name: "anxiety", label: "ANXIETY" },
    { name: "stress", label: "STRESS" },
    { name: "fatigue", label: "FATIGUE" },
  ],
  apex: [
    { name: "head-impact", label: "HEAD IMPACT" },
    { name: "cognitive-load", label: "COGNITIVE LOAD" },
    { name: "fatigue", label: "FATIGUE" },
    { name: "dehydration", label: "DEHYDRATION" },
    { name: "stress", label: "STRESS" },
    { name: "anxiety", label: "ANXIETY" },
    { name: "cardiovascular-strain", label: "CARDIOVASCULAR STRAIN" },
  ],
};

/**
 * Sign labels for stage 4, with the withheld signs filtered out.
 *
 * Keyed by sign id rather than held as display strings, so the suppression list
 * is what decides and the two cannot drift. Before this, the analysis screen
 * announced HEAD IMPACT during a Sports run whose results never mention it.
 */
function shownSignLabels(model: AmplifierModelName): string[] {
  return MODEL_SIGNS[model].filter((s) => !isSuppressedSign(s.name)).map((s) => s.label);
}

// Note: clarity publishes a single sign and breath two, so those two lists are
// filled out with the vocal features the sign is derived from. Every other
// model's list is the registry's own, verbatim.

/** result.audio_quality, plus the checks that gate it. */
const AUDIO_QUALITY_DETAILS = [
  "VOICE PERCENTAGE",
  "AUDIO CLARITY",
  "BACKGROUND NOISE SCREEN",
  "CLIPPING CHECK",
  "SEGMENT BOUNDARIES",
  "SAMPLE RATE VALIDATION",
];

/** vocal_features: the prosody half. */
const PROSODY_DETAILS = [
  "AVERAGE PITCH",
  "PITCH VARIABILITY",
  "AVERAGE LOUDNESS",
  "LOUDNESS VARIABILITY",
  "SPEECH RATE",
  "ARTICULATION RATE",
];

/** vocal_features: the voice-quality half. */
const VOICE_QUALITY_DETAILS = [
  "VOICE JITTER",
  "VOICE SHIMMER",
  "VOICE CLARITY (HNR)",
  "VOICE BREATHINESS",
  "MEAN PAUSE DURATION",
  "HARMONIC STRUCTURE",
];

/**
 * result.extended_metrics, per model. The longest list, for the stage that
 * absorbs the wait.
 *
 * These DO differ by model, which an earlier version of this file got wrong.
 * The claim then was that the set travels across models, inferred from a pulse
 * job alone. Calling both models on identical audio disproved it: pulse
 * returned 13 sub-dimensions and apex returned 10, and the two are not nested.
 * apex reports anhedonia, which pulse does not; pulse reports anxious mood,
 * tension, stress resilience and emotional valence, none of which apex returns.
 *
 * Each list below is the metric IDs that model actually returned, in the order
 * it returned them, with the API's own labels. A model without an observed
 * payload falls back to the pulse list and is marked as such.
 */
const EXTENDED_METRICS_BY_MODEL: Partial<Record<AmplifierModelName, string[]>> = {
  // Observed 2026-09-07, 13 metrics.
  pulse: [
    "ANXIOUS MOOD",
    "TENSION",
    "SLEEP DISTURBANCE",
    "FATIGUE",
    "CONCENTRATION",
    "PSYCHOMOTOR STATE",
    "ENERGY LEVEL",
    "MOTIVATION",
    "BURNOUT",
    "STRESS RESILIENCE",
    "EMOTIONAL VALENCE",
    "AROUSAL",
    "SENSE OF DOMINANCE",
  ],
  // Observed 2026-09-07, 10 metrics. Leads with anhedonia, which pulse omits.
  apex: [
    "ANHEDONIA",
    "SLEEP DISTURBANCE",
    "FATIGUE",
    "CONCENTRATION",
    "PSYCHOMOTOR STATE",
    "ENERGY LEVEL",
    "MOTIVATION",
    "BURNOUT",
    "AROUSAL",
    "SENSE OF DOMINANCE",
  ],
};

/**
 * Fallback for models whose extended_metrics have not been captured yet. Uses
 * the documented known IDs rather than another model's observed list, so it
 * cannot silently assert something a model does not report.
 */
const EXTENDED_METRIC_FALLBACK = [
  "SLEEP DISTURBANCE",
  "FATIGUE",
  "CONCENTRATION",
  "PSYCHOMOTOR STATE",
  "ENERGY LEVEL",
  "MOTIVATION",
  "BURNOUT",
  "AROUSAL",
];

/** result.summary. */
const SUMMARY_DETAILS = [
  "SIGNAL RANKING",
  "LEVEL THRESHOLDS",
  "FLAG COUNT",
  "RECOMMENDED ACTION",
  "BASELINE COMPARISON",
  "REPORT ASSEMBLY",
];

/**
 * The six stages, with stage 4 keyed to the model the pathway selected.
 */
export function getStageContent(model: AmplifierModelName): StageContent[] {
  return [
    { text: "ISOLATING VOCAL SIGNAL...", details: AUDIO_QUALITY_DETAILS },
    { text: "MAPPING ACOUSTIC FEATURES...", details: PROSODY_DETAILS },
    { text: "ANALYZING VOICE QUALITY...", details: VOICE_QUALITY_DETAILS },
    { text: "SCORING BIOMARKER SIGNALS...", details: shownSignLabels(model) },
    {
      text: "RESOLVING SUB-DIMENSIONS...",
      details: EXTENDED_METRICS_BY_MODEL[model] ?? EXTENDED_METRIC_FALLBACK,
    },
    { text: "COMPILING SCREENING REPORT...", details: SUMMARY_DETAILS },
  ];
}

/**
 * The detail line to show `stageElapsed` into a stage: its 1-based number and
 * its label. Loops once the list is exhausted, so a stage that runs long keeps
 * cycling rather than freezing on its last entry.
 */
export function detailAt(
  details: string[],
  stageElapsed: number,
  rotateMs: number = DETAIL_ROTATE_MS
): { index: number; number: string; label: string } {
  if (details.length === 0) return { index: 0, number: "01", label: "" };

  const ticks = Math.floor(Math.max(stageElapsed, 0) / rotateMs);
  const index = ticks % details.length;
  return {
    index,
    number: String(index + 1).padStart(2, "0"),
    label: details[index],
  };
}
