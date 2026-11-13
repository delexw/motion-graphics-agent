import { img2threejsSkill } from "../src/server/agents/bundled-skills/img2threejs";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  installedSkill,
  refreshSkills,
  updateSkill,
} from "../src/server/agents/bundled-skills/installation";
import type { BundledSkill } from "../src/server/agents/bundled-skills/types";
import { ZipFile } from "yazl";
import { buffer } from "node:stream/consumers";
const folders: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function repository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "skill-update-test-"));
  folders.push(root);
  let revision = "a".repeat(40);
  let contents: Record<string, string> = {
    "SKILL.md": "---\nname: example\n---\nFirst revision\n",
    LICENSE: "MIT License\n",
  };
  const download = vi.fn(async () => {
    const archive = new ZipFile();
    for (const [name, value] of Object.entries(contents))
      archive.addBuffer(Buffer.from(value), `example-HEAD/${name}`);
    archive.end({ forceZip64Format: false, comment: revision });
    return new Response(await buffer(archive.outputStream));
  });
  vi.stubGlobal("fetch", download);

  const skill: BundledSkill = {
    purpose: "visual_authoring",
    id: "example",
    name: "Example",
    repository: "https://github.com/example/illustration-skill.git",
    workspacePath: ".agents/skills/example",
    claudeName: "bundled-authoring:example",
    guidance: "Test fixture",
  };
  return {
    root: path.join(root, "cache"),
    skill,
    download,
    update: (next: Record<string, string>, sha = "b".repeat(40)) => {
      contents = next;
      revision = sha;
    },
  };
}
it("installs an HTTPS archive and atomically updates to a new revision", async () => {
  const fixture = await repository();
  const first = await updateSkill(fixture.skill, fixture.root);
  expect(fixture.download).toHaveBeenCalledWith(
    "https://codeload.github.com/example/illustration-skill/zip/HEAD",
    expect.objectContaining({ redirect: "error" }),
  );
  expect(first.manifest.files["SKILL.md"]).toMatch(/^[a-f0-9]{64}$/);
  fixture.update({
    "SKILL.md": "---\nname: example\n---\nSecond revision\n",
    LICENSE: "MIT License\n",
  });
  const second = await updateSkill(fixture.skill, fixture.root);
  expect(second.manifest.revision).not.toBe(first.manifest.revision);
  expect(await readFile(path.join(first.directory, "SKILL.md"), "utf8")).toContain(
    "First revision",
  );
  expect(await readFile(path.join(second.directory, "SKILL.md"), "utf8")).toContain(
    "Second revision",
  );
  expect((await installedSkill(fixture.skill, fixture.root)).manifest).toEqual(second.manifest);
  expect((await updateSkill(fixture.skill, fixture.root)).manifest).toEqual(second.manifest);
});
it("extracts only the registered repository subdirectory and retains notices and offline provenance", async () => {
  const fixture = await repository();
  const skill = { ...fixture.skill, sourceDirectory: "skills/example" };
  fixture.update({
    "skills/example/SKILL.md": "name: example\nFirst nested revision",
    "skills/example/LICENSE": "MIT License",
    "skills/example/NOTICE.md": "Third-party notices",
    "skills/example/kit/index.ts": "export const example = true;",
    "skills/example-other/SKILL.md": "not selected",
    "SKILL.md": "name: unrelated",
    LICENSE: "unrelated license",
  });
  const first = await updateSkill(skill, fixture.root);
  expect(first.manifest.sourceDirectory).toBe("skills/example");
  expect(Object.keys(first.manifest.files).sort()).toEqual([
    "LICENSE",
    "NOTICE.md",
    "SKILL.md",
    "kit/index.ts",
  ]);
  expect(await readFile(path.join(first.directory, "NOTICE.md"), "utf8")).toBe(
    "Third-party notices",
  );
  await expect(
    installedSkill({ ...skill, sourceDirectory: "skills/other" }, fixture.root),
  ).rejects.toThrow("source directory");
  fixture.download.mockRejectedValue(Error("Offline"));
  await refreshSkills([skill], fixture.root, vi.fn());
  expect((await installedSkill(skill, fixture.root)).manifest).toEqual(first.manifest);
});

it.each(["../example", "/example", "skills/../example", "skills\\example", "skills//example", "."])(
  "rejects unsafe repository subdirectory %s before downloading",
  async (sourceDirectory) => {
    const fixture = await repository();
    await expect(
      updateSkill({ ...fixture.skill, sourceDirectory }, fixture.root),
    ).rejects.toThrow();
    expect(fixture.download).not.toHaveBeenCalled();
  },
);

it("does not use a repository root license for a missing or unlicensed subdirectory", async () => {
  const fixture = await repository();
  fixture.update({
    "SKILL.md": "name: example",
    LICENSE: "MIT",
    "nested/SKILL.md": "name: example",
  });
  await expect(
    updateSkill({ ...fixture.skill, sourceDirectory: "nested" }, fixture.root),
  ).rejects.toThrow("needs SKILL.md and LICENSE");
  await expect(
    updateSkill({ ...fixture.skill, sourceDirectory: "missing" }, fixture.root),
  ).rejects.toThrow("needs SKILL.md and LICENSE");
});
it("keeps a verified installation when the upstream becomes unavailable", async () => {
  const fixture = await repository();
  await updateSkill(fixture.skill, fixture.root);
  fixture.download.mockRejectedValue(Error("Offline"));
  const report = vi.fn();
  await refreshSkills([fixture.skill], fixture.root, report);
  expect(report).toHaveBeenCalledWith(
    expect.stringContaining("using the verified local installation"),
  );
  await expect(installedSkill(fixture.skill, fixture.root)).resolves.toBeDefined();
});
it("reports a missing first installation without blocking app startup", async () => {
  const fixture = await repository();
  fixture.download.mockRejectedValue(Error("Offline"));
  const report = vi.fn();
  await refreshSkills([fixture.skill], fixture.root, report);
  expect(report).toHaveBeenCalledWith(expect.stringContaining("is unavailable"));
  await expect(installedSkill(fixture.skill, fixture.root)).rejects.toThrow();
});
it("rejects a broken update without changing the current revision", async () => {
  const fixture = await repository();
  const first = await updateSkill(fixture.skill, fixture.root);
  fixture.update({ "SKILL.md": "---\nname: example\n---\nMissing license\n" });
  await expect(updateSkill(fixture.skill, fixture.root)).rejects.toThrow(
    "needs SKILL.md and LICENSE",
  );
  expect((await installedSkill(fixture.skill, fixture.root)).manifest.revision).toBe(
    first.manifest.revision,
  );
});
it("rejects tampered files and never uses a corrupted offline fallback", async () => {
  const fixture = await repository();
  const first = await updateSkill(fixture.skill, fixture.root);
  await writeFile(path.join(first.directory, "SKILL.md"), "tampered");
  await expect(installedSkill(fixture.skill, fixture.root)).rejects.toThrow(
    "integrity check failed",
  );
  await expect(updateSkill(fixture.skill, fixture.root)).rejects.toThrow("integrity check failed");
  fixture.download.mockRejectedValue(Error("Offline"));
  const report = vi.fn();
  await refreshSkills([fixture.skill], fixture.root, report);
  expect(report).toHaveBeenCalledWith(expect.stringContaining("is unavailable"));
});
it("rejects traversal and symbolic links in a cached installation", async () => {
  const fixture = await repository();
  const first = await updateSkill(fixture.skill, fixture.root);
  await rm(path.join(first.directory, "LICENSE"));
  await symlink(path.join(first.directory, "SKILL.md"), path.join(first.directory, "LICENSE"));
  await expect(installedSkill(fixture.skill, fixture.root)).rejects.toThrow(
    "must not contain links",
  );
  const pointer = path.join(fixture.root, fixture.skill.id, "current.json");
  await writeFile(
    pointer,
    JSON.stringify({ ...first.manifest, files: { "../outside": "a".repeat(64) } }),
  );
  await expect(installedSkill(fixture.skill, fixture.root)).rejects.toThrow(
    "Invalid installed skill path",
  );
});

it("rejects failed HTTP responses, invalid ZIPs and invalid revision metadata", async () => {
  const fixture = await repository();
  fixture.download.mockImplementation(async () => new Response("Rate limited", { status: 429 }));
  await expect(updateSkill(fixture.skill, fixture.root)).rejects.toThrow("HTTP 429");
  fixture.download.mockImplementation(async () => new Response("not a ZIP"));
  await expect(updateSkill(fixture.skill, fixture.root)).rejects.toThrow();
  fixture.download.mockReset();
  vi.unstubAllGlobals();
  // Reuse the normal ZIP fixture with a malformed commit comment.
  const invalid = await repository();
  invalid.update({ "SKILL.md": "name: example", LICENSE: "MIT" }, "invalid");
  await expect(updateSkill(invalid.skill, invalid.root)).rejects.toThrow();
});
it("rejects symlinks and archives with more than one root", async () => {
  const fixture = await repository();
  fixture.download.mockImplementation(async () => {
    const archive = new ZipFile();
    archive.addBuffer(Buffer.from("outside"), "example-HEAD/link", { mode: 0o120777 });
    archive.end({ forceZip64Format: false, comment: "a".repeat(40) });
    return new Response(await buffer(archive.outputStream));
  });
  await expect(updateSkill(fixture.skill, fixture.root)).rejects.toThrow("links or special files");
  fixture.download.mockImplementation(async () => {
    const archive = new ZipFile();
    archive.addBuffer(Buffer.from("one"), "first/file");
    archive.addBuffer(Buffer.from("two"), "second/file");
    archive.end({ forceZip64Format: false, comment: "a".repeat(40) });
    return new Response(await buffer(archive.outputStream));
  });
  await expect(updateSkill(fixture.skill, fixture.root)).rejects.toThrow("one root directory");
});
it("rejects archives above the download limit and non-GitHub sources", async () => {
  const fixture = await repository();
  fixture.download.mockImplementation(
    async () => new Response(new Uint8Array(16 * 1024 * 1024 + 1)),
  );
  await expect(updateSkill(fixture.skill, fixture.root)).rejects.toThrow("exceeds 16 MB");
  await expect(
    updateSkill({ ...fixture.skill, repository: "http://example.com/skill" }, fixture.root),
  ).rejects.toThrow("HTTPS GitHub");
});

it("updates img2threejs from upstream HEAD on successive startup refreshes and retains verified offline reuse", async () => {
  const fixture = await repository();
  fixture.update(
    { "SKILL.md": "name: img2threejs\nFirst upstream revision", LICENSE: "Apache-2.0" },
    "a".repeat(40),
  );
  const report = vi.fn();
  await refreshSkills([img2threejsSkill], fixture.root, report);
  const first = await installedSkill(img2threejsSkill, fixture.root);
  fixture.update(
    { "SKILL.md": "name: img2threejs\nLatest upstream revision", LICENSE: "Apache-2.0" },
    "b".repeat(40),
  );
  await refreshSkills([img2threejsSkill], fixture.root, report);
  const latest = await installedSkill(img2threejsSkill, fixture.root);
  expect(latest.manifest.revision).toBe("b".repeat(40));
  expect(latest.manifest.revision).not.toBe(first.manifest.revision);
  expect(await readFile(path.join(first.directory, "SKILL.md"), "utf8")).toContain(
    "First upstream",
  );
  expect(await readFile(path.join(latest.directory, "SKILL.md"), "utf8")).toContain(
    "Latest upstream",
  );
  expect(fixture.download).toHaveBeenCalledTimes(2);
  expect(fixture.download).toHaveBeenLastCalledWith(
    "https://codeload.github.com/img2threejs/img2threejs/zip/HEAD",
    expect.objectContaining({ redirect: "error" }),
  );
  fixture.download.mockRejectedValue(Error("Offline"));
  await refreshSkills([img2threejsSkill], fixture.root, report);
  expect((await installedSkill(img2threejsSkill, fixture.root)).manifest).toEqual(latest.manifest);
});
