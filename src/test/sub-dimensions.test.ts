import { describe, expect, it } from "vitest";
import {
  SUB_DIMENSIONS,
  bandIndexFor,
  configFor,
  readableSubDimensions,
} from "@/lib/sub-dimensions";
import type { ExtendedMetric } from "@/lib/result-types";

/** The ten sub-dimensions a real apex run returned, with their true anchors. */
const APEX_RUN: ExtendedMetric[] = [
  { metric_id: "anhedonia", label: "Anhedonia", score_mean: 0.4919, score_std: 0.0617, low_anchor: "engaged", high_anchor: "disengaged" },
  { metric_id: "sleep-disturbance", label: "Sleep Disturbance", score_mean: 0.534, score_std: 0.0721, low_anchor: "rested", high_anchor: "sluggish" },
  { metric_id: "fatigue", label: "Fatigue", score_mean: 0.4966, score_std: 0.0577, low_anchor: "invigorated", high_anchor: "exhausted" },
  { metric_id: "concentration", label: "Concentration", score_mean: 0.4231, score_std: 0.0713, low_anchor: "focused", high_anchor: "inattentive" },
  { metric_id: "psychomotor-state", label: "Psychomotor State", score_mean: 0.4404, score_std: 0.0351, low_anchor: "calm", high_anchor: "frantic" },
  { metric_id: "energy-level", label: "Energy Level", score_mean: 0.4854, score_std: 0.0591, low_anchor: "exuberant", high_anchor: "spiritless" },
  { metric_id: "motivation", label: "Motivation", score_mean: 0.4133, score_std: 0.075, low_anchor: "driven", high_anchor: "unmotivated" },
  { metric_id: "burnout", label: "Burnout", score_mean: 0.4831, score_std: 0.0601, low_anchor: "engaged", high_anchor: "burned out" },
  { metric_id: "vad-arousal", label: "Arousal", score_mean: 0.4312, score_std: 0.044, low_anchor: "calm", high_anchor: "activated" },
  { metric_id: "vad-dominance", label: "Sense of Dominance", score_mean: 0.4678, score_std: 0.0425, low_anchor: "submissive", high_anchor: "dominant" },
];

describe("bandIndexFor", () => {
  it("puts 0.40 to 0.60 inclusive in the middle band", () => {
    expect(bandIndexFor(0.4)).toBe(1);
    expect(bandIndexFor(0.5)).toBe(1);
    expect(bandIndexFor(0.6)).toBe(1);
  });

  it("reads below 0.40 as the low word and above 0.60 as the high word", () => {
    expect(bandIndexFor(0.399)).toBe(0);
    expect(bandIndexFor(0.0)).toBe(0);
    expect(bandIndexFor(0.601)).toBe(2);
    expect(bandIndexFor(1.0)).toBe(2);
  });

  it("falls to the middle on a non-numeric score rather than claiming an end", () => {
    expect(bandIndexFor(Number.NaN)).toBe(1);
  });
});

describe("SUB_DIMENSIONS config", () => {
  it("covers every metric the apex run returned", () => {
    for (const metric of APEX_RUN) {
      expect(configFor(metric.metric_id), metric.metric_id).toBeDefined();
    }
  });

  it("gives every metric three level words", () => {
    for (const config of SUB_DIMENSIONS) {
      expect(config.levels).toHaveLength(3);
      for (const word of config.levels) expect(word.trim()).not.toBe("");
    }
  });

  it("uses no level word on more than one metric", () => {
    // Two rows reading the same word would look like the same measure twice.
    const shown = SUB_DIMENSIONS.filter((d) => d.shown);
    const words = shown.flatMap((d) => d.levels.filter((w) => w !== "STEADY" && w !== "NORMAL"));
    expect(new Set(words).size).toBe(words.length);
  });

  it("keeps the clinical term off the labels it was replaced on", () => {
    const labels = SUB_DIMENSIONS.filter((d) => d.shown).map((d) => d.label);
    // Anhedonia is retained deliberately, paired with a plain word.
    expect(labels).toContain("Happiness/Anhedonia");
  });

  it("names the fatigue sub-dimension apart from the fatigue signal", () => {
    // Both come back on one recording on different scales, 0.128 as a signal
    // and 0.497 here, so sharing the word would put two numbers under one name.
    expect(configFor("fatigue")?.label).not.toBe("Fatigue");
  });

  it("hides both VAD dimensions, since neither has a bad end", () => {
    for (const id of ["vad-dominance", "vad-arousal"]) {
      expect(configFor(id)?.shown, id).toBe(false);
      expect(configFor(id)?.neutral, id).toBe(true);
    }
  });

  it("uses NORMAL as the middle word on every metric", () => {
    for (const config of SUB_DIMENSIONS) {
      expect(config.levels[1], config.id).toBe("NORMAL");
    }
  });

  it("orders the level words low score to high score, matching the anchors", () => {
    // The triads are written in anchor order so no direction flag is needed.
    // Fatigue: invigorated at 0.0 is ENERGETIC, exhausted at 1.0 is TIRED.
    expect(configFor("fatigue")?.levels).toEqual(["ENERGETIC", "NORMAL", "TIRED"]);
    expect(configFor("sleep-disturbance")?.levels[0]).toBe("RECOVERED");
    expect(configFor("sleep-disturbance")?.levels[2]).toBe("UNDER-RECOVERED");
  });
});

describe("readableSubDimensions", () => {
  const rows = readableSubDimensions(APEX_RUN);

  it("drops the hidden metrics and keeps the rest", () => {
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.id)).not.toContain("vad-dominance");
    expect(rows.map((r) => r.id)).not.toContain("vad-arousal");
  });

  it("renders in configured order, not the order the API returned", () => {
    // Otherwise the screen would reorder itself between recordings.
    expect(rows[0].id).toBe("sleep-disturbance");
    expect(rows[1].id).toBe("fatigue");
  });

  it("reads every metric on this run as the middle word", () => {
    // Every sub-dimension here landed between 0.413 and 0.534, which is why the
    // band is 0.40-0.60 rather than equal thirds: with thirds this would be the
    // permanent state, and with a tighter band it would flip on segment noise.
    for (const row of rows) {
      expect(row.bandIndex, row.id).toBe(1);
    }
  });

  it("picks the word matching the band", () => {
    const recovery = rows.find((r) => r.id === "sleep-disturbance")!;
    expect(recovery.level).toBe("NORMAL");
    expect(recovery.scoreMean).toBeCloseTo(0.534, 4);
  });

  it("moves to the end words when a score clears the band", () => {
    const tired = readableSubDimensions([{ ...APEX_RUN[2], score_mean: 0.81 }]);
    expect(tired[0].level).toBe("TIRED");
    const energetic = readableSubDimensions([{ ...APEX_RUN[2], score_mean: 0.12 }]);
    expect(energetic[0].level).toBe("ENERGETIC");
  });

  it("returns nothing when extended_metrics is empty", () => {
    // The API returns [] when voice percentage is below its threshold.
    expect(readableSubDimensions([])).toEqual([]);
    expect(readableSubDimensions(undefined)).toEqual([]);
  });

  it("ignores a metric it has no config for", () => {
    // A new metric appearing upstream must not reach the screen with wording
    // nobody chose.
    const unknown: ExtendedMetric = {
      metric_id: "brand-new-metric",
      label: "Brand New",
      score_mean: 0.9,
      score_std: 0.01,
      low_anchor: "a",
      high_anchor: "b",
    };
    expect(readableSubDimensions([unknown])).toEqual([]);
  });
});
