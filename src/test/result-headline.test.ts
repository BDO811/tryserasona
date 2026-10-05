import { describe, expect, it } from "vitest";
import {
  RUNG_LABEL_VARIANTS,
  RUNG_RECOMMENDATION,
  RUNG_SCALE,
  STRONG_SIGNAL_SHARE,
  rungFor,
  type HeadlineRung,
} from "@/lib/result-headline";

const rung = (levels: string[]) => rungFor({ levels });

describe("rungFor", () => {
  it("reaches the clean rung only when nothing is flagged", () => {
    expect(rung(["low", "low", "none", "low"])).toBe("clean");
    expect(rung(["none", "none"])).toBe("clean");
  });

  it("gives a good outcome whenever two signals are reading well", () => {
    // The brief. Reached regardless of how high the remaining signals went.
    expect(rung(["low", "low", "consider"])).toBe("good");
    expect(rung(["low", "low", "moderate", "moderate", "consider"])).toBe("good");
    expect(rung(["none", "low", "elevated", "elevated"])).toBe("good");
  });

  it("degrades gently rather than turning negative", () => {
    expect(rung(["low", "moderate", "moderate"])).toBe("steady");
    expect(rung(["moderate", "elevated", "consider"])).toBe("focus");
  });

  it("reports unreadable when nothing can be read", () => {
    expect(rung(["inconclusive", "inconclusive"])).toBe("unreadable");
  });

  it("ignores inconclusive signals when grading the readable ones", () => {
    expect(rung(["low", "none", "inconclusive"])).toBe("clean");
  });

  it("handles a single signal", () => {
    expect(rung(["low"])).toBe("clean");
    expect(rung(["moderate"])).toBe("focus");
  });

  it("counts the share over readable signals only", () => {
    // One strong of two readable is 50%, good, even though it is one of four
    // rows. Inconclusive rows are not evidence either way, so they must not
    // dilute the denominator.
    expect(rung(["low", "moderate", "inconclusive", "inconclusive"])).toBe("good");
  });

  it("needs strictly more than the share, so one in three is not a couple", () => {
    expect(STRONG_SIGNAL_SHARE).toBe(1 / 3);
    expect(rung(["low", "moderate", "moderate"])).not.toBe("good");
    expect(rung(["low", "low", "moderate", "moderate"])).toBe("good");
  });

  it("grades on the share of signals, not the count, so panel size does not decide it", () => {
    /*
      The defect this replaced. A fixed floor of two rewarded a model for
      publishing more signs: one live 45s sample came out `good` on apex (two
      clean of seven) and `steady` on pulse (one of six) — the same voice, a
      rung apart on panel size.

      These two vectors are that sample: four consider plus one moderate in
      both, apex additionally returning head-impact and cardiovascular-strain.
    */
    const livePulse = ["low", "consider", "consider", "consider", "consider", "moderate"];
    const liveApex = [
      "low",
      "low",
      "consider",
      "consider",
      "consider",
      "consider",
      "moderate",
    ];
    expect(rung(livePulse)).toBe(rung(liveApex));
    expect(rung(liveApex)).toBe("steady");
  });

  it("holds the same share to the same rung at any panel size", () => {
    // Half the signals reading well is good whether the panel is 4 or 12.
    const half = (n: number) =>
      Array(n / 2).fill("low").concat(Array(n / 2).fill("moderate"));
    for (const n of [4, 6, 8, 12]) {
      expect(rung(half(n)), `${n} signals`).toBe("good");
    }
    // And a lone strong signal is steady whether the panel is 3 or 12.
    for (const n of [3, 6, 12]) {
      const one = ["low"].concat(Array(n - 1).fill("moderate"));
      expect(rung(one), `1 of ${n}`).toBe("steady");
    }
  });

  it("treats an empty signal list as unreadable, not as clean", () => {
    // No signals is not evidence that nothing was found.
    expect(rung([])).toBe("unreadable");
  });
});

describe("RUNG_SCALE", () => {
  const GRADEABLE: HeadlineRung[] = ["focus", "steady", "good", "clean"];

  it("covers every gradeable rung, weakest first so green sits on the right", () => {
    expect(RUNG_SCALE.map((r) => r.key)).toEqual(GRADEABLE);
  });

  it("leaves the unreadable state off the scale", () => {
    // It describes the recording, not the result, so it is not a rung.
    expect(RUNG_SCALE.map((r) => r.key)).not.toContain("unreadable");
  });

  it("gives every rung a colour for both grounds", () => {
    for (const r of RUNG_SCALE) {
      expect(r.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(r.colorLight).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("shares one green across the two good rungs", () => {
    // Left to right carries the order, so colour is free to carry good versus
    // caution. A gradient between clean and good would imply a gap the grading
    // never makes.
    const clean = RUNG_SCALE.find((r) => r.key === "clean")!;
    const good = RUNG_SCALE.find((r) => r.key === "good")!;
    expect(clean.colorLight).toBe(good.colorLight);
  });

  it("labels the four rungs LOW / MEDIUM / STRONG / OPTIMAL", () => {
    expect(RUNG_SCALE.map((r) => r.label)).toEqual(["LOW", "MEDIUM", "STRONG", "OPTIMAL"]);
  });

  it("runs red on the left to green on the right", () => {
    const colors = RUNG_SCALE.map((r) => r.colorLight);
    expect(colors[0]).toBe("#8E1220");
    expect(colors[colors.length - 1]).toBe("#1E5631");
  });

  it("uses no risk or diagnostic wording in any label", () => {
    const banned = ["RISK", "ELEVATED", "POOR", "ABNORMAL", "DEFICIENT", "IMPAIRED", "DISEASE"];
    for (const r of RUNG_SCALE) {
      for (const word of banned) {
        expect(r.label).not.toContain(word);
      }
    }
  });
});

describe("RUNG_RECOMMENDATION", () => {
  const RUNGS: HeadlineRung[] = ["clean", "good", "steady", "focus", "unreadable"];

  it("gives every rung a phrase", () => {
    for (const r of RUNGS) expect(RUNG_RECOMMENDATION[r].trim()).not.toBe("");
  });

  it("carries the wording as specified", () => {
    expect(RUNG_RECOMMENDATION.clean).toBe("You are at Peak Performance");
    expect(RUNG_RECOMMENDATION.good).toBe("You are Healthy");
    expect(RUNG_RECOMMENDATION.steady).toBe("Needs Optimization");
    expect(RUNG_RECOMMENDATION.focus).toBe("Consider Evaluation");
  });

  it("says something different on every rung", () => {
    const all = RUNGS.map((r) => RUNG_RECOMMENDATION[r]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("claims peak condition only on the clean rung", () => {
    for (const r of RUNGS) {
      if (r === "clean") continue;
      expect(RUNG_RECOMMENDATION[r].toUpperCase()).not.toContain("PEAK");
    }
  });
});

describe("RUNG_LABEL_VARIANTS", () => {
  const RUNGS: HeadlineRung[] = ["clean", "good", "steady", "focus", "unreadable"];

  it("offers alternates for every rung", () => {
    for (const r of RUNGS) {
      expect(RUNG_LABEL_VARIANTS[r].length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps each label in use inside its own rung's alternates", () => {
    for (const entry of RUNG_SCALE) {
      expect(RUNG_LABEL_VARIANTS[entry.key]).toContain(entry.label);
    }
  });

  it("claims optimal or peak condition only on the clean rung", () => {
    for (const r of RUNGS) {
      if (r === "clean") continue;
      for (const variant of RUNG_LABEL_VARIANTS[r]) {
        expect(variant).not.toContain("OPTIMAL");
        expect(variant).not.toContain("PEAK");
      }
    }
  });

  it("uses no risk or diagnostic wording in any alternate", () => {
    const banned = ["RISK", "ELEVATED", "POOR", "ABNORMAL", "DEFICIENT", "IMPAIRED", "DISEASE"];
    for (const r of RUNGS) {
      for (const variant of RUNG_LABEL_VARIANTS[r]) {
        for (const word of banned) {
          expect(variant).not.toContain(word);
        }
      }
    }
  });

  it("has no duplicate wording across rungs", () => {
    const all = RUNGS.flatMap((r) => RUNG_LABEL_VARIANTS[r]);
    expect(new Set(all).size).toBe(all.length);
  });
});
