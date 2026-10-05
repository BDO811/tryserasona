import { AssessmentPathway } from "@/context/AssessmentContext";
import { bandColor, bandOfLevel, type Surface } from "@/lib/signal-band";

export function getProtocolId(pathway: AssessmentPathway): string {
  if (pathway === "BRAIN_AGE") return "COGNITIVE-01";
  if (pathway === "LONGEVITY") return "RESPIRATORY-01";
  if (pathway === "MENTAL_HEALTH") return "AFFECTIVE-01";
  if (pathway === "FERTILITY") return "HORMONAL-01";
  if (pathway === "WELLNESS") return "WELLNESS-01";
  if (pathway === "SPORTS") return "ATHLETIC-01";
  return "BIOMETRIC-01";
}

/**
 * Colour for `summary.overall_level`, taken from the same documented UI
 * treatment the per-signal levels use, so the headline and the rows agree.
 *
 * The old ramp was off-brand and off-spec: emerald #10B981, amber #F59E0B, red
 * #EF4444, plus #84CC16 for the LOW tier, a lime green the design canon bans.
 * It also assumed a dark ground while both report screens sit on beige, where
 * #F59E0B measures 1.9:1.
 */
export function getStatusColorFromLikelihoodTier(
  tier: string,
  surface: Surface = "light"
): string {
  return bandColor(bandOfLevel(tier), surface);
}