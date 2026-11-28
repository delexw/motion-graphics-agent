import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-app";

test.use({
  fixtureHtml: `<!doctype html><div id="root"></div><script type="module">
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ConfigProvider} from 'antd';
import {RoomOnboarding} from '/src/client/room/room-onboarding.tsx';
import {emptyRoomDraft} from '/src/client/room/onboarding.ts';
import {roomTheme} from '/src/client/theme.ts';
import '/src/client/style.css';
import '/src/client/framework.css';
function App() {
  const fresh = emptyRoomDraft();
  const [draft, setDraft] = useState({
    ...fresh, step: 5, stepLayout: 'separate-video',
    request: {...fresh.request, instructions: 'A short animation'}
  });
  return React.createElement(ConfigProvider, {theme: roomTheme},
    React.createElement(React.Fragment, null,
      React.createElement('div', {className: 'room-assistant-body', style: {height: 650, width: '100%'}},
        React.createElement(RoomOnboarding, {
          draft, onChange: setDraft, materials: [], styles: [], examples: [], onCreated(){}, onUpload: async () => []
        })),
      React.createElement('output', {id: 'state'}, JSON.stringify({
        style: draft.request.requirements?.music.style ?? null,
        notes: draft.request.requirements?.music.instructions ?? ''
      }))));
}
createRoot(document.getElementById('root')).render(React.createElement(App));
</script>`,
});

for (const width of [480, 1180]) {
  test(`saves the picked style separately from editable music notes at ${width}px`, async ({
    page,
    fixtureUrl,
  }) => {
    await page.setViewportSize({ width, height: 820 });
    await page.goto(fixtureUrl);
    const prompt = page.getByRole("textbox", { name: "Answer the assistant" });
    await prompt.fill("Use only nylon-string guitar.");
    const picker = page.getByRole("combobox", { name: "Add a music style" });
    await picker.click();
    const listbox = page.getByRole("listbox");
    await expect(listbox.getByRole("option")).toHaveCount(50);
    await expect(listbox.getByText("Brazilian and Latin", { exact: true })).toBeVisible();

    await picker.fill("J-pop");
    await expect(listbox.getByRole("option")).toHaveCount(1);
    await listbox.getByRole("option", { name: "J-pop", exact: true }).click();
    await expect(page.locator("#state")).toHaveText(
      JSON.stringify({ style: "J-pop", notes: "Use only nylon-string guitar." }),
    );

    await picker.click();
    await picker.fill("city pop");
    await listbox.getByRole("option", { name: "City Pop", exact: true }).click();
    await expect(prompt).toHaveText("Use only nylon-string guitar.");
    await prompt.fill("Custom music prompt.");
    await expect(page.locator("#state")).toHaveText(
      JSON.stringify({ style: "City Pop", notes: "Custom music prompt." }),
    );
  });
}
