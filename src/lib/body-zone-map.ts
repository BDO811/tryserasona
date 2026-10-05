/**
 * Which body-map icon each real Amplifier signal, sub-dimension, and lab
 * metric belongs under.
 *
 * Every signal name across every v2 model is listed explicitly (see the model
 * registry comment in pathway-model-map.ts) rather than left to a fallback, so
 * a signal never lands in a zone nobody chose. Sub-dimensions are not listed
 * per-id: all ten (`sub-dimensions.ts`) are mental/emotional readings, so every
 * one goes to BRAIN. Lab metrics are vocal/acoustic by construction; the two
 * breath-specific ones go to LUNGS, the rest to MOUTH.
 */

export type BodyZone = "brain" | "mouth" | "heart" | "lungs" | "blood";

export const BODY_ZONES: BodyZone[] = ["brain", "mouth", "heart", "lungs", "blood"];

export const BODY_ZONE_LABEL: Record<BodyZone, string> = {
  brain: "Brain",
  mouth: "Mouth",
  heart: "Heart",
  lungs: "Lungs",
  blood: "Blood",
};

/**
 * Every signal name the v2 model registry documents, from every pathway
 * (pulse, clarity, haven, tide, aria, apex — breath and harbor are not wired
 * to a pathway today, so their sign lists are not published, and nothing here
 * depends on them).
 */
const SIGNAL_ZONE: Record<string, BodyZone> = {
  // Mental / cognitive
  "mood-disruption": "brain",
  anxiety: "brain",
  stress: "brain",
  fatigue: "brain",
  "cognitive-impairment": "brain",
  hypervigilance: "brain",
  "attention-dysregulation": "brain",
  "cognitive-load": "brain",
  "head-impact": "brain",
  // Cardiovascular
  "elevated-blood-pressure": "heart",
  "cardiovascular-strain": "heart",
  // Mouth
  "dry-mouth": "mouth",
  // Blood / metabolic / hormonal
  dehydration: "blood",
  "iron-deficiency": "blood",
  "elevated-androgens": "blood",
  "metabolic-load": "blood",
};

/**
 * A signal name this build has not seen goes to Brain: most Amplifier signals
 * are mental/cognitive reads, so it is the least-wrong default, and a signal
 * landing in the wrong group is a display issue, not a data one — bandForSignal
 * and the flag count are unaffected either way.
 */
export function zoneForSignal(name: string | null | undefined): BodyZone {
  const key = (name || "").toLowerCase();
  return SIGNAL_ZONE[key] ?? "brain";
}

/** Every sub-dimension in sub-dimensions.ts is a mental/emotional reading. */
export function zoneForSubDimension(): BodyZone {
  return "brain";
}

/** LabMetric.label strings that read as breath rather than vocal cord/articulation. */
const LUNGS_LAB_LABELS = new Set(["PAUSE", "BREATHINESS"]);

/**
 * Every other lab metric (pitch, loudness, speech rate, jitter, shimmer, HNR,
 * ...) is a vocal-tract measurement, so Mouth is the default rather than a
 * named list that would need updating each time a new acoustic feature ships.
 */
export function zoneForLabMetric(label: string | null | undefined): BodyZone {
  const key = (label || "").toUpperCase();
  return LUNGS_LAB_LABELS.has(key) ? "lungs" : "mouth";
}
