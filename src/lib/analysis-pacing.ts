/**
 * Stage pacing for the analysis screen.
 *
 * The screen used to run a fixed 24s schedule (six 4s stages) and then park on
 * a counter reading "6/6" until the API answered. Measured from the analyzeAudio
 * function logs over 90 days, the job takes 10.7s to 80.9s, and recent runs sit
 * at 51-81s. So the old build spent up to a minute frozen on a stage that
 * announces the work is finished while the user is still waiting.
 *
 * The fix splits the six stages into two jobs:
 *
 *   Stages 1-5 own the wait. They divide EXPECTED_ANALYSIS equally, so the
 *   count moves at a steady, predictable rate instead of accelerating or
 *   stalling. Stage 5 is the elastic one: it holds until the result arrives,
 *   absorbing however much the job overruns the estimate.
 *
 *   Stage 6 means "finishing", not "waiting". It is entered only once the result
 *   is in hand and always lasts exactly FINAL_TAIL.
 *
 * Because the duration is genuinely unpredictable, EXPECTED_ANALYSIS is a pacing
 * target rather than a prediction: it sets how fast the count moves, not when
 * the run ends. Slack lands on stage 5, which reads as still working, rather
 * than on stage 6, which reads as already done.
 *
 * A decelerating curve was tried first and rejected: it spread the wait more
 * smoothly but gave stages 1-5 durations of 4.2s, 5.2s, 7.1s and 11.6s, which
 * is not the even movement this is meant to deliver.
 */

/**
 * Pacing target the five waiting stages divide equally. This is the single knob
 * worth tuning here.
 *
 * Set to 45s from the measured distribution. The all-time median is 17.6s, but
 * that average is misleading: the samples are bimodal (10-20s and 48-81s) and
 * every recent run falls in the slow cluster. Pacing to the median would put
 * the count on stage 5 after 17s and leave it there for another 35s, which is
 * the stall this is meant to remove. Pacing to 45s keeps stages 1-4 moving
 * evenly through most of a slow job.
 *
 * The cost is that a fast job barely advances the count before the result
 * lands, and finishes via the catch-up path below. That is the right trade
 * while the API is slow. If it returns to 10-20s, lower this to match.
 */
export const BASE_EXPECTED_ANALYSIS = 45_000;

/** How long stage 6 shows once the result has landed. */
export const BASE_FINAL_TAIL = 4_000;

/** Stages that cover the wait. The sixth is reserved for the tail. */
export const WAITING_STAGES = 5;

/** Total stages, including the final one. */
export const TOTAL_STAGES = 6;

/**
 * If the job returns before the curve has walked all the waiting stages, the
 * ones still owed are shown briefly rather than skipped, so the counter never
 * jumps. Kept short: it delays the result by at most 4 x this.
 */
export const CATCH_UP_PER_STAGE = 250;

/** How long each of the five waiting stages gets. */
export function waitingStageDuration(expected: number): number {
  return expected / WAITING_STAGES;
}

/**
 * Fractional position among stages 1-5 after `elapsed` of waiting. Advances at
 * a steady rate and then clamps to the last waiting stage, which holds for as
 * long as the job needs.
 */
export function waitingStagePosition(elapsed: number, expected: number): number {
  const position = Math.max(elapsed, 0) / waitingStageDuration(expected);
  return Math.min(position, WAITING_STAGES - 1);
}

/**
 * Which stage to show `tailElapsed` into the tail, given the stage that was on
 * screen when the result landed.
 *
 * Any waiting stages still owed get CATCH_UP_PER_STAGE each, then the final
 * stage holds for the rest. Returns the stage index and whether the run is over.
 */
export function tailStage(
  tailElapsed: number,
  stageAtResult: number,
  finalTail: number
): { stage: number; done: boolean } {
  const owed = Math.max(0, WAITING_STAGES - 1 - stageAtResult);
  const catchUpMs = owed * CATCH_UP_PER_STAGE;

  if (tailElapsed < catchUpMs) {
    const advanced = Math.floor(tailElapsed / CATCH_UP_PER_STAGE) + 1;
    return { stage: Math.min(stageAtResult + advanced, WAITING_STAGES - 1), done: false };
  }

  return {
    stage: TOTAL_STAGES - 1,
    done: tailElapsed >= catchUpMs + finalTail,
  };
}

export interface SimulatedRun {
  /** Stage indices in the order they appeared. */
  stagesSeen: number[];
  /** Milliseconds spent showing each stage index. */
  stageDurations: number[];
  /** Stage that was on screen when the result landed. */
  stageAtResult: number;
  /** When the final stage was entered, relative to the start of the run. */
  finalStageEnteredAtMs: number;
  /** Total run length. */
  totalMs: number;
}

/**
 * Step the real schedule forward in 1ms ticks for a job of `jobMs`, mirroring
 * what the animation loop does per frame. Used to assert the pacing contract
 * against the durations actually measured in production.
 */
export function simulateStageSchedule(
  jobMs: number,
  expected: number = BASE_EXPECTED_ANALYSIS,
  finalTail: number = BASE_FINAL_TAIL
): SimulatedRun {
  const stageDurations = new Array(TOTAL_STAGES).fill(0);
  const stagesSeen: number[] = [];

  let resultAt: number | null = null;
  let stageAtResult = 0;
  let lastStage = -1;
  let finalStageEnteredAtMs = -1;
  let elapsed = 0;

  for (;;) {
    if (resultAt === null && elapsed >= jobMs) {
      resultAt = elapsed;
      stageAtResult = Math.max(lastStage, 0);
    }

    let stage: number;
    let done = false;

    if (resultAt === null) {
      stage = Math.floor(waitingStagePosition(elapsed, expected));
    } else {
      const result = tailStage(elapsed - resultAt, stageAtResult, finalTail);
      stage = result.stage;
      done = result.done;
    }

    if (stage !== lastStage) {
      stagesSeen.push(stage);
      lastStage = stage;
      if (stage === TOTAL_STAGES - 1 && finalStageEnteredAtMs < 0) {
        finalStageEnteredAtMs = elapsed;
      }
    }

    if (done) break;

    stageDurations[stage] += 1;
    elapsed += 1;
  }

  return { stagesSeen, stageDurations, stageAtResult, finalStageEnteredAtMs, totalMs: elapsed };
}
