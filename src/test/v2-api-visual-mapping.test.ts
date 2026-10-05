import { describe, it, expect } from "vitest";
import {
  isV2Result,
  transformV2ResultToVisualization,
  V2JobDetail,
} from "@/lib/v2-api-visual-mapping";
import { formatLikelihoodTierForDisplay } from "@/lib/result-types";
import { getStatusColorFromLikelihoodTier } from "@/lib/assessment-display-utils";
import { bandColor, bandOfLevel } from "@/lib/signal-band";

// A real, unedited response from the deployed analyzeAudio Cloud Function
// (Amplifier v2 API, model "pulse") captured 2026-09-05 against a 36s sample.
import realPulseResponse from "./fixtures-v2-pulse-response.json";

const job = realPulseResponse as unknown as V2JobDetail;

describe("v2 result detection", () => {
  it("recognises a v2 payload", () => {
    expect(isV2Result(job.result)).toBe(true);
  });

  it("does not mistake a legacy v1 payload for v2", () => {
    const v1 = { explanations: { feature_explanations: { features: {}, error: null, status: "ok" } } };
    expect(isV2Result(v1)).toBe(false);
  });
});

describe("overall_level carried through as the tier", () => {
  const tierFor = (level: string) =>
    transformV2ResultToVisualization(
      {
        job_id: "j",
        status: "done",
        created_at: "2026-09-08T00:00:00Z",
        result: {
          summary: { overall_level: level, flagged_signs: [], primary_signals: [] },
          signals: [],
          extended_metrics: [],
          audio_quality: { voice_percentage: 90, audio_clarity: 90, issues: [] },
        },
      } as never,
      "WELLNESS"
    ).likelihoodTier;

  it("keeps all six documented levels distinct", () => {
    // consider and moderate used to both arrive as MODERATE.
    const tiers = ["none", "low", "consider", "moderate", "elevated", "inconclusive"].map(tierFor);
    expect(tiers).toEqual([
      "NONE",
      "LOW",
      "CONSIDER",
      "MODERATE",
      "ELEVATED",
      "INCONCLUSIVE",
    ]);
    expect(new Set(tiers).size).toBe(6);
  });

  it("invents no level the API does not return", () => {
    // NO_RISK and HIGH were not levels, so bandOfLevel could not recognise
    // them: `none` and `elevated` both coloured as inconclusive grey.
    for (const tier of ["none", "low", "consider", "moderate", "elevated"].map(tierFor)) {
      expect(bandOfLevel(tier)).not.toBe("INCONCLUSIVE");
    }
    expect(getStatusColorFromLikelihoodTier(tierFor("none"))).toBe(bandColor("NORMAL", "light"));
    expect(getStatusColorFromLikelihoodTier(tierFor("elevated"))).toBe(
      bandColor("ELEVATED", "light")
    );
    expect(getStatusColorFromLikelihoodTier(tierFor("consider"))).not.toBe(
      getStatusColorFromLikelihoodTier(tierFor("moderate"))
    );
  });

  it("gives each level its own display wording", () => {
    const words = ["none", "low", "consider", "moderate", "elevated", "inconclusive"]
      .map(tierFor)
      .map(formatLikelihoodTierForDisplay);
    expect(new Set(words).size).toBe(6);
    expect(formatLikelihoodTierForDisplay(tierFor("moderate"))).toBe("Continue to Monitor");
  });

  it("reads inconclusive when the summary has no level at all", () => {
    expect(tierFor("")).toBe("INCONCLUSIVE");
  });
});

describe("transformV2ResultToVisualization on a real pulse response", () => {
  const visualized = transformV2ResultToVisualization(job, "WELLNESS");

  it("counts flags over the signals it shows", () => {
    // Nothing is suppressed, so the count matches what pulse measured.
    expect(visualized.totalSignals).toBe(6);
    expect(visualized.flaggedCount).toBe(5);
  });

  it("carries job metadata through", () => {
    expect(visualized.jobId).toBe("36a1f294-376e-45f6-9f34-6bbc3a6059c3");
    expect(visualized.status).toBe("done");
    expect(visualized.modelName).toBe("pulse");
  });

  it("derives the tier from the summary's overall level", () => {
    // overall_level on this sample is "moderate"
    expect(visualized.likelihoodTier).toBe("MODERATE");
  });

  it("names the subject in the headline and leaves the grade to the scale", () => {
    // The grade is lit on the assessment scale directly above this line, so
    // repeating it here produced "WELLNESS PROFILE NEEDS IMPROVEMENT" beneath a
    // lit NEEDS IMPROVEMENT.
    expect(visualized.classification).toBe("WELLNESS PROFILE");
    for (const word of ["ELEVATED", "RISK", "OPTIMAL", "STABLE"]) {
      expect(visualized.classification).not.toContain(word);
    }
  });

  it("grades on the levels of every signal returned", () => {
    // elevated-blood-pressure reads low here, the docs' "Faint indicator", and
    // is the only unflagged signal. It is no longer withheld, so it counts.
    expect(visualized.headlineRung).toBe("steady");
  });

  it("maps all six pulse signals into biomarkers, in the order returned", () => {
    expect(visualized.biomarkers).toHaveLength(6);
    expect(visualized.signals).toHaveLength(6);
    // elevated-blood-pressure is a documented standalone sign and is shown.
    expect(visualized.signals?.map((s) => s.name)).toContain("elevated-blood-pressure");
    // every biomarker has real display copy, not a placeholder
    for (const b of visualized.biomarkers) {
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.definition.length).toBeGreaterThan(20);
      expect(b.value).toMatch(/^\d+$/);
      expect(b.unit).toBe("%");
    }
  });

  it("maps all eleven vocal features into lab metrics with reference ranges", () => {
    expect(visualized.labMetrics).toHaveLength(11);
    const hnr = visualized.labMetrics.find((m) => m.label === "HNR");
    expect(hnr).toBeDefined();
    expect(hnr?.unit).toBe("dB");
    expect(hnr?.value).toBe("9.41");
    expect(hnr?.reference).toBe("> 7 dB");
    // "slightly elevated" must not be read as "within range"
    expect(hnr?.status).toBe("elevated");

    const pitch = visualized.labMetrics.find((m) => m.label === "PITCH");
    expect(pitch?.status).toBe("normal");
    expect(pitch?.value).toBe("170");
  });

  it("passes the thirteen extended metrics through", () => {
    expect(visualized.extendedMetrics).toHaveLength(13);
    const fatigue = visualized.extendedMetrics?.find((m) => m.metric_id === "fatigue");
    expect(fatigue?.low_anchor).toBe("invigorated");
    expect(fatigue?.high_anchor).toBe("exhausted");
  });

  it("composes the sentence from the signals it shows, not the API narrative", () => {
    // The docs say summary.description.summary is not patient-facing, and on a
    // real run it named a sign the job never measured.
    expect(visualized.clinicalSubtext).toBe(
      "5 of 6 voice signals were flagged: Fatigue, Stress, Dehydration, Mood Disruption and Anxiety."
    );
    expect(visualized.clinicalSubtext).not.toContain("elevated signals");
    expect(visualized.clinicalSubtext).not.toContain("warrant further review");
  });

  it("reports the flagged count as the key stat", () => {
    expect(visualized.flaggedCount).toBe(5);
    expect(visualized.totalSignals).toBe(6);
    expect(visualized.keyStat).toEqual({
      label: "Signals Flagged",
      value: "5",
      suffix: " / 6",
    });
  });

  it("maps audio quality into signal quality", () => {
    // v2 reports voice_percentage as 0-100; the report screens multiply by 100,
    // so the mapper must hand them the 0-1 fraction (96.5% must not render 9650%).
    expect(visualized.signalQuality?.voicePercentage).toBeCloseTo(0.965, 4);
    expect(visualized.signalQuality?.audioClarity).toBe(96.4);
    expect(visualized.signalQuality?.sampleRate).toBe("48kHz");
    expect(visualized.signalQuality?.duration).toBeCloseTo(36.506, 2);
    expect(visualized.signalQuality?.issues).toEqual([]);
  });
});

describe("condition jobs (singular signal, no summary)", () => {
  const conditionJob: V2JobDetail = {
    job_id: "cond-1",
    status: "done",
    created_at: "2026-09-05T00:00:00",
    job_type: "condition",
    result: {
      signal: {
        name: "fatigue",
        label: "Fatigue",
        score: 0.72,
        level: "elevated",
        flagged: true,
        description: {
          vocal_features: [
            {
              feature: "voice_jitter",
              label: "Voice Jitter",
              value: 1.4,
              unit: "%",
              value_interpretation: "elevated",
            },
          ],
        },
      },
      audio_quality: { voice_percentage: 88.1, audio_clarity: 91.2, issues: [] },
      extended_metrics: [],
    },
  };

  it("handles the singular signal shape", () => {
    const v = transformV2ResultToVisualization(conditionJob, "WELLNESS");
    expect(v.likelihoodTier).toBe("ELEVATED");
    expect(v.biomarkers).toHaveLength(1);
    expect(v.labMetrics).toHaveLength(1);
    expect(v.flaggedCount).toBe(1);
    expect(v.totalSignals).toBe(1);
    expect(v.clinicalSubtext).toContain("Fatigue");
  });
});

describe("inconclusive / low-quality audio", () => {
  it("returns an inconclusive tier and no crash when signals are empty", () => {
    const v = transformV2ResultToVisualization(
      {
        job_id: "j",
        status: "done",
        result: {
          signals: [],
          extended_metrics: [],
          audio_quality: { voice_percentage: 4.2, audio_clarity: 20, issues: ["low_voice_percentage"] },
        },
      },
      "WELLNESS"
    );
    expect(v.likelihoodTier).toBe("INCONCLUSIVE");
    expect(v.biomarkers).toHaveLength(0);
    // The failure screen names the reason from these codes, so they must survive
    // the transform rather than being flattened into a sentence.
    expect(v.signalQuality?.issues).toEqual(["low_voice_percentage"]);
  });
});
