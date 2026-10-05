import { describe, expect, it } from "vitest";
import { RUNG_RECOMMENDATION, RUNG_SCALE, type HeadlineRung } from "@/lib/result-headline";
import { formatLikelihoodTierForDisplay } from "@/lib/result-types";

/**
 * The results screen and the detailed analysis page must name one result the
 * same way. They previously read two different sources: the hero used the rung
 * and the detail page used the API's overall_level, so a single result showed
 * as "Needs Optimization" on one and "Continue to Monitor" on the other.
 */
describe("outcome phrase", () => {
  const RUNGS: HeadlineRung[] = ["clean", "good", "steady", "focus", "unreadable"];

  it("gives every rung exactly one phrase", () => {
    for (const r of RUNGS) {
      expect(RUNG_RECOMMENDATION[r], r).toBeTruthy();
    }
  });

  it("keeps the phrases distinct, so the rung is readable from the words", () => {
    const phrases = RUNGS.map((r) => RUNG_RECOMMENDATION[r]);
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it("does not reuse the tier wording, which is what drifted", () => {
    /*
      The two vocabularies are deliberately separate. This asserts they have not
      been quietly merged back into one another, which would reintroduce the
      possibility of a page reading the wrong one and looking correct.
    */
    const tierWords = ["NONE", "LOW", "CONSIDER", "MODERATE", "ELEVATED", "INCONCLUSIVE"]
      .map(formatLikelihoodTierForDisplay);
    expect(RUNG_RECOMMENDATION.steady).toBe("Needs Optimization");
    expect(tierWords).toContain("Continue to Monitor");
    expect(tierWords).not.toContain(RUNG_RECOMMENDATION.steady);
  });

  it("gives every gradeable rung a colour both pages can use", () => {
    for (const entry of RUNG_SCALE) {
      expect(entry.color, entry.key).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(RUNG_RECOMMENDATION[entry.key]).toBeTruthy();
    }
  });
});
