import { isFlaggedLevel, levelOf } from "@/lib/signal-band";

/**
 * The headline above the results, graded from the signals themselves.
 *
 * The brief was to lead with the positive: as long as a couple of signals are
 * doing well, say so rather than leading with what is wrong. Every rung below
 * is written to be constructive, so there is no outcome that reads as a verdict
 * against the user.
 *
 * Two signals reading well lands on the "good" rung regardless of how high the
 * rest went, which is the brief. What that rung will not do is claim the whole
 * picture is optimal: on a real apex run two signals sat at LOW while five were
 * flagged, two of those at HIGH, with the API returning recommended_action
 * "review". So the good rung names a strong foundation, which stays true
 * printed above flagged rows, and OPTIMAL FUNCTION is kept for a clean result.
 *
 * Wording is separate from grading. RUNG_SCALE holds the label in use per rung
 * and RUNG_LABEL_VARIANTS the approved alternates, so changing a word needs no
 * change to how a result is graded.
 */

/**
 * What share of readable signals must be reading well before the headline leans
 * positive. Strictly more than a third.
 *
 * This replaced a floor of two signals, which was not comparable across models.
 * A count rewards a model for measuring more signs: apex returns seven signs
 * and pulse six, so apex cleared a fixed two more easily. One live 45s sample
 * run through both came out `good` on apex from two clean signals out of seven
 * (29%) and `steady` on pulse from one out of six (17%) — the same voice, graded
 * a rung apart on a difference in panel size rather than in how it read.
 *
 * A third is where the old floor sat on these panels (2 of 6 is 33%, 2 of 7 is
 * 29%), so this keeps the brief's intent while making the rule independent of
 * how many signs a model happens to publish. The comparison is strict so that
 * one signal in three still reads `steady`: the brief was a couple of signals
 * doing well, and one is not a couple.
 *
 * Other cut points were checked against the same vectors. A non-strict third
 * promotes one-in-three to `good`; a half demotes two-in-five, which the brief
 * calls good. Both were rejected on those grounds.
 */
export const STRONG_SIGNAL_SHARE = 1 / 3;

/** A signal the API would not flag: none or low. */
function isStrong(level: string): boolean {
  return !isFlaggedLevel(levelOf(level));
}

export type HeadlineRung = "clean" | "good" | "steady" | "focus" | "unreadable";

/**
 * Which rung a result lands on. Separated from the wording so the vocabulary
 * can be swapped without touching the grading.
 */
export function rungFor({ levels }: { levels: string[] }): HeadlineRung {
  const readable = levels.map(levelOf).filter((l) => l !== "inconclusive");

  // Nothing readable: the recapture card carries this state, but the headline
  // must not imply a finding either way.
  if (readable.length === 0) return "unreadable";

  const strong = readable.filter(isStrong).length;
  const flagged = readable.length - strong;

  if (flagged === 0) return "clean";
  /*
    The brief: a share of signals reading well is a good outcome, even with
    others flagged. This rung is reached regardless of how high the rest went,
    so its wording must stay true when it sits above flagged rows — which is why
    it names a strong foundation rather than an optimal whole.

    Measured as a share of the readable signals, not a count, so the grade does
    not move with how many signs a model publishes. See STRONG_SIGNAL_SHARE.
  */
  if (strong / readable.length > STRONG_SIGNAL_SHARE) return "good";
  // Anything reading well, just not enough of it. Reached at any panel size.
  if (strong > 0) return "steady";
  return "focus";
}

/**
 * Approved alternates for the scale labels, strongest first within each rung.
 *
 * These were originally full phrases for a headline that sat under the scale
 * and repeated its grade in words. That line now names the subject only, so the
 * rung word in RUNG_SCALE below is the single place a grade is stated, and
 * these are the swap-in options for it.
 *
 * All are informational rather than diagnostic, and none carries a risk
 * verdict. OPTIMAL and PEAK are constrained by test to the clean rung.
 */
export const RUNG_LABEL_VARIANTS: Record<HeadlineRung, string[]> = {
  clean: ["OPTIMAL", "PEAK", "EXEMPLARY", "READY"],
  good: ["STRONG", "SOLID", "FAVORABLE", "RESILIENT", "WELL-REGULATED", "SOUND"],
  steady: ["MEDIUM", "STEADY", "MEASURED", "HOLDING"],
  focus: ["LOW", "EXTREME", "NEEDS IMPROVEMENT", "IN TRANSITION", "UNDER OBSERVATION"],
  unreadable: ["INCONCLUSIVE", "UNREADABLE", "INCOMPLETE"],
};

/**
 * The phrase shown over the spectrogram, one per rung.
 *
 * This used to be formatLikelihoodTierForDisplay(likelihoodTier), which read
 * the API's overall_level while the scale directly above it read the rung. Two
 * different computations describing one result could disagree — a result graded
 * STRONG on the scale could carry "Continue to Monitor" underneath it. Keyed to
 * the rung, the lit word and the phrase are the same computation.
 */
export const RUNG_RECOMMENDATION: Record<HeadlineRung, string> = {
  clean: "You are at Peak Performance",
  good: "You are Healthy",
  steady: "Needs Optimization",
  focus: "Consider Evaluation",
  unreadable: "Inconclusive",
};

/**
 * The four gradeable rungs as a scale, weakest first, for OptionScale.
 *
 * Left to right runs LOW, MEDIUM, STRONG, OPTIMAL, so red sits on the left and
 * green on the right — the same direction as every band scale on the page.
 *
 * "unreadable" is not on the scale for the same reason INCONCLUSIVE is not a
 * band: it describes the recording, not the result.
 *
 * Clean and good share a green because both are good outcomes, and inventing a
 * gradient between them would imply a gap the grading never makes.
 */
export const RUNG_SCALE: Array<{
  key: HeadlineRung;
  label: string;
  color: string;
  colorLight: string;
}> = [
  { key: "focus", label: "LOW", color: "#FF6173", colorLight: "#8E1220" },
  { key: "steady", label: "MEDIUM", color: "#F5EF79", colorLight: "#6D5200" },
  { key: "good", label: "STRONG", color: "#4CAF6E", colorLight: "#1E5631" },
  { key: "clean", label: "OPTIMAL", color: "#4CAF6E", colorLight: "#1E5631" },
];
