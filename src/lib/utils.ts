import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Feature flag mapping for all pathways
 * Maps both pathway IDs and AssessmentPathway values to their corresponding environment variables
 */
const PATHWAY_FEATURE_FLAGS: Record<string, string | undefined> = {
  // Pathway IDs (used in TriageFlow)
  cognitive: import.meta.env.VITE_COGNITIVE_BRAIN_HEALTH_ENABLED,
  mood: import.meta.env.VITE_COGNITIVE_MENTAL_HEALTH_ENABLED,
  longevity: import.meta.env.VITE_WELLNESS_LONGEVITY_ENABLED,
  reproductive: import.meta.env.VITE_WELLNESS_FERTILITY_ENABLED,
  wellness: "true", // Always enabled for this instance
  sports: "true", // Always enabled for this instance
  // AssessmentPathway values (used in AudioVisualizer, AnalysisAnimation)
  BRAIN_AGE: import.meta.env.VITE_COGNITIVE_BRAIN_HEALTH_ENABLED,
  MENTAL_HEALTH: import.meta.env.VITE_COGNITIVE_MENTAL_HEALTH_ENABLED,
  LONGEVITY: import.meta.env.VITE_WELLNESS_LONGEVITY_ENABLED,
  FERTILITY: import.meta.env.VITE_WELLNESS_FERTILITY_ENABLED,
  WELLNESS: "true", // Always enabled for this instance
  SPORTS: "true", // Always enabled for this instance
};

/**
 * A pathway is enabled unless its flag is explicitly "false".
 *
 * These flags previously required an explicit "true", which meant an unset env
 * var silently disabled the pathway. Because `.env` is gitignored, that state
 * was the default on every fresh checkout and deploy target: the health-focus
 * card was offered, the user picked it, and processAudioAnalysis then bailed
 * with a bare "ANALYSIS FAILED" before ever calling the API. Opt-out is the
 * safer default — turning a pathway off is a deliberate act, and forgetting to
 * set a variable should not break the product.
 */
function isFlagEnabled(flagValue: string | undefined): boolean {
  return String(flagValue ?? "true").toLowerCase() !== "false";
}

/**
 * Check if a pathway is enabled based on feature flags
 * @param pathwayId - The health focus ID (cognitive, mood, longevity, reproductive)
 * @returns boolean indicating if the pathway is enabled
 */
export function isPathwayEnabled(pathwayId: string): boolean {
  return isFlagEnabled(PATHWAY_FEATURE_FLAGS[pathwayId]);
}

/**
 * Check if an AssessmentPathway is enabled based on feature flags
 * @param pathway - The AssessmentPathway (BRAIN_AGE, MENTAL_HEALTH, LONGEVITY, FERTILITY)
 * @returns boolean indicating if the pathway is enabled
 */
export function isAssessmentPathwayEnabled(pathway: string | null): boolean {
  if (!pathway) return false;
  return isFlagEnabled(PATHWAY_FEATURE_FLAGS[pathway]);
}

/**
 * Global developer-mode flag
 * Uses VITE_DEVELOPER_MODE to gate non-production features/tools.
 */
export function isDeveloperModeEnabled(): boolean {
  return String(import.meta.env.VITE_DEVELOPER_MODE).toLowerCase() === "true";
}
