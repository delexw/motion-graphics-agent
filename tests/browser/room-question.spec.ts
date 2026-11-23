import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { RequestSchema } from "../../src/shared/contracts";
import { applyRoomPatch, RoomPatchSchema, RoomStateSchema } from "../../src/shared/room";
import { newRoomWindow } from "../../src/client/room/window-lifecycle";

type QuestionFixtureWindow = Window & { publishQuestion?: () => void };

test("opens the Assistant for a decision on desktop and mobile, including legacy optional questions", async ({
  context,
}) => {
  test.setTimeout(120000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "room-question-"));
  let room = RoomStateSchema.parse({
    windows: [{ ...newRoomWindow("assistant"), closed: true }],
  });
  const answers: unknown[] = [];
  const run = {
    id: "example-project",
    createdAt: "2026-01-01",
    phase: "generating",
    request: RequestSchema.parse({ instructions: "Explain an idea" }),
    jobs: [],
    candidates: [],
    assetQuestions: [],
  };
  const question = {
    id: "decision",
    kind: "urls",
    mode: "optional",
    cause: "url-access",
    question: "Use the alternative reference?",
    reason: "The supplied reference is inaccessible.",
    fallback: "Use the supplied description.",
    state: "open",
  };
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "room-question-fixture",
        configureServer(server) {
          server.middlewares.use(async (request, response, next) => {
            if (request.url?.startsWith("/api/")) {
              let body = "";
              for await (const chunk of request) body += chunk;
              let result: unknown = [];
              if (request.url === "/api/room") {
                if (request.method === "PATCH") {
                  const applied = applyRoomPatch(room, RoomPatchSchema.parse(JSON.parse(body)));
                  room = applied.state;
                  result = applied;
                } else result = room;
              } else if (request.url?.includes("/asset-questions/")) {
                const answer = JSON.parse(body);
                answers.push(answer);
                result = {
                  ...run,
                  assetQuestions: [{ ...question, state: "answered", ...answer }],
                };
              }
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify(result));
              return;
            }
            if (request.url !== "/question-test") return next();
            const html = await server.transformIndexHtml(
              request.url,
              `<input id="unrelated-draft"><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import{CreativeRoom}from'/src/client/room/creative-room.tsx';
import'/src/client/framework.css';import'/src/client/style.css';
function App(){const[run,setRun]=useState(${JSON.stringify(run)});window.publishQuestion=()=>setRun({...run,assetQuestions:[${JSON.stringify(question)}]});return React.createElement(MemoryRouter,null,React.createElement(CreativeRoom,{projects:[run],styles:[],examples:[],onUpdated:setRun,onOpen(){},onCreated(){},onDeleted(){},onHome(){},onLaunch(){},onNavigate(){}}));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
            );
            response.setHeader("Content-Type", "text/html");
            response.end(html);
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    for (const width of [1440, 390]) {
      room = RoomStateSchema.parse({
        windows: [{ ...newRoomWindow("assistant"), closed: true }],
      });
      const page = await context.newPage();
      try {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${server.resolvedUrls!.local[0]}question-test`);
        await page.waitForFunction(
          () => typeof (window as QuestionFixtureWindow).publishQuestion === "function",
        );
        await page.locator("#unrelated-draft").first().pressSequentially("Unfinished idea");
        await page.evaluate(() => (window as QuestionFixtureWindow).publishQuestion!());
        await page
          .locator('.room-window[aria-label="Assistant"] .room-question')
          .first()
          .waitFor({ state: "attached" });
        const assistant = await page
          .locator('.room-window[aria-label="Assistant"]')
          .first()
          .evaluate((node) => ({
            focused: node.classList.contains("is-focused"),
            mobileFront: node.classList.contains("is-mobile-front"),
            text: (node as HTMLElement).innerText,
          }));
        expect(assistant.focused).toBe(true);
        expect(
          await page
            .locator("#unrelated-draft")
            .first()
            .evaluate((input) => (input as HTMLInputElement).value),
        ).toBe("Unfinished idea");
        if (width === 390) expect(assistant.mobileFront).toBe(true);
        expect(assistant.text).toContain("Paused for you");
        expect(assistant.text).toContain(question.question);
        expect(assistant.text).not.toContain("Work keeps going");
        await page
          .locator(".room-question-alternative button")
          .first()
          .evaluate((button) => (button as HTMLButtonElement).click());
        await page.locator(".room-question").first().waitFor({ state: "hidden" });
      } finally {
        await page.close();
      }
    }
    expect(answers).toEqual([
      { answer: question.fallback, assetIds: [] },
      { answer: question.fallback, assetIds: [] },
    ]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
