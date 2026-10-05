import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  RecommendationsPanel,
  RECOMMENDATIONS_ENABLED,
} from "@/components/report/RecommendationsPanel";

const SIGNS = [
  { label: "Fatigue", band: "LOW" },
  { label: "Stress", band: "MODERATE" },
];

describe("RecommendationsPanel", () => {
  it("renders nothing while the feature is off", () => {
    /*
      The endpoint answers 429 on every call because the model project is out of
      credit, so the button could only ever produce an error. This asserts the
      gate actually suppresses it rather than the flag existing unused.
    */
    const { container } = render(
      <RecommendationsPanel signs={SIGNS} assessment="wellness" showContent />
    );
    if (!RECOMMENDATIONS_ENABLED) {
      expect(container).toBeEmptyDOMElement();
    } else {
      expect(container.textContent).toContain("recommendations");
    }
  });

  it("matches the flag either way, so the gate is never decorative", () => {
    const { container } = render(
      <RecommendationsPanel signs={SIGNS} assessment="wellness" showContent />
    );
    if (RECOMMENDATIONS_ENABLED) {
      expect(container.querySelector("button")).not.toBeNull();
    } else {
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("renders nothing when there is nothing flagged either", () => {
    const { container } = render(
      <RecommendationsPanel signs={[]} assessment="wellness" showContent />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
