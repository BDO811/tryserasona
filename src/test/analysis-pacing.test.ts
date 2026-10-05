import { describe, expect, it } from "vitest";
import {
  BASE_EXPECTED_ANALYSIS,
  BASE_FINAL_TAIL,
  CATCH_UP_PER_STAGE,
  TOTAL_STAGES,
  WAITING_STAGES,
  simulateStageSchedule,
  waitingStagePosition,
} from "@/lib/analysis-pacing";

/**
 * Real job durations measured from the analyzeAudio function logs over 90 days
 * (15 samples). Bimodal: a fast cluster around 10-20s and a slow cluster around
 * 48-81s, so no fixed schedule can fit both.
 */
const MEASURED_DURATIONS_MS = [
  10_700, 10_800, 12_900, 14_200, 14_400, 14_700, 16_800, 17_600, 18_700, 20_600,
  48_000, 51_200, 55_800, 58_100, 80_900,
];

const FINAL_STAGE = TOTAL_STAGES - 1;

describe("waitingStagePosition", () => {
  it("starts on the first stage", () => {
    expect(waitingStagePosition(0, BASE_EXPECTED_ANALYSIS)).toBeCloseTo(0, 5);
  });

  it("never reaches the reserved final stage, however long the wait", () => {
    for (const elapsed of [30_000, 60_000, 120_000, 600_000]) {
      expect(waitingStagePosition(elapsed, BASE_EXPECTED_ANALYSIS)).toBeLessThanOrEqual(
        WAITING_STAGES - 1
      );
    }
  });

  it("hands over to the last waiting stage at the pacing target", () => {
    const atTarget = waitingStagePosition(BASE_EXPECTED_ANALYSIS, BASE_EXPECTED_ANALYSIS);
    expect(Math.floor(atTarget)).toBe(WAITING_STAGES - 1);
  });

  it("advances monotonically", () => {
    let previous = -1;
    for (let t = 0; t <= 120_000; t += 250) {
      const position = waitingStagePosition(t, BASE_EXPECTED_ANALYSIS);
      expect(position).toBeGreaterThanOrEqual(previous);
      previous = position;
    }
  });

  it("divides the waiting stages equally", () => {
    const per = BASE_EXPECTED_ANALYSIS / WAITING_STAGES;
    for (let stage = 0; stage < WAITING_STAGES; stage++) {
      // Just inside the stage's own slice.
      expect(Math.floor(waitingStagePosition(stage * per + 1, BASE_EXPECTED_ANALYSIS))).toBe(stage);
      // Just before it hands over.
      expect(Math.floor(waitingStagePosition((stage + 1) * per - 1, BASE_EXPECTED_ANALYSIS))).toBe(
        stage
      );
    }
  });
});

describe("simulateStageSchedule", () => {
  it("shows the final stage for exactly the tail, at every measured duration", () => {
    for (const duration of MEASURED_DURATIONS_MS) {
      const run = simulateStageSchedule(duration);
      expect(run.stageDurations[FINAL_STAGE]).toBe(BASE_FINAL_TAIL);
    }
  });

  it("never shows the final stage before the result is in hand", () => {
    for (const duration of MEASURED_DURATIONS_MS) {
      const run = simulateStageSchedule(duration);
      expect(run.finalStageEnteredAtMs).toBeGreaterThanOrEqual(duration);
    }
  });

  it("passes through every stage in order, skipping none", () => {
    for (const duration of MEASURED_DURATIONS_MS) {
      const run = simulateStageSchedule(duration);
      expect(run.stagesSeen).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("fixes the complaint case: a 51s job no longer parks on the final stage", () => {
    // Old build: 24s of animation, then 27s frozen on "6/6".
    const run = simulateStageSchedule(51_200);
    expect(run.finalStageEnteredAtMs).toBe(51_200);
    expect(run.stageDurations[FINAL_STAGE]).toBe(BASE_FINAL_TAIL);
    expect(run.totalMs).toBe(51_200 + BASE_FINAL_TAIL);
  });

  it("spends the whole pre-result wait on the waiting stages", () => {
    for (const duration of MEASURED_DURATIONS_MS) {
      const run = simulateStageSchedule(duration);
      const waitingTime = run.stageDurations
        .slice(0, WAITING_STAGES)
        .reduce((sum, ms) => sum + ms, 0);
      const owed = WAITING_STAGES - 1 - run.stageAtResult;
      expect(waitingTime).toBe(duration + owed * CATCH_UP_PER_STAGE);
    }
  });

  it("adds no more than a second of catch-up when the job returns early", () => {
    const run = simulateStageSchedule(2_000);
    expect(run.stagesSeen).toEqual([0, 1, 2, 3, 4, 5]);
    // Four stages still owed at 250ms each, then the 4s tail.
    expect(run.totalMs).toBe(2_000 + 4 * CATCH_UP_PER_STAGE + BASE_FINAL_TAIL);
    expect(run.stageDurations[FINAL_STAGE]).toBe(BASE_FINAL_TAIL);
  });

  it("ends promptly after even the slowest measured job", () => {
    const run = simulateStageSchedule(80_900);
    expect(run.totalMs).toBe(80_900 + BASE_FINAL_TAIL);
  });

  it("gives no waiting stage a longer hold than the job itself", () => {
    const run = simulateStageSchedule(80_900);
    expect(Math.max(...run.stageDurations)).toBeLessThanOrEqual(80_900);
  });
});
