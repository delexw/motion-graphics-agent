import { describe, expect, it } from "vitest";
import {
  requestedStyleScopeGuidance,
  suggestedCombinationGuidance,
  validateCombinationReview,
} from "../../src/shared/style-combinations";
import { loadCatalog } from "../../src/server/catalog/catalog";
import { pageStyleContext } from "../../src/server/domains/page/prompts";

const combinations = {
  selection_guidance:
    "Use alone for simple content; add diagrams when relationships need explanation.",
  suggestions: [
    {
      supporting_styles: [{ style_id: "style-002", role: "Draw explanatory diagrams" }],
      rationale: "Diagrams complement the primary typography.",
      best_for: "Explaining connected ideas",
      video_application: "Reveal the diagram during the explanation.",
      html_application: "Allow keyboard-accessible exploration.",
      consistency_rules: ["Preserve the primary palette."],
      avoid: ["Conflicting typography."],
    },
  ],
};
const review = { styles: [{ style_id: "style-001", suggested_combinations: combinations }] };
describe("style combination recommendations", () => {
  it("includes combination guidance for every catalog style", async () => {
    const catalog = await loadCatalog();
    expect(catalog.styles).toHaveLength(199);
    for (const style of catalog.styles) {
      expect(style.suggested_combinations?.selection_guidance).toBeTruthy();
      expect(style.suggested_combinations?.suggestions.length).toBeLessThanOrEqual(3);
    }
    expect(catalog.combination_analysis).toMatchObject({ model: "claude-opus-5-5" });
  });
  it("requires complete unique coverage and valid subordinate styles", () => {
    expect(validateCombinationReview(review, ["style-001"], ["style-001", "style-002"])).toEqual(
      review,
    );
    expect(() =>
      validateCombinationReview(review, ["style-001", "style-002"], ["style-001", "style-002"]),
    ).toThrow(/cover/);
    expect(() =>
      validateCombinationReview(
        { styles: [...review.styles, ...review.styles] },
        ["style-001", "style-002"],
        ["style-001", "style-002"],
      ),
    ).toThrow(/cover/);
    for (const ids of [["style-001"], ["unknown"], ["style-002", "style-002"]]) {
      const invalid = {
        styles: [
          {
            style_id: "style-001",
            suggested_combinations: {
              ...combinations,
              suggestions: [
                {
                  ...combinations.suggestions[0],
                  supporting_styles: ids.map((style_id) => ({ style_id, role: "Supporting role" })),
                },
              ],
            },
          },
        ],
      };
      expect(() =>
        validateCombinationReview(invalid, ["style-001"], ["style-001", "style-002"]),
      ).toThrow(/Invalid/);
    }
  });
  it("rejects duplicate combinations but permits a justified standalone style", () => {
    expect(() =>
      validateCombinationReview(
        {
          styles: [
            {
              style_id: "style-001",
              suggested_combinations: {
                ...combinations,
                suggestions: [...combinations.suggestions, ...combinations.suggestions],
              },
            },
          ],
        },
        ["style-001"],
        ["style-001", "style-002"],
      ),
    ).toThrow(/Duplicate/);
    expect(
      validateCombinationReview(
        {
          styles: [
            { style_id: "style-001", suggested_combinations: { ...combinations, suggestions: [] } },
          ],
        },
        ["style-001"],
        ["style-001"],
      ).styles,
    ).toHaveLength(1);
  });
  it("passes compatibility guidance to page planning", async () => {
    const catalog = await loadCatalog();
    const style = { ...catalog.styles[0], suggested_combinations: combinations };
    expect(pageStyleContext(style).suggested_combinations).toEqual(combinations);
  });
});

it("keeps the generated-combination quota in automatic-route guidance only", () => {
  expect(suggestedCombinationGuidance).toContain(
    "additional styles explicitly assigned in the prompt are outside that range",
  );
  expect(requestedStyleScopeGuidance).not.toContain("duration-derived range");
  expect(requestedStyleScopeGuidance).toContain(
    "Every Motion Graphic explicitly named in the requested idea is required",
  );
});
