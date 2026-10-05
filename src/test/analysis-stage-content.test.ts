import { describe, expect, it } from "vitest";
import {
  DETAIL_ROTATE_MS,
  detailAt,
  getStageContent,
} from "@/lib/analysis-stage-content";
import type { AmplifierModelName } from "@/lib/pathway-model-map";
import { TOTAL_STAGES } from "@/lib/analysis-pacing";

const ALL_MODELS: AmplifierModelName[] = [
  "pulse",
  "clarity",
  "haven",
  "tide",
  "aria",
  "breath",
  "harbor",
  "apex",
];

describe("getStageContent", () => {
  it("covers every stage for every model", () => {
    for (const model of ALL_MODELS) {
      expect(getStageContent(model)).toHaveLength(TOTAL_STAGES);
    }
  });

  it("gives every stage enough detail lines to rotate", () => {
    // Five rather than six: withholding a sign legitimately shortens a model's
    // stage-4 list, and pulse publishes exactly six signs of which one is
    // suppressed. Padding it would mean inventing a sign.
    for (const model of ALL_MODELS) {
      for (const stage of getStageContent(model)) {
        expect(stage.details.length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("names every sign its model measures, withholding none", () => {
    // Suppression is empty, so stage 4 announces the model's full sign list.
    expect(getStageContent("pulse")[3].details).toContain("ELEVATED BLOOD PRESSURE");
    expect(getStageContent("apex")[3].details).toContain("HEAD IMPACT");
  });

  it("has no blank or duplicate lines within a stage", () => {
    for (const model of ALL_MODELS) {
      for (const stage of getStageContent(model)) {
        for (const detail of stage.details) {
          expect(detail.trim()).not.toBe("");
        }
        expect(new Set(stage.details).size).toBe(stage.details.length);
      }
    }
  });

  it("names the signs the chosen model actually measures", () => {
    // haven is behavioural: it must not claim to be reading blood pressure.
    const haven = getStageContent("haven")[3].details;
    expect(haven).toContain("HYPERVIGILANCE");
    expect(haven).toContain("ATTENTION DYSREGULATION");
    expect(haven).not.toContain("ELEVATED BLOOD PRESSURE");

    // tide is cardiometabolic: it must not claim to be reading mood.
    const tide = getStageContent("tide")[3].details;
    expect(tide).toContain("METABOLIC LOAD");
    expect(tide).toContain("IRON DEFICIENCY");
    expect(tide).not.toContain("MOOD DISRUPTION");
  });

  it("names the sub-dimensions each model actually returns", () => {
    // Calling both models on identical audio showed extended_metrics are not
    // shared: apex returns anhedonia and no anxious mood, pulse the reverse.
    const pulse = getStageContent("pulse")[4].details;
    const apex = getStageContent("apex")[4].details;

    expect(pulse).toContain("ANXIOUS MOOD");
    expect(pulse).toContain("STRESS RESILIENCE");
    expect(pulse).toContain("EMOTIONAL VALENCE");
    expect(pulse).not.toContain("ANHEDONIA");

    expect(apex).toContain("ANHEDONIA");
    expect(apex).not.toContain("ANXIOUS MOOD");
    expect(apex).not.toContain("STRESS RESILIENCE");
    expect(apex).not.toContain("EMOTIONAL VALENCE");
  });

  it("gives the elastic stage the longest list", () => {
    // Stage 5 absorbs a slow job's overrun, so it needs the most to say.
    for (const model of ALL_MODELS) {
      const stages = getStageContent(model);
      const elastic = stages[4].details.length;
      for (const [index, stage] of stages.entries()) {
        if (index === 4) continue;
        expect(elastic).toBeGreaterThanOrEqual(stage.details.length);
      }
    }
  });

  it("does not mention a diagnosis or promise a result", () => {
    const banned = ["diagnos", "cure", "treat", "disease", "severity"];
    for (const model of ALL_MODELS) {
      for (const stage of getStageContent(model)) {
        const text = [stage.text, ...stage.details].join(" ").toLowerCase();
        for (const word of banned) {
          expect(text).not.toContain(word);
        }
      }
    }
  });
});

describe("detailAt", () => {
  const details = ["ONE", "TWO", "THREE"];

  it("starts on the first line, numbered 01", () => {
    const first = detailAt(details, 0);
    expect(first.index).toBe(0);
    expect(first.number).toBe("01");
    expect(first.label).toBe("ONE");
  });

  it("advances one line per rotation interval", () => {
    expect(detailAt(details, DETAIL_ROTATE_MS).number).toBe("02");
    expect(detailAt(details, DETAIL_ROTATE_MS * 2).number).toBe("03");
  });

  it("holds a line for the whole interval", () => {
    expect(detailAt(details, DETAIL_ROTATE_MS - 1).number).toBe("01");
  });

  it("loops rather than freezing when a stage runs long", () => {
    const looped = detailAt(details, DETAIL_ROTATE_MS * 3);
    expect(looped.index).toBe(0);
    expect(looped.number).toBe("01");
  });

  it("zero-pads to two digits", () => {
    const long = Array.from({ length: 12 }, (_, i) => `ITEM${i}`);
    expect(detailAt(long, 0).number).toBe("01");
    expect(detailAt(long, DETAIL_ROTATE_MS * 9).number).toBe("10");
  });

  it("survives an empty list", () => {
    expect(detailAt([], 5_000)).toEqual({ index: 0, number: "01", label: "" });
  });

  it("treats negative elapsed time as the start", () => {
    expect(detailAt(details, -500).number).toBe("01");
  });
});
