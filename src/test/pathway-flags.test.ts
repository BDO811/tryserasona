import { describe, it, expect } from "vitest";
import { isPathwayEnabled, isAssessmentPathwayEnabled } from "@/lib/utils";

/**
 * Regression guard for the "ANALYSIS FAILED" bug.
 *
 * The pathway flags used to require an explicit "true". `.env` is gitignored,
 * so on any fresh checkout or deploy target the four non-wellness pathways were
 * silently disabled: the focus card still rendered, the user recorded, and
 * processAudioAnalysis bailed before ever calling the API. Missing must mean
 * enabled; only an explicit "false" disables.
 */
describe("pathway feature flags default to enabled", () => {
  it("enables every health focus when no env vars are set", () => {
    for (const id of ["cognitive", "mood", "longevity", "reproductive", "wellness"]) {
      expect(isPathwayEnabled(id)).toBe(true);
    }
  });

  it("enables every AssessmentPathway the analysis step checks", () => {
    for (const p of ["BRAIN_AGE", "MENTAL_HEALTH", "LONGEVITY", "FERTILITY", "WELLNESS"]) {
      expect(isAssessmentPathwayEnabled(p)).toBe(true);
    }
  });

  it("still rejects a null pathway", () => {
    expect(isAssessmentPathwayEnabled(null)).toBe(false);
  });
});
