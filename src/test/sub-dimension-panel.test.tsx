import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubDimensionPanel } from "@/components/report/SubDimensionPanel";
import type { ExtendedMetric } from "@/lib/result-types";

/** A real apex run, plus the two hidden VAD dimensions. */
const APEX_RUN: ExtendedMetric[] = [
  { metric_id: "sleep-disturbance", label: "Sleep Disturbance", score_mean: 0.534, score_std: 0.0721, low_anchor: "rested", high_anchor: "sluggish" },
  { metric_id: "fatigue", label: "Fatigue", score_mean: 0.4966, score_std: 0.0577, low_anchor: "invigorated", high_anchor: "exhausted" },
  { metric_id: "anhedonia", label: "Anhedonia", score_mean: 0.4919, score_std: 0.0617, low_anchor: "engaged", high_anchor: "disengaged" },
  { metric_id: "energy-level", label: "Energy Level", score_mean: 0.4854, score_std: 0.0591, low_anchor: "exuberant", high_anchor: "spiritless" },
  { metric_id: "burnout", label: "Burnout", score_mean: 0.4831, score_std: 0.0601, low_anchor: "engaged", high_anchor: "burned out" },
  { metric_id: "psychomotor-state", label: "Psychomotor State", score_mean: 0.4404, score_std: 0.0351, low_anchor: "calm", high_anchor: "frantic" },
  { metric_id: "concentration", label: "Concentration", score_mean: 0.4231, score_std: 0.0713, low_anchor: "focused", high_anchor: "inattentive" },
  { metric_id: "motivation", label: "Motivation", score_mean: 0.4133, score_std: 0.075, low_anchor: "driven", high_anchor: "unmotivated" },
  { metric_id: "vad-arousal", label: "Arousal", score_mean: 0.4312, score_std: 0.044, low_anchor: "calm", high_anchor: "activated" },
  { metric_id: "vad-dominance", label: "Sense of Dominance", score_mean: 0.4678, score_std: 0.0425, low_anchor: "submissive", high_anchor: "dominant" },
];

const panel = (metrics: ExtendedMetric[] | undefined) =>
  render(<SubDimensionPanel metrics={metrics} showContent />);

describe("SubDimensionPanel", () => {
  it("renders one row per shown sub-dimension", () => {
    panel(APEX_RUN);
    for (const label of [
      "Recovery",
      "Energy",
      "Happiness/Anhedonia",
      "Vitality",
      "Freshness",
      "Composure",
      "Focus",
      "Drive",
    ]) {
      expect(screen.getByText(label), label).toBeInTheDocument();
    }
  });

  it("keeps the hidden dimensions off the screen", () => {
    panel(APEX_RUN);
    expect(screen.queryByText("Activation")).toBeNull();
    expect(screen.queryByText("Sense of Dominance")).toBeNull();
  });

  it("shows all three words per row, with the reading marked current", () => {
    panel([APEX_RUN[1]]);
    for (const word of ["ENERGETIC", "NORMAL", "TIRED"]) {
      expect(screen.getByText(word), word).toBeInTheDocument();
    }
    // 0.4966 is inside the 0.40-0.60 band.
    expect(screen.getByText("NORMAL")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("TIRED")).not.toHaveAttribute("aria-current");
  });

  it("moves the marked word when the score clears the band", () => {
    panel([{ ...APEX_RUN[1], score_mean: 0.83 }]);
    expect(screen.getByText("TIRED")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("NORMAL")).not.toHaveAttribute("aria-current");
  });

  it("shows the segment spread next to the score", () => {
    // It is why the middle band is 0.40-0.60 rather than tighter.
    panel([APEX_RUN[0]]);
    expect(screen.getByText("0.53")).toBeInTheDocument();
    expect(screen.getByText("±0.07")).toBeInTheDocument();
  });

  it("keeps each word's colour tied to its meaning, not its position", () => {
    panel([APEX_RUN[1]]);
    const rgb = (el: HTMLElement) => getComputedStyle(el).color;
    // Blue at the favourable anchor, green in the middle, red at the far end.
    expect(rgb(screen.getByText("ENERGETIC"))).toBe("rgb(153, 228, 255)");
    expect(rgb(screen.getByText("NORMAL"))).toBe("rgb(76, 175, 110)");
    expect(rgb(screen.getByText("TIRED"))).toBe("rgb(255, 97, 115)");
  });

  it("draws the unfavourable word first, so red is left and green is right", () => {
    // Config order runs low score to high score to match the API's anchors.
    // Drawing follows every other scale on the page instead.
    const { container } = panel([APEX_RUN[1]]);
    const cells = [...container.querySelectorAll('[role="group"] > span')].map(
      (c) => c.textContent
    );
    expect(cells).toEqual(["TIRED", "NORMAL", "ENERGETIC"]);
  });

  it("holds the unlit cells at 80% rather than the half-opacity default", () => {
    panel([APEX_RUN[1]]);
    expect(getComputedStyle(screen.getByText("NORMAL")).opacity).toBe("1");
    for (const word of ["ENERGETIC", "TIRED"]) {
      expect(getComputedStyle(screen.getByText(word)).opacity, word).toBe("0.8");
    }
  });

  it("lays out one column, since the chassis width is not the viewport width", () => {
    // A md:grid-cols-2 layout clipped ten of twenty-four cells at 1280px: the
    // chassis stays narrow, so a wider window halved the cell instead.
    const { container } = panel(APEX_RUN);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).not.toContain("grid-cols-2");
    expect(wrapper.className).toContain("flex-col");
  });

  it("renders nothing when the API returned no extended metrics", () => {
    // It returns [] when voice percentage is below its threshold.
    const { container } = panel([]);
    expect(container).toBeEmptyDOMElement();
    const absent = panel(undefined);
    expect(absent.container).toBeEmptyDOMElement();
  });

  it("renders nothing for metrics it has no config for", () => {
    const { container } = panel([
      { metric_id: "brand-new", label: "Brand New", score_mean: 0.9, score_std: 0.01, low_anchor: "a", high_anchor: "b" },
    ]);
    expect(container).toBeEmptyDOMElement();
  });
});
