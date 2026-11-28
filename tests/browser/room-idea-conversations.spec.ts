import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-app";
import {
  additionalIdeaDraftKey,
  applyRoomPatch,
  RoomPatchSchema,
  RoomStateSchema,
} from "../../src/shared/room";
import { newRoomWindow } from "../../src/client/room/window-lifecycle";

test.use({
  fixtureHtml: `<!doctype html><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import{CreativeRoom}from'/src/client/room/creative-room.tsx';import'/src/client/style.css';import'/src/client/framework.css';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(CreativeRoom,{projects:[],styles:[],examples:[],onHome(){},onOpen(){},onCreated(){},onDeleted(){},onLaunch(){},onNavigate(){},onUpdated(){}})));
</script>`,
});

test("lists newly saved drafts and opens the selected brief in the Assistant", async ({
  page,
  context,
  fixtureUrl,
}) => {
  const draftId = "6d591594-6479-4c41-abbf-258eb3572154";
  const ideas = ["Keep the original draft", "A 3D CD player in postmodern style"];
  let room = RoomStateSchema.parse({
    windows: [newRoomWindow("assistant")],
    drafts: { new: { request: { instructions: ideas[0] } } },
  });
  const submissions: unknown[] = [];
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/room" && request.method() === "GET") {
      await route.fulfill({ json: room });
    } else if (pathname === "/api/room" && request.method() === "PATCH") {
      const result = applyRoomPatch(room, RoomPatchSchema.parse(request.postDataJSON()));
      room = result.state;
      await route.fulfill({ json: result });
    } else if (pathname === "/api/runs" && request.method() === "POST") {
      submissions.push(request.postDataJSON());
      await route.fulfill({ status: 409, json: { error: "Fixture stopped before starting" } });
    } else {
      await route.fulfill({ json: [] });
    }
  });
  await page.goto(fixtureUrl);
  await expect(page.getByRole("textbox", { name: "Answer the assistant" })).toContainText(ideas[0]);

  const key = additionalIdeaDraftKey(draftId);
  room = RoomStateSchema.parse({
    ...room,
    revision: room.revision + 1,
    drafts: {
      ...room.drafts,
      [key]: {
        id: draftId,
        step: 8,
        stepLayout: "separate-video",
        request: { instructions: ideas[1] },
      },
    },
  });
  await page.getByRole("button", { name: "Conversation: New idea. Choose another" }).click();
  await page.getByRole("menuitem", { name: ideas[1] }).click();
  await expect(page.getByText("Review your brief", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create previews" }).click();
  await expect
    .poll(() => submissions)
    .toEqual([
      expect.objectContaining({
        instructions: ideas[1],
        sourceDraft: { draftId, revision: room.revision },
      }),
    ]);

  await page.getByRole("button", { name: `Conversation: ${ideas[1]}. Choose another` }).click();
  await page.getByRole("menuitem", { name: "New idea", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Answer the assistant" })).toContainText(ideas[0]);

  await page.getByRole("button", { name: "Conversation: New idea. Choose another" }).click();
  await page.getByRole("menuitem", { name: ideas[1] }).click();
  await page
    .getByRole("navigation", { name: "Brief steps" })
    .getByRole("button", { name: /Idea$/ })
    .click();
  const edited = "An edited CD player brief";
  await page.getByRole("textbox", { name: "Answer the assistant" }).fill(edited);
  await expect.poll(() => room.drafts[key]?.request.instructions).toBe(edited);
  expect(room.drafts.new.request.instructions).toBe(ideas[0]);

  await page.setViewportSize({ width: 580, height: 820 });
  await page.getByRole("button", { name: "Open assistant", exact: true }).click();
  const removeDraft = page
    .getByRole("region", { name: "Assistant", exact: true })
    .getByRole("button", { name: "Remove draft", exact: true });
  await removeDraft.click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(room.drafts[key].request.instructions).toBe(edited);
  await removeDraft.click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove draft", exact: true }).click();
  await expect.poll(() => room.drafts[key]).toBeUndefined();
  await expect(page.getByRole("textbox", { name: "Answer the assistant" })).toContainText(ideas[0]);
});
