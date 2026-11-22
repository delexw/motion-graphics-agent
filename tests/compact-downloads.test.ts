import Fastify from "fastify";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { registerCompactDownloadRoutes } from "../src/server/rendering/compact-download-routes";
import { CompactDownloads } from "../src/server/rendering/compact-downloads";
import { compressVideo } from "../src/server/rendering/compact-video";
import { compactVideoLimitBytes } from "../src/shared/compact-video-download";
import { probeVideo } from "../src/server/rendering/video-probe";
import * as runtimeProcess from "../src/server/runtime/process";

it("returns one compression job to concurrent requests and reuses the verified file for each preset", async () => {
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
    async (_source, target, _signal, progress, checking, preset) => {
      progress(37);
      await finish;
      checking();
      await writeFile(target, preset === "10mb" ? "10 MB video" : "small video");
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
  const limitedUrl = url + "?preset=10mb";
  const limitedFile = url + "/file?preset=10mb";
  const start = (target = url) => app.inject({ method: "POST", url: target });
  try {
    expect(await readStatus()).toEqual({ status: "idle" });
    expect((await app.inject(url + "?preset=unknown")).statusCode).toBe(400);
    expect((await app.inject("/api/projects/run/preview/compact-video")).statusCode).toBe(404);
    const replies = await Promise.all([start(), start()]);
    expect(replies.every((reply) => [200, 202].includes(reply.statusCode))).toBe(true);
    await expect.poll(readStatus).toEqual({ status: "compressing", percent: 37 });
    expect(compress).toHaveBeenCalledTimes(1);
    expect((await app.inject(`${url}/file`)).statusCode).toBe(404);
    const limitedReplies = await Promise.all([start(limitedUrl), start(limitedUrl)]);
    expect(limitedReplies.every((reply) => reply.json().status === "queued")).toBe(true);
    expect((await app.inject(limitedUrl)).json().status).toBe("queued");
    expect((await app.inject(limitedFile)).statusCode).toBe(404);
    complete();
    await expect.poll(async () => (await readStatus()).status).toBe("ready");
    expect((await app.inject(`${url}/file`)).body).toBe("small video");
    expect((await start()).json().status).toBe("ready");
    await expect.poll(async () => (await app.inject(limitedUrl)).json().status).toBe("ready");
    const limited = await app.inject(limitedFile);
    expect(limited.body).toBe("10 MB video");
    expect(limited.headers["content-disposition"]).toContain("-compact-10mb.mp4");
    expect((await start(limitedUrl)).json().status).toBe("ready");
    expect(compress.mock.calls.map((call) => call[5])).toEqual(["quality", "10mb"]);
    expect((await new CompactDownloads().status(source)).status).toBe("ready");
    expect((await new CompactDownloads().status(source, "10mb")).status).toBe("ready");
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

it("retries both encoder passes at a lower bitrate when the first output exceeds 10 MB", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "compact-size-retry-"));
  const source = path.join(directory, "original.mp4");
  const target = path.join(directory, "compact.mp4");
  const passes: Array<{ number: string; bitrate: number }> = [];
  const checking = vi.fn();
  const encode = vi.spyOn(runtimeProcess, "command").mockImplementation(async (tool, args) => {
    if (tool === "ffprobe") {
      return JSON.stringify({
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 960,
            height: 540,
            pix_fmt: "yuv420p",
            avg_frame_rate: "30/1",
            nb_read_frames: "60",
          },
        ],
        format: { duration: "2" },
      });
    }
    expect(tool).toBe("ffmpeg");
    const number = args[args.indexOf("-pass:v:0") + 1];
    const bitrate = Number(args[args.indexOf("-b:v:0") + 1]);
    passes.push({ number, bitrate });
    if (number === "2") {
      const bytes = compactVideoLimitBytes + (passes.length === 2 ? 200_000 : -200_000);
      await writeFile(target, Buffer.alloc(bytes));
    }
    return "";
  });
  try {
    await writeFile(source, Buffer.alloc(2 * compactVideoLimitBytes));
    expect(
      await compressVideo(source, target, new AbortController().signal, () => {}, checking, "10mb"),
    ).toBe(true);
    expect(passes.map((pass) => pass.number)).toEqual(["1", "2", "1", "2"]);
    expect(passes[0].bitrate).toBe(passes[1].bitrate);
    expect(passes[2].bitrate).toBe(passes[3].bitrate);
    expect(passes[2].bitrate).toBeLessThan(passes[0].bitrate);
    expect((await stat(target)).size).toBeLessThanOrEqual(compactVideoLimitBytes);
    expect(checking).toHaveBeenCalledOnce();
  } finally {
    encode.mockRestore();
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

it.skipIf(!hasFfmpeg).each([
  { preset: "quality", sourceFilter: "testsrc2=s=320x180:r=30", crf: "8", width: 320, height: 180 },
  {
    preset: "10mb",
    sourceFilter: "testsrc2=s=960x540:r=30,noise=alls=100:allf=t+u",
    crf: "0",
    width: 960,
    height: 540,
  },
] as const)(
  "preserves frame size, frame rate and audio with the $preset preset",
  async ({ preset, sourceFilter, crf, width, height }) => {
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
        sourceFilter,
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440",
        "-t",
        "2",
        "-c:v",
        "libx264",
        "-crf",
        crf,
        "-c:a",
        "aac",
        source,
      ]);
      const signal = new AbortController().signal;
      const progress = vi.fn();
      const checking = vi.fn();
      if (preset === "10mb")
        expect((await stat(source)).size).toBeGreaterThan(compactVideoLimitBytes);
      expect(await compressVideo(source, output, signal, progress, checking, preset)).toBe(true);
      if (preset === "10mb")
        expect((await stat(output)).size).toBeLessThanOrEqual(compactVideoLimitBytes);
      expect(progress).toHaveBeenCalled();
      expect(checking).toHaveBeenCalledOnce();
      const probe = await probeVideo(output, signal);
      expect(probe.streams).toEqual([
        expect.objectContaining({
          codec_name: "h264",
          width,
          height,
          avg_frame_rate: "30/1",
        }),
        expect.objectContaining({ codec_name: "aac" }),
      ]);
      expect(Number(probe.format.duration)).toBe(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  40000,
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
