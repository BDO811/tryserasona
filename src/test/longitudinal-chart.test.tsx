import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LongitudinalChart } from "@/components/report/LongitudinalChart";
import { analyzeSignalHistory, type SignalReading } from "@/lib/longitudinal";

const DAY = 24 * 60 * 60 * 1000;

function series(scores: number[]): SignalReading[] {
  return scores.map((score, i) => ({ sessionId: `s${i}`, capturedAt: i * DAY, score }));
}

function readFor(scores: number[]) {
  const read = analyzeSignalHistory(series(scores));
  if (!read) throw new Error("expected a read");
  return read;
}

/** Every number in an SVG coordinate attribute across the tree. */
function coordinateValues(container: HTMLElement): number[] {
  const attrs = ["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "width", "height"];
  const values: number[] = [];

  container.querySelectorAll("*").forEach((el) => {
    for (const attr of attrs) {
      const raw = el.getAttribute(attr);
      if (raw !== null) values.push(Number(raw));
    }
    const points = el.getAttribute("points");
    if (points) {
      for (const pair of points.trim().split(/\s+/)) {
        const [x, y] = pair.split(",");
        values.push(Number(x), Number(y));
      }
    }
  });

  return values;
}

describe("LongitudinalChart", () => {
  it("renders finite coordinates for an established baseline", () => {
    const { container } = render(
      <LongitudinalChart read={readFor([0.5, 0.54, 0.49, 0.55, 0.51, 0.53, 0.52, 0.52, 0.41])} label="Depression" />
    );

    const values = coordinateValues(container);
    expect(values.length).toBeGreaterThan(20);
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("renders finite coordinates for a flat series", () => {
    // A zero-spread series makes the value range collapse, which is where a
    // naive scale divides by zero and silently emits NaN into the SVG.
    const { container } = render(<LongitudinalChart read={readFor([0.5, 0.5, 0.5, 0.5])} label="Anxiety" />);
    expect(coordinateValues(container).every((v) => Number.isFinite(v))).toBe(true);
  });

  it("renders finite coordinates for a single reading", () => {
    const { container } = render(<LongitudinalChart read={readFor([0.42])} label="Fatigue" />);
    expect(coordinateValues(container).every((v) => Number.isFinite(v))).toBe(true);
  });

  it("prints the explainer's readout line once a baseline exists", () => {
    const { container } = render(
      <LongitudinalChart read={readFor([0.5, 0.54, 0.49, 0.55, 0.51, 0.53, 0.52, 0.52, 0.41])} label="Depression" />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("score 0.41");
    expect(text).toContain("baseline 0.52");
    expect(text).toContain("deviation −0.11");
    expect(text).toContain("falling");
    expect(text).toContain("sessions 9");
  });

  it("marks the read provisional and draws no baseline under three sessions", () => {
    const { container } = render(<LongitudinalChart read={readFor([0.43, 0.55])} label="Anxiety" />);
    const text = container.textContent ?? "";
    expect(text).toContain("provisional");
    expect(text).not.toContain("baseline 0");
  });

  it("keeps every drawn element inside the viewBox", () => {
    const { container } = render(
      <LongitudinalChart read={readFor([0.2, 0.8, 0.35, 0.75, 0.4, 0.95, 0.1])} label="Wide range" />
    );

    // Only the plotted geometry is checked; labels sit in the right-hand gutter
    // by design and are allowed past the plot edge.
    const plotted = container.querySelectorAll("polyline, circle");
    expect(plotted.length).toBeGreaterThan(0);

    plotted.forEach((el) => {
      const cy = el.getAttribute("cy");
      if (cy !== null) {
        expect(Number(cy)).toBeGreaterThanOrEqual(0);
        expect(Number(cy)).toBeLessThanOrEqual(260);
      }
      const points = el.getAttribute("points");
      if (points) {
        for (const pair of points.trim().split(/\s+/)) {
          const [x, y] = pair.split(",").map(Number);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(720);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(260);
        }
      }
    });
  });

  it("never renders a lime green stroke or fill", () => {
    const { container } = render(
      <LongitudinalChart read={readFor([0.5, 0.54, 0.49, 0.41])} label="Depression" />
    );
    const banned = ["#c8f579", "#c7f25e", "#9cc73a", "#abd150", "#8eff84"];
    const markup = container.innerHTML.toLowerCase();
    for (const color of banned) {
      expect(markup).not.toContain(color);
    }
  });
});
