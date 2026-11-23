import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectedDirection } from "../../src/client/components/selected-direction";

it("marks only the preview whose candidate matches the saved winner", () => {
  const html = renderToStaticMarkup(
    <>
      {["first", "chosen", "third"].map((candidateId) => (
        <SelectedDirection
          key={candidateId}
          winnerId="chosen"
          job={{ kind: "preview", candidateId }}
        />
      ))}
      <SelectedDirection winnerId="chosen" job={{ kind: "full", candidateId: "chosen" }} />
    </>,
  );
  expect(html).toContain('aria-label="Selected direction"');
  expect(html).toContain('title="Selected direction"');
  expect(html).not.toContain(">Selected direction<");
  expect(html.match(/selected-direction-badge/g)).toHaveLength(1);
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-hidden="true"');
});

it("does not infer a selection from candidate ordering when no winner is saved", () => {
  expect(
    renderToStaticMarkup(<SelectedDirection job={{ kind: "preview", candidateId: "first" }} />),
  ).toBe("");
});
