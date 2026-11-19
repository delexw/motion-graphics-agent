import Fastify from "fastify";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { registerCompactDownloadRoutes } from "../src/server/rendering/compact-download-routes";
import { CompactDownloads } from "../src/server/rendering/compact-downloads";
import { compressVideo } from "../src/server/rendering/compact-video";
import { probeVideo } from "../src/server/rendering/video-probe";

it("returns one compression job to concurrent requests and reuses the verified file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "compact-download-"));
  const source = path.join(directory, "full.mp4");
  await writeFile(source, "original video fixture");
  const app = Fastify();
  const controller = new AbortController();
  let complete!: () => void;
  const finish = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const compress = vi.fn<typeof compressVideo>(
    async (_source, target, _signal, progress, checking) => {
      progress(37);
      await finish;
      checking();
      await writeFile(target, "small video");
      return true;
    },
  );
  const job = {
    id: "job",
    runId: "run",
    candidateId: "direction",
    kind: "full",
    phase: "ready",
    outputType: "video",
    video: "full.mp4",
    duration: 2,
    model: "fixture",
    version: 1,
    workspace: directory,
  } as const;
  const run: Run = {
    id: "run",
    request: RequestSchema.parse({ instructions: "Make a short test animation" }),
    phase: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    candidates: [],
    jobs: [job, { ...job, id: "preview", kind: "preview" }],
  };
  registerCompactDownloadRoutes(
    app,
    () => run,
    async () => source,
    {
      projectDependency: async (_run, _signal, work) => work(controller.signal),
    },
    new CompactDownloads(compress),
  );
  const url = "/api/projects/run/job/compact-video";
  const readStatus = async () => (await app.inject(url)).json();
  const start = () => app.inject({ method: "POST", url });
  try {
    expect(await readStatus()).toEqual({ status: "idle" });
    expect((await app.inject("/api/projects/run/preview/compact-video")).statusCode).toBe(404);
    const replies = await Promise.all([start(), start(), start()]);
    expect(replies.every((reply) => [200, 202].includes(reply.statusCode))).toBe(true);
    await expect.poll(readStatus).toEqual({ status: "compressing", percent: 37 });
    expect(compress).toHaveBeenCalledTimes(1);
    expect((await app.inject(`${url}/file`)).statusCode).toBe(404);
    complete();
    await expect.poll(async () => (await readStatus()).status).toBe("ready");
    expect((await app.inject(`${url}/file`)).body).toBe("small video");
    expect((await start()).json().status).toBe("ready");
    expect(compress).toHaveBeenCalledTimes(1);
    expect((await new CompactDownloads().status(source)).status).toBe("ready");
    expect(await readFile(source, "utf8")).toBe("original video fixture");
    await writeFile(source, "changed original video fixture");
    expect(await readStatus()).toEqual({ status: "idle" });
  } finally {
    complete();
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("keeps the original when compression makes no useful saving and can retry a failed job", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "compact-original-"));
  const source = path.join(directory, "full.mp4");
  try {
    await writeFile(source, "original video fixture");
    const compress = vi
      .fn<typeof compressVideo>()
      .mockRejectedValueOnce(Error("Fixture encoder failed"))
      .mockResolvedValueOnce(false);
    const downloads = new CompactDownloads(compress);
    const run = (work: (signal: AbortSignal) => Promise<void>) =>
      work(new AbortController().signal);
    await downloads.start(source, run);
    await expect.poll(async () => (await downloads.status(source)).status).toBe("failed");
    await downloads.start(source, run);
    await expect.poll(async () => (await downloads.status(source)).status).toBe("original");
    expect(await downloads.start(source, run)).toEqual({ status: "original" });
    expect(await downloads.file(source)).toBeUndefined();
    expect(compress).toHaveBeenCalledTimes(2);
    expect((await readdir(directory)).filter((file) => file.startsWith(".compress-"))).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const hasFfmpeg = (() => {
  try {
    return execFileSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" }).includes(
      "libx264",
    );
  } catch {
    return false;
  }
})();

it.skipIf(!hasFfmpeg)(
  "makes a verified MP4 with the original frame size, frame rate, and audio",
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "compact-ffmpeg-"));
    try {
      const source = path.join(directory, "original.mp4");
      const output = path.join(directory, "compact.mp4");
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=320x180:r=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440",
        "-t",
        "2",
        "-c:v",
        "libx264",
        "-crf",
        "8",
        "-c:a",
        "aac",
        source,
      ]);
      const signal = new AbortController().signal;
      const progress = vi.fn();
      const checking = vi.fn();
      expect(await compressVideo(source, output, signal, progress, checking)).toBe(true);
      expect(progress).toHaveBeenCalled();
      expect(checking).toHaveBeenCalledOnce();
      const probe = await probeVideo(output, signal);
      expect(probe.streams).toEqual([
        expect.objectContaining({
          codec_name: "h264",
          width: 320,
          height: 180,
          avg_frame_rate: "30/1",
        }),
        expect.objectContaining({ codec_name: "aac" }),
      ]);
      expect(Number(probe.format.duration)).toBe(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  20000,
);

it("cleans up a cancelled encode and lets the user try again", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "compact-cancel-"));
  const source = path.join(directory, "full.mp4");
  const controller = new AbortController();
  try {
    await writeFile(source, "original video fixture");
    const compress = vi.fn<typeof compressVideo>(async (_source, target, signal, progress) => {
      await writeFile(target, "partial video");
      progress(40);
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
      return true;
    });
    const downloads = new CompactDownloads(compress);
    await downloads.start(source, (work) => work(controller.signal));
    await expect
      .poll(() => downloads.status(source))
      .toEqual({ status: "compressing", percent: 40 });
    controller.abort();
    await expect.poll(() => downloads.status(source)).toEqual({ status: "failed" });
    expect(await readdir(directory)).toEqual(["full.mp4"]);
    expect(await downloads.file(source)).toBeUndefined();
  } finally {
    controller.abort();
    await rm(directory, { recursive: true, force: true });
  }
});
