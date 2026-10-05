/**
 * Maps the health focus the user picks in triage to the Amplifier v2 model
 * that actually measures it.
 *
 * Each v2 model is a curated pipeline over a specific set of signs. Sending
 * every pathway to `pulse` (the wellness model) would return wellness signals
 * regardless of what the user asked about, so the pathway has to select the
 * model. Sign lists below are the models' own, from the v2 model registry.
 */

import { AssessmentPathway } from "@/context/AssessmentContext";

export type AmplifierModelName =
  | "pulse"
  | "clarity"
  | "haven"
  | "tide"
  | "aria"
  | "breath"
  | "harbor"
  | "apex";

/**
 * pulse    mood-disruption, anxiety, stress, fatigue, dehydration, elevated-blood-pressure
 * clarity  cognitive-impairment
 * haven    mood-disruption, anxiety, stress, hypervigilance, attention-dysregulation, fatigue
 * tide     elevated-blood-pressure, metabolic-load, dehydration, iron-deficiency, fatigue, dry-mouth
 * aria     elevated-androgens, iron-deficiency, dehydration, mood-disruption, fatigue, anxiety,
 *          elevated-blood-pressure
 * apex     head-impact, cognitive-load, fatigue, dehydration, stress, anxiety,
 *          cardiovascular-strain
 *
 * Note on overlap: a model is a curated bundle of signs, not a separate engine.
 * Signs shared between two models return the same score for the same audio —
 * verified against the live API, where one clip scored fatigue 0.390 and
 * anxiety 0.570 under both pulse and apex. Two assessments therefore differ by
 * which signs they report, not by rescoring the shared ones.
 */
const PATHWAY_TO_MODEL: Record<NonNullable<AssessmentPathway>, AmplifierModelName> = {
  // Brain Health — Focus & Memory
  BRAIN_AGE: "clarity",
  // Longevity / Performance — metabolic and cellular-aging read
  LONGEVITY: "tide",
  // Mental State — Stress & Mood
  MENTAL_HEALTH: "haven",
  // Fertility / Menopause / Male Vitality — hormonal read
  FERTILITY: "aria",
  // General wellness screening
  WELLNESS: "pulse",
  // Athletic readiness — training load, recovery and impact
  SPORTS: "apex",
};

export const DEFAULT_MODEL: AmplifierModelName = "pulse";

export function getModelForPathway(pathway: AssessmentPathway): AmplifierModelName {
  if (!pathway) return DEFAULT_MODEL;
  return PATHWAY_TO_MODEL[pathway] ?? DEFAULT_MODEL;
}
