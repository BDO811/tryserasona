import { describe, expect, it } from "vitest";
import {
  LEVEL_ORDER,
  actionLabel,
  actionOf,
  isFlaggedLevel,
  levelColor,
  levelLabel,
  levelOf,
  levelRank,
  levelTreatment,
  BAND_ORDER,
  bandColor,
  bandOf,
  bandScaleOptions,
  BAND_DISPLAY_ORDER,
  bandDisplayOrderFor,
  signLabel,
  bandLabelForSignal,
  bandColorForSignal,
  bandForSignal,
  bandRank,
  flaggingThresholdBand,
  flaggingThresholdText,
  isFlaggedBand,
  type SignalLevel,
} from "@/lib/signal-band";

/**
 * The six levels exactly as the v2 Display Guidelines publish them, with the
 * flagged rule from the schema: flagged is true at consider, moderate and
 * elevated.
 */
const DOCUMENTED = [
  { level: "none", label: "Within normal range", treatment: "neutral", flagged: false },
  { level: "low", label: "Faint indicator", treatment: "informational", flagged: false },
  { level: "consider", label: "Worth considering", treatment: "caution", flagged: true },
  { level: "moderate", label: "Notable indicator", treatment: "caution", flagged: true },
  { level: "elevated", label: "Significant indicator", treatment: "alert", flagged: true },
  { level: "inconclusive", label: "Analysis inconclusive", treatment: "neutral", flagged: false },
] as const;

describe("levelOf", () => {
  it("accepts every documented level", () => {
    for (const { level } of DOCUMENTED) {
      expect(levelOf(level)).toBe(level);
    }
  });

  it("is case insensitive, since level casing is not guaranteed", () => {
    expect(levelOf("MODERATE")).toBe("moderate");
    expect(levelOf("Consider")).toBe("consider");
  });

  it("reads an unknown or missing level as inconclusive, never as none", () => {
    // "none" is a claim that nothing was detected. An unrecognised level is not
    // evidence of that, so it must not borrow the claim.
    for (const value of ["", null, undefined, "severe", "critical", "MEDIUM"]) {
      expect(levelOf(value)).toBe("inconclusive");
    }
  });
});

describe("levelLabel", () => {
  it("returns the documented display label verbatim", () => {
    for (const { level, label } of DOCUMENTED) {
      expect(levelLabel(level)).toBe(label);
    }
  });

  it("uses none of the invented severity words it replaced", () => {
    // The previous ramp renamed two documented levels, calling consider MEDIUM
    // and moderate HIGH, which overstated both.
    const all = DOCUMENTED.map((d) => levelLabel(d.level)).join(" ").toUpperCase();
    for (const word of ["MEDIUM", "VERY HIGH", "OPTIMAL"]) {
      expect(all).not.toContain(word);
    }
  });
});

describe("levelTreatment", () => {
  it("matches the documented UI treatment for every level", () => {
    for (const { level, treatment } of DOCUMENTED) {
      expect(levelTreatment(level)).toBe(treatment);
    }
  });

  it("gives consider and moderate the same treatment, as the docs do", () => {
    // The docs list "Informational / Caution" for consider and "Caution" for
    // moderate, which is the one adjacent pair they do not fully separate.
    expect(levelTreatment("consider")).toBe(levelTreatment("moderate"));
  });
});

describe("isFlaggedLevel", () => {
  it("flags exactly consider, moderate and elevated", () => {
    for (const { level, flagged } of DOCUMENTED) {
      expect(isFlaggedLevel(level)).toBe(flagged);
    }
  });

  it("puts the flag boundary between low and consider", () => {
    expect(isFlaggedLevel("low")).toBe(false);
    expect(isFlaggedLevel("consider")).toBe(true);
  });
});

describe("levelRank", () => {
  it("orders the five graded levels as the docs list them", () => {
    expect(LEVEL_ORDER).toEqual(["none", "low", "consider", "moderate", "elevated"]);
    for (let i = 1; i < LEVEL_ORDER.length; i++) {
      expect(levelRank(LEVEL_ORDER[i])).toBeGreaterThan(levelRank(LEVEL_ORDER[i - 1]));
    }
  });

  it("sorts inconclusive below every graded level", () => {
    for (const level of LEVEL_ORDER) {
      expect(levelRank("inconclusive")).toBeLessThan(levelRank(level));
    }
  });
});

describe("levelColor", () => {
  it("gives every level a colour on both grounds", () => {
    for (const { level } of DOCUMENTED) {
      expect(levelColor(level, "dark")).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(levelColor(level, "light")).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("colours by treatment, so levels sharing one share a colour", () => {
    expect(levelColor("consider", "light")).toBe(levelColor("moderate", "light"));
  });

  it("uses no lime green and no retired cyan or emerald", () => {
    const banned = ["#c8f579", "#c7f25e", "#9cc73a", "#abd150", "#8eff84", "#84cc16", "#22d3ee", "#10b981"];
    for (const { level } of DOCUMENTED) {
      for (const surface of ["dark", "light"] as const) {
        expect(banned).not.toContain(levelColor(level, surface).toLowerCase());
      }
    }
  });
});

describe("the merged display bands", () => {
  it("merges none and low into NORMAL and renames the rest", () => {
    expect(bandOf("none")).toBe("NORMAL");
    expect(bandOf("low")).toBe("NORMAL");
    expect(bandOf("consider")).toBe("LOW");
    expect(bandOf("moderate")).toBe("MODERATE");
    expect(bandOf("elevated")).toBe("ELEVATED");
  });

  it("lands the merge exactly on the API's flagged boundary", () => {
    // NORMAL is precisely the unflagged levels, so one word covers both.
    for (const level of LEVEL_ORDER) {
      expect(bandOf(level) === "NORMAL").toBe(!isFlaggedLevel(level));
    }
  });

  it("keeps inconclusive off the scale", () => {
    expect(bandOf("inconclusive")).toBe("INCONCLUSIVE");
    expect(bandScaleOptions().map((o) => o.key)).not.toContain("INCONCLUSIVE");
  });

  it("draws every signal row normal first, so green is on the left", () => {
    for (const name of [undefined, "fatigue", "elevated-blood-pressure", "head-impact"]) {
      expect(bandScaleOptions(name).map((o) => o.key), String(name)).toEqual([
        "NORMAL",
        "LOW",
        "MODERATE",
        "ELEVATED",
      ]);
    }
    expect(bandDisplayOrderFor("fatigue")).toEqual(BAND_ORDER);
  });

  it("gives every sign all four bands whichever way it is drawn", () => {
    for (const name of ["fatigue", "elevated-blood-pressure", "head-impact"]) {
      const keys = bandScaleOptions(name).map((o) => o.key);
      expect([...keys].sort(), name).toEqual([...BAND_ORDER].sort());
    }
  });

  it("keeps the severity order ascending, since bandRank compares against it", () => {
    // Drawing order and severity order are separate. Reversing BAND_ORDER
    // itself would silently invert every rank comparison.
    expect(BAND_ORDER).toEqual(["NORMAL", "LOW", "MODERATE", "ELEVATED"]);
    expect(bandRank("NORMAL")).toBeLessThan(bandRank("ELEVATED"));
    expect(BAND_DISPLAY_ORDER).toEqual([...BAND_ORDER].reverse());
  });

  it("gives LOW and MODERATE different colours despite one shared treatment", () => {
    // The docs group consider and moderate under Caution, but they display as
    // two named bands here, so a shared colour would make them look identical.
    expect(bandColor("LOW", "light")).not.toBe(bandColor("MODERATE", "light"));
  });

  it("uses no lime green or retired colour on either ground", () => {
    const banned = ["#c8f579", "#c7f25e", "#9cc73a", "#abd150", "#8eff84", "#84cc16", "#22d3ee", "#10b981"];
    for (const band of [...BAND_ORDER, "INCONCLUSIVE" as const]) {
      for (const surface of ["dark", "light"] as const) {
        expect(banned).not.toContain(bandColor(band, surface).toLowerCase());
      }
    }
  });
});

describe("actionOf and actionLabel", () => {
  it("passes every documented action through unchanged", () => {
    for (const action of ["none", "monitor", "consider", "review", "escalate", "inconclusive"]) {
      expect(actionOf(action)).toBe(action);
    }
  });

  it("does not collapse review into monitor", () => {
    // A previous version folded consider, monitor and review into one word,
    // discarding the distinction the field exists to carry.
    expect(actionOf("review")).not.toBe(actionOf("monitor"));
    expect(actionLabel("review")).not.toBe(actionLabel("monitor"));
  });

  it("reads an unknown action as inconclusive, never as none", () => {
    for (const value of ["", null, undefined, "urgent"]) {
      expect(actionOf(value)).toBe("inconclusive");
    }
  });

  it("gives every action a distinct label", () => {
    const labels = (["none", "monitor", "consider", "review", "escalate", "inconclusive"] as const).map(
      actionLabel
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("the calibration the docs describe", () => {
  it("never derives a level from a score", () => {
    // Straight from a real apex run: anxiety scored 0.359 and came back
    // consider, while cognitive load scored 0.273 and came back moderate. A
    // higher score in the lower band. levelOf takes only the level, so a score
    // cannot reach it.
    const anxiety = levelOf("consider");
    const cognitiveLoad = levelOf("moderate");
    expect(levelRank(cognitiveLoad)).toBeGreaterThan(levelRank(anxiety));
  });

  it("bands a whole real apex payload from its levels alone", () => {
    const run = [
      { label: "Cardiovascular Strain", level: "moderate" },
      { label: "Dehydration", level: "moderate" },
      { label: "Cognitive Load", level: "moderate" },
      { label: "Anxiety", level: "consider" },
      { label: "Fatigue", level: "consider" },
      { label: "Stress", level: "consider" },
      { label: "Head Impact", level: "low" },
    ];
    expect(run.map((s) => bandOf(levelOf(s.level)))).toEqual([
      "MODERATE",
      "MODERATE",
      "MODERATE",
      "LOW",
      "LOW",
      "LOW",
      "NORMAL",
    ]);
  });
});

describe("bandForSignal", () => {
  it("shows head impact only at ELEVATED", () => {
    // A head trauma reading is a serious claim, so it displays ELEVATED or not
    // at all. Everything below reads NORMAL.
    expect(bandForSignal("head-impact", "elevated")).toBe("ELEVATED");
    for (const level of ["moderate", "consider", "low", "none"]) {
      expect(bandForSignal("head-impact", level)).toBe("NORMAL");
    }
  });

  it("never rewrites an unreadable head impact to NORMAL", () => {
    // Unreadable audio is not evidence that nothing was found.
    expect(bandForSignal("head-impact", "inconclusive")).toBe("INCONCLUSIVE");
  });

  it("leaves every other sign on its own band", () => {
    for (const name of ["anxiety", "fatigue", "cardiovascular-strain", "dehydration"]) {
      expect(bandForSignal(name, "moderate")).toBe("MODERATE");
      expect(bandForSignal(name, "consider")).toBe("LOW");
      expect(bandForSignal(name, "low")).toBe("NORMAL");
    }
  });

  it("counts a flag off the displayed band, so an override cannot disagree", () => {
    // head-impact at moderate displays NORMAL, so it must not count as a flag.
    expect(isFlaggedBand(bandForSignal("head-impact", "moderate"))).toBe(false);
    expect(isFlaggedBand(bandForSignal("anxiety", "consider"))).toBe(true);
    expect(isFlaggedBand("NORMAL")).toBe(false);
  });
});

describe("bandLabelForSignal", () => {
  it("reads head impact as NONE rather than NORMAL", () => {
    // "No impact detected" is the plain statement. NORMAL invites the reading
    // that a normal amount of head trauma was found.
    expect(bandLabelForSignal("head-impact", "NORMAL")).toBe("NONE");
  });

  it("leaves head impact's other bands alone", () => {
    expect(bandLabelForSignal("head-impact", "ELEVATED")).toBe("ELEVATED");
    expect(bandLabelForSignal("head-impact", "INCONCLUSIVE")).toBe("INCONCLUSIVE");
  });

  it("leaves every other sign reading NORMAL", () => {
    for (const name of ["anxiety", "stress", "cardiovascular-strain"]) {
      expect(bandLabelForSignal(name, "NORMAL")).toBe("NORMAL");
    }
  });

  it("changes only the word, never the band", () => {
    // The band drives the flag count and the grade, so relabelling must not
    // move it.
    const band = bandForSignal("head-impact", "low");
    expect(band).toBe("NORMAL");
    expect(isFlaggedBand(band)).toBe(false);
    expect(bandLabelForSignal("head-impact", band)).toBe("NONE");
  });
});

/** The signs each model returned on a live run, in API order. */
const APEX_SIGNS = [
  "head-impact",
  "cognitive-load",
  "fatigue",
  "dehydration",
  "stress",
  "anxiety",
  "cardiovascular-strain",
];
const PULSE_SIGNS = [
  "fatigue",
  "stress",
  "dehydration",
  "mood-disruption",
  "anxiety",
  "elevated-blood-pressure",
];

describe("signLabel", () => {
  it("drops the finding out of the blood-pressure name", () => {
    // "Elevated Blood Pressure — NORMAL" contradicted itself: the sign is the
    // measure, the band is the reading.
    expect(signLabel("elevated-blood-pressure", "Elevated Blood Pressure")).toBe("Blood Pressure");
  });

  it("passes every other sign through untouched", () => {
    expect(signLabel("fatigue", "Fatigue")).toBe("Fatigue");
    expect(signLabel("head-impact", "Head Impact")).toBe("Head Impact");
  });

  it("falls back to the API label when there is no override", () => {
    expect(signLabel("brand-new-sign", "Brand New Sign")).toBe("Brand New Sign");
    expect(signLabel(null, null)).toBe("");
  });
});

describe("bandColorForSignal", () => {
  const GREENED = ["fatigue", "stress", "anxiety"];

  it("draws LOW in the NORMAL green on the signs where LOW is not a concern", () => {
    for (const sign of GREENED) {
      expect(bandColorForSignal(sign, "LOW", "dark"), sign).toBe(bandColor("NORMAL", "dark"));
      expect(bandColorForSignal(sign, "LOW", "light"), sign).toBe(bandColor("NORMAL", "light"));
    }
  });

  it("leaves LOW in its own colour everywhere else", () => {
    for (const sign of ["head-impact", "dehydration", "cognitive-load"]) {
      expect(bandColorForSignal(sign, "LOW", "dark"), sign).toBe(bandColor("LOW", "dark"));
    }
  });

  it("changes nothing above LOW, so a real flag keeps its colour", () => {
    for (const sign of GREENED) {
      for (const band of ["NORMAL", "MODERATE", "ELEVATED", "INCONCLUSIVE"] as const) {
        expect(bandColorForSignal(sign, band, "dark"), `${sign} ${band}`).toBe(
          bandColor(band, "dark")
        );
      }
    }
  });

  it("recolours only, leaving the band and its flag status untouched", () => {
    /*
      The colour override must not leak into severity. If it did, a LOW reading
      on one of these signs would stop counting toward the flag total and the
      header would disagree with the rows, which is the defect this codebase has
      already hit twice.
    */
    for (const sign of GREENED) {
      expect(bandForSignal(sign, "consider"), sign).toBe("LOW");
      expect(isFlaggedBand(bandForSignal(sign, "consider")), sign).toBe(true);
    }
  });
});

describe("flaggingThresholdText", () => {
  it("reads LOW and above for a sign with no override", () => {
    // The API sets flagged from `consider` up, and `consider` displays as LOW.
    expect(flaggingThresholdText("fatigue")).toBe("Flags at LOW and above");
    expect(flaggingThresholdText("anxiety")).toBe("Flags at LOW and above");
  });

  it("reads NONE rather than NORMAL where the measure names a finding", () => {
    // "A normal amount of head trauma" and "normal fatigue" both invite a
    // reading nobody intended; NONE is the plain statement.
    expect(bandLabelForSignal("fatigue", "NORMAL")).toBe("NONE");
    expect(bandLabelForSignal("head-impact", "NORMAL")).toBe("NONE");
    expect(bandLabelForSignal("stress", "NORMAL")).toBe("NORMAL");
    // Only the bottom band is renamed.
    expect(bandLabelForSignal("fatigue", "LOW")).toBe("LOW");
    expect(bandLabelForSignal("fatigue", "ELEVATED")).toBe("ELEVATED");
  });

  it("names the override band on every sign that is held back", () => {
    expect(flaggingThresholdText("head-impact")).toBe("Flags at ELEVATED");
    expect(flaggingThresholdText("Head-Impact")).toBe("Flags at ELEVATED");
    // Same treatment on pulse's clinical-sounding sign.
    expect(flaggingThresholdText("elevated-blood-pressure")).toBe("Flags at ELEVATED");
  });

  it("gives each model the same override treatment", () => {
    const overridden = (signs: string[]) =>
      signs.filter((n) => flaggingThresholdBand(n) === "ELEVATED");
    expect(overridden(APEX_SIGNS)).toEqual(["head-impact"]);
    expect(overridden(PULSE_SIGNS)).toEqual(["elevated-blood-pressure"]);
  });

  it("holds an overridden sign at NORMAL through consider and moderate", () => {
    // This is what the override actually changes. At `low` it does nothing,
    // because `low` already bands to NORMAL on its own.
    for (const sign of ["head-impact", "elevated-blood-pressure"]) {
      expect(bandForSignal(sign, "low"), sign).toBe("NORMAL");
      expect(bandForSignal(sign, "consider"), sign).toBe("NORMAL");
      expect(bandForSignal(sign, "moderate"), sign).toBe("NORMAL");
      expect(bandForSignal(sign, "elevated"), sign).toBe("ELEVATED");
      // Unreadable audio is never rewritten as normal.
      expect(bandForSignal(sign, "inconclusive"), sign).toBe("INCONCLUSIVE");
    }
  });

  it("agrees with the band the sign actually displays", () => {
    // The threshold text and bandForSignal must not disagree: a card claiming it
    // flags at LOW while its own row reads NORMAL at consider is the defect the
    // old normalRange string had.
    for (const name of ["fatigue", "head-impact"]) {
      const threshold = flaggingThresholdBand(name);
      for (const level of LEVEL_ORDER) {
        const band = bandForSignal(name, level);
        expect(isFlaggedBand(band), `${name} @ ${level}`).toBe(
          bandRank(band) >= bandRank(threshold)
        );
      }
    }
  });

  it("says nothing about a numeric range", () => {
    // Score-to-level is model-calibrated, so there is no interval to print.
    expect(flaggingThresholdText("fatigue")).not.toMatch(/[0-9]/);
  });
});
