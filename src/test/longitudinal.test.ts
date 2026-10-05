import { describe, expect, it } from "vitest";
import {
  BURST_WINDOW_MS,
  analyzeSignalHistory,
  changeSinceLastVisit,
  collapseBursts,
  directionFor,
  formatSigned,
  slopeOf,
  spreadOf,
  weightedBaseline,
  type SignalReading,
} from "@/lib/longitudinal";

const DAY = 24 * 60 * 60 * 1000;

/** Build a series one day apart, oldest first. */
function series(scores: number[], startAt = 0): SignalReading[] {
  return scores.map((score, i) => ({
    sessionId: `s${i}`,
    capturedAt: startAt + i * DAY,
    score,
  }));
}

describe("collapseBursts", () => {
  it("folds recordings from one sitting into a single reading", () => {
    const readings: SignalReading[] = [
      { sessionId: "a", capturedAt: 0, score: 0.4 },
      { sessionId: "b", capturedAt: 60_000, score: 0.6 },
      { sessionId: "c", capturedAt: 120_000, score: 0.5 },
    ];
    const collapsed = collapseBursts(readings);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].score).toBeCloseTo(0.5, 5);
  });

  it("keeps readings from separate sittings apart", () => {
    const readings = series([0.4, 0.6]);
    expect(collapseBursts(readings)).toHaveLength(2);
  });

  it("sorts out-of-order readings oldest first", () => {
    const readings: SignalReading[] = [
      { sessionId: "late", capturedAt: 2 * DAY, score: 0.9 },
      { sessionId: "early", capturedAt: 0, score: 0.1 },
    ];
    const collapsed = collapseBursts(readings);
    expect(collapsed.map((r) => r.sessionId)).toEqual(["early", "late"]);
  });

  it("treats a gap just under the window as the same sitting", () => {
    const readings: SignalReading[] = [
      { sessionId: "a", capturedAt: 0, score: 0.4 },
      { sessionId: "b", capturedAt: BURST_WINDOW_MS - 1, score: 0.8 },
    ];
    expect(collapseBursts(readings)).toHaveLength(1);
  });
});

describe("weightedBaseline", () => {
  it("weights the most recent reading highest", () => {
    // Plain mean would be 0.5; the weighted mean must sit nearer the recent 0.9.
    const plainMean = 0.5;
    const weighted = weightedBaseline([0.1, 0.9]);
    expect(weighted).not.toBeNull();
    expect(weighted!).toBeGreaterThan(plainMean);
  });

  it("returns null with no readings", () => {
    expect(weightedBaseline([])).toBeNull();
  });

  it("returns the single score when only one reading exists", () => {
    expect(weightedBaseline([0.42])).toBeCloseTo(0.42, 5);
  });
});

describe("spreadOf and slopeOf", () => {
  it("reports zero spread for an unvarying series", () => {
    expect(spreadOf([0.5, 0.5, 0.5])).toBeCloseTo(0, 5);
  });

  it("needs two points for a spread", () => {
    expect(spreadOf([0.5])).toBeNull();
  });

  it("reports a negative slope for a falling series", () => {
    expect(slopeOf([0.6, 0.5, 0.4])).toBeCloseTo(-0.1, 5);
  });

  it("reports a flat slope for a level series", () => {
    expect(slopeOf([0.5, 0.5, 0.5])).toBeCloseTo(0, 5);
  });
});

describe("directionFor", () => {
  it("reads flat when the move is inside the user's spread", () => {
    expect(directionFor(-0.04, 0.09)).toBe("flat");
  });

  it("reads falling when the move clears the spread", () => {
    expect(directionFor(-0.11, 0.04)).toBe("falling");
  });

  it("reads rising when the move clears the spread upward", () => {
    expect(directionFor(0.2, 0.05)).toBe("rising");
  });

  it("does not turn rounding noise into a direction when spread is ~0", () => {
    expect(directionFor(0.01, 0)).toBe("flat");
  });
});

describe("analyzeSignalHistory", () => {
  it("returns null with no readings", () => {
    expect(analyzeSignalHistory([])).toBeNull();
  });

  it("stays provisional and withholds a baseline under three sessions", () => {
    const read = analyzeSignalHistory(series([0.43, 0.55]));
    expect(read).not.toBeNull();
    expect(read!.provisional).toBe(true);
    expect(read!.baseline).toBeNull();
    expect(read!.deviation).toBeNull();
    expect(read!.direction).toBeNull();
    expect(read!.band).toBeNull();
    expect(read!.sessions).toBe(2);
  });

  it("reports a baseline and a falling direction once history supports it", () => {
    // Reproduces the explainer's worked example end to end: nine sessions,
    // baseline 0.52, latest 0.41, deviation -0.11, direction falling.
    const read = analyzeSignalHistory(
      series([0.5, 0.54, 0.49, 0.55, 0.51, 0.53, 0.52, 0.52, 0.41])
    );
    expect(read).not.toBeNull();
    expect(read!.provisional).toBe(false);
    expect(read!.sessions).toBe(9);
    expect(read!.latest).toBeCloseTo(0.41, 5);
    expect(read!.baseline).toBeCloseTo(0.52, 2);
    expect(read!.deviation).toBeCloseTo(-0.11, 2);
    expect(read!.direction).toBe("falling");
  });

  it("excludes the latest reading from its own baseline", () => {
    const scores = [0.5, 0.5, 0.5, 0.9];
    const read = analyzeSignalHistory(series(scores))!;
    // Baseline is built from the three 0.5s only, so the 0.9 cannot pull it up.
    expect(read.baseline).toBeCloseTo(0.5, 5);
    expect(read.deviation).toBeCloseTo(0.4, 5);
  });

  it("does not let a burst move the baseline", () => {
    const spaced = series([0.5, 0.5, 0.5, 0.5]);
    const withBurst: SignalReading[] = [
      ...spaced,
      // Three more recordings in the same sitting as the last one.
      { sessionId: "burst1", capturedAt: spaced[3].capturedAt + 60_000, score: 0.5 },
      { sessionId: "burst2", capturedAt: spaced[3].capturedAt + 120_000, score: 0.5 },
    ];
    const before = analyzeSignalHistory(spaced)!;
    const after = analyzeSignalHistory(withBurst)!;
    expect(after.sessions).toBe(before.sessions);
    expect(after.baseline).toBeCloseTo(before.baseline!, 5);
  });

  it("puts the latest reading below the band when it falls out of range", () => {
    const read = analyzeSignalHistory(series([0.52, 0.5, 0.53, 0.51, 0.3]))!;
    expect(read.band).not.toBeNull();
    expect(read.latest).toBeLessThan(read.band!.low);
  });

  it("reports a negative short-term slope for a recent decline", () => {
    const read = analyzeSignalHistory(series([0.5, 0.5, 0.55, 0.5, 0.45, 0.4]))!;
    expect(read.shortTermSlope).not.toBeNull();
    expect(read.shortTermSlope!).toBeLessThan(0);
  });

  it("emits a baseline series that is null until a baseline exists", () => {
    const read = analyzeSignalHistory(series([0.5, 0.52, 0.48, 0.51]))!;
    expect(read.baselineSeries.slice(0, 2)).toEqual([null, null]);
    expect(read.baselineSeries[2]).not.toBeNull();
  });
});

describe("changeSinceLastVisit", () => {
  it("returns null for a first-ever visit", () => {
    expect(changeSinceLastVisit(series([0.5]))).toBeNull();
  });

  it("reports the move between the two most recent sittings", () => {
    const change = changeSinceLastVisit(series([0.4, 0.5, 0.62]));
    expect(change).not.toBeNull();
    expect(change!.previous).toBeCloseTo(0.5, 5);
    expect(change!.latest).toBeCloseTo(0.62, 5);
    expect(change!.change).toBeCloseTo(0.12, 5);
  });

  it("compares against the previous sitting, not the previous recording", () => {
    const readings: SignalReading[] = [
      { sessionId: "visit1", capturedAt: 0, score: 0.4 },
      { sessionId: "visit2a", capturedAt: DAY, score: 0.6 },
      { sessionId: "visit2b", capturedAt: DAY + 60_000, score: 0.8 },
    ];
    const change = changeSinceLastVisit(readings)!;
    expect(change.previous).toBeCloseTo(0.4, 5);
    expect(change.latest).toBeCloseTo(0.7, 5); // the sitting's two readings averaged
  });
});

describe("formatSigned", () => {
  it("prints the explainer's minus sign for a fall", () => {
    expect(formatSigned(-0.11)).toBe("−0.11");
  });

  it("prints a plus for a rise", () => {
    expect(formatSigned(0.08)).toBe("+0.08");
  });

  it("does not print a signed zero", () => {
    expect(formatSigned(-0.0001)).toBe("0.00");
  });
});
