import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsChecks } from "../src/client/governance/settings-checks";
import { Store } from "../src/server/jobs/store";
import type { SettingsCheckRecord } from "../src/shared/request-settings-review";

const check: SettingsCheckRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  requestHash: "a".repeat(64),
  startedAt: "2026-01-01T00:00:00Z",
  finishedAt: "2026-01-01T00:00:01Z",
  model: "jev-1.14.0",
  status: "conflict",
  events: [],
  review: {
    requestHash: "a".repeat(64),
    model: "jev-1.14.0",
    conflicts: [
      { setting: "frameRate", value: 60, source: { field: "instructions", label: "Main idea" } },
    ],
  },
};
it("retains rejected starts without creating project records and updates one attempt", () => {
  const store = new Store(":memory:");
  try {
    store.saveSettingsCheck({ ...check, status: "checking", finishedAt: undefined });
    store.saveSettingsCheck(check);
    expect(store.settingsChecks()).toEqual([check]);
    expect(store.list()).toEqual([]);
  } finally {
    store.close();
  }
});
it("shows the independent strategy, model and conflicting setting in Governance", () => {
  const html = renderToStaticMarkup(<SettingsChecks records={[check]} />);
  expect(html).toContain("Request/settings compatibility check");
  expect(html).toContain("jev-1.14.0");
  expect(html).toContain("Conflicts found");
  expect(html).toContain("Frame rate");
  expect(html).toContain("1000 ms");
  expect(html).not.toContain("Start anyway");
});
it("shows explicit empty and unresolved history without claiming zero usage or active generation", () => {
  expect(renderToStaticMarkup(<SettingsChecks records={[]} />)).toContain(
    "No settings checks recorded yet.",
  );
  expect(
    renderToStaticMarkup(
      <SettingsChecks records={[{ ...check, status: "checking", finishedAt: undefined }]} />,
    ),
  ).toContain("No final result recorded");
});

it("shows per-call input/output and sub-cent monetary cost without expanding raw JSON", () => {
  const html = renderToStaticMarkup(
    <SettingsChecks
      records={[
        {
          ...check,
          events: [
            { type: "invocation", message: "start", data: { invocationId: "one" } },
            {
              type: "usage",
              message: "done",
              data: {
                invocationId: "one",
                model: "jev-1.14.0",
                usage: { input_tokens: 1962, output_tokens: 249 },
              },
            },
          ],
        },
      ]}
    />,
  );
  expect(html).toContain("Input tokens");
  expect(html).toContain("Output tokens");
  expect(html).toContain("$0.00008240");
  expect(html).toContain("JEV API estimate");
});
