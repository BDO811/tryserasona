import { describe, it, expect } from "vitest";
import { getModelForPathway, DEFAULT_MODEL } from "@/lib/pathway-model-map";
import { HEALTH_FOCUS_TO_PATHWAY } from "@/context/AssessmentContext";
import { getStageContent } from "@/lib/analysis-stage-content";
import { getV2Classification as classificationFor } from "@/lib/v2-api-visual-mapping";

/**
 * The full chain the user's pick travels:
 *   focus card id → AssessmentPathway → Amplifier v2 model name
 * A break anywhere here silently sends every user to the wellness model.
 */
describe("health focus → pathway → v2 model", () => {
  it("routes each focus card to its own model", () => {
    const chain = (focus: string) => getModelForPathway(HEALTH_FOCUS_TO_PATHWAY[focus]);

    expect(HEALTH_FOCUS_TO_PATHWAY.cognitive).toBe("BRAIN_AGE");
    expect(chain("cognitive")).toBe("clarity");

    expect(HEALTH_FOCUS_TO_PATHWAY.longevity).toBe("LONGEVITY");
    expect(chain("longevity")).toBe("tide");

    expect(HEALTH_FOCUS_TO_PATHWAY.mood).toBe("MENTAL_HEALTH");
    expect(chain("mood")).toBe("haven");

    expect(HEALTH_FOCUS_TO_PATHWAY.reproductive).toBe("FERTILITY");
    expect(chain("reproductive")).toBe("aria");
  });

  it("gives each focus a distinct model — no two picks collapse to the same one", () => {
    const models = ["cognitive", "longevity", "mood", "reproductive"].map((f) =>
      getModelForPathway(HEALTH_FOCUS_TO_PATHWAY[f])
    );
    expect(new Set(models).size).toBe(4);
  });

  it("falls back to pulse for wellness and for an unset pathway", () => {
    expect(getModelForPathway("WELLNESS")).toBe("pulse");
    expect(getModelForPathway(null)).toBe(DEFAULT_MODEL);
    expect(DEFAULT_MODEL).toBe("pulse");
  });
});

/**
 * The two assessments this build actually offers. Wired wrong, both cards hit
 * the same model and the two assessments come back with the same signals.
 */
describe("the two live assessments", () => {
  it("routes the Wellness card to pulse and the Sports card to apex", () => {
    expect(HEALTH_FOCUS_TO_PATHWAY.wellness).toBe("WELLNESS");
    expect(getModelForPathway(HEALTH_FOCUS_TO_PATHWAY.wellness)).toBe("pulse");

    expect(HEALTH_FOCUS_TO_PATHWAY.sports).toBe("SPORTS");
    expect(getModelForPathway(HEALTH_FOCUS_TO_PATHWAY.sports)).toBe("apex");
  });

  it("does not collapse the two picks onto one model", () => {
    expect(getModelForPathway(HEALTH_FOCUS_TO_PATHWAY.wellness)).not.toBe(
      getModelForPathway(HEALTH_FOCUS_TO_PATHWAY.sports)
    );
  });

  it("keeps tide's signs off both assessments", () => {
    // Iron deficiency, metabolic load and dry mouth are tide's. They appeared
    // under the old Longevity card because that ran tide; neither live pathway
    // measures them.
    for (const focus of ["wellness", "sports"]) {
      const signs = getStageContent(getModelForPathway(HEALTH_FOCUS_TO_PATHWAY[focus]))[3].details;
      expect(signs).not.toContain("IRON DEFICIENCY");
      expect(signs).not.toContain("METABOLIC LOAD");
      expect(signs).not.toContain("DRY MOUTH");
    }
  });

  it("gives Sports all seven signs apex measures", () => {
    const signs = getStageContent(getModelForPathway(HEALTH_FOCUS_TO_PATHWAY.sports))[3].details;
    expect(signs).toHaveLength(7);
    expect(signs).toContain("COGNITIVE LOAD");
    expect(signs).toContain("CARDIOVASCULAR STRAIN");
    expect(signs).toContain("HEAD IMPACT");
  });

  it("headlines each assessment by what it measures, at every tier", () => {
    // The headline is tier-independent by design: it names the assessment, and
    // the grade is carried by the assessment scale above it plus the per-signal
    // bands below.
    for (const [pathway, expected] of [
      ["WELLNESS", "WELLNESS PROFILE"],
      ["SPORTS", "ATHLETIC PROFILE"],
    ] as const) {
      // The six levels the API documents. NO_RISK and HIGH used to appear here
      // via a translation layer that has been removed.
      for (const tier of [
        "NONE",
        "LOW",
        "CONSIDER",
        "MODERATE",
        "ELEVATED",
        "INCONCLUSIVE",
      ]) {
        const headline = classificationFor(tier, pathway);
        expect(headline).toBe(expected);
        for (const word of ["ELEVATED", "RISK", "OPTIMAL", "STABLE", "FUNCTION", "VARIANCE"]) {
          expect(headline).not.toContain(word);
        }
      }
    }
  });

  it("gives Wellness pulse's signs and none of the athletic ones", () => {
    const signs = getStageContent(getModelForPathway(HEALTH_FOCUS_TO_PATHWAY.wellness))[3].details;
    expect(signs).toContain("MOOD DISRUPTION");
    expect(signs).toContain("ELEVATED BLOOD PRESSURE");
    // apex-only signs must not appear on a pulse run.
    expect(signs).not.toContain("HEAD IMPACT");
    expect(signs).not.toContain("CARDIOVASCULAR STRAIN");
  });
});
