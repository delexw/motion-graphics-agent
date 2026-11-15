import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, expect, it } from "vitest";
import { readSourceCharacters } from "../src/server/project-reuse/characters";
import { registerProjectReuseRoutes } from "../src/server/project-reuse/routes";
import { projectReuseSource } from "../src/shared/project-reuse";
import { RequestSchema, ProductionSchema, type Run } from "../src/shared/contracts";
import { Store } from "../src/server/jobs/store";

const cleanup: Array<() => unknown | Promise<unknown>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const character = {
  id: "guide",
  name: "Scout",
  appearance: "Cream puppy, brown ears, red hat.",
  personality: "Friendly.",
  role: "Educational guide.",
  evidence: "Reviewed source rendering and storyboard.",
};
async function fixture() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "reuse-characters-"));
  cleanup.push(() => rm(folder, { recursive: true, force: true }));
  const run: Run = {
    id: "example-project",
    phase: "ready",
    createdAt: "2026-01-01",
    request: RequestSchema.parse({ instructions: "Original example topic" }),
    candidates: [],
    jobs: [
      {
        id: "full",
        runId: "example-project",
        candidateId: "direction",
        kind: "full",
        phase: "ready",
        duration: 20,
        video: "final.mp4",
        workspace: folder,
        model: "example-model",
      },
    ],
  };
  const source = projectReuseSource(run, "full")!;
  return { folder, run, source };
}
it("reads inspected historical metadata without guessing absent or malformed identities", async () => {
  const f = await fixture();
  expect(await readSourceCharacters(f.source)).toEqual([]);
  await writeFile(path.join(f.folder, "CHARACTER_REFERENCES.json"), JSON.stringify([character]));
  expect(await readSourceCharacters(f.source)).toEqual([character]);
  await writeFile(
    path.join(f.folder, "CHARACTER_REFERENCES.json"),
    JSON.stringify([{ name: "Unverified" }]),
  );
  await expect(readSourceCharacters(f.source)).rejects.toThrow();
});
it("rejects snapshot symlinks outside the source workspace", async () => {
  const f = await fixture();
  const outside = await fixture();
  const file = path.join(outside.folder, "outside.json");
  await writeFile(file, JSON.stringify([character]));
  await symlink(file, path.join(f.folder, "CHARACTER_REFERENCES.json"));
  await expect(readSourceCharacters(f.source)).rejects.toThrow("inside its source workspace");
});
it("uses the same read-only character route and persisted creation owner for both HTTP registrations", async () => {
  const f = await fixture();
  f.run.jobs[0].production = ProductionSchema.parse({
    characters: [character],
    pipeline: "HyperFrames",
    fallbackReason: null,
    styleRenderer: ["HTML/CSS"],
    motionEngine: ["GSAP"],
    sourceFile: "film.html",
    duration: 20,
    width: 1920,
    height: 1080,
    audioDescription: "Music",
    limitations: [],
  });
  const store = new Store(":memory:");
  cleanup.push(() => store.close());
  store.save(f.run);
  const app = Fastify();
  cleanup.push(() => app.close());
  registerProjectReuseRoutes(app, store, { styles: [] });
  const preview = await app.inject({
    method: "GET",
    url: "/api/project-reuse/example-project/full/characters",
  });
  expect(preview.statusCode).toBe(200);
  expect(preview.json()).toEqual({ characters: [character] });
  expect(store.room().drafts.new).toBeUndefined();
  const created = await app.inject({
    method: "POST",
    url: "/api/project-reuse",
    payload: {
      projectId: f.run.id,
      jobId: "full",
      operationId: "example-operation",
      idea: "A new educational topic",
      choices: { visual: false, characters: true },
      selectedCharacterIds: ["guide"],
    },
  });
  expect(created.statusCode).toBe(200);
  expect(created.json().request.projectReuse.characters).toEqual([character]);
  const missing = await app.inject({
    method: "GET",
    url: "/api/project-reuse/example-project/foreign/characters",
  });
  expect(missing.statusCode).not.toBe(200);
});
