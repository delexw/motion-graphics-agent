import { createConnection } from "node:net";
import { acquireFileLease } from "./file-lease";
import type { FastifyInstance } from "fastify";

const databaseInUse =
  "Another Kiteva backend is using this project database. Stop it before starting Kiteva.";
const portInUse = (port: number) =>
  `Kiteva's port ${port} is already in use. Stop the server on that port before starting Kiteva.`;

function checkBackendPort(port: number, signal: AbortSignal) {
  if (!port) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port, signal });
    socket.once("connect", () => {
      socket.destroy();
      reject(Object.assign(Error(portInUse(port)), { code: "EADDRINUSE" }));
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED") resolve();
      else reject(error);
    });
  });
}

export async function runBackend({
  prepare,
  create,
  port,
  leaseFile,
}: {
  prepare: (signal: AbortSignal) => Promise<unknown>;
  create: () => Promise<FastifyInstance>;
  port: number;
  leaseFile: string;
}) {
  const startup = new AbortController();
  let lease: Awaited<ReturnType<typeof acquireFileLease>> | undefined;
  let app: FastifyInstance | undefined;
  let started = false;
  let closing: Promise<void> | undefined;

  const close = () =>
    (closing ??= (async () => {
      try {
        await app?.close();
      } finally {
        try {
          await lease?.release();
        } finally {
          if (process.connected) process.disconnect?.();
        }
      }
    })());

  function stop() {
    startup.abort(new Error("Backend startup cancelled"));
    if (started) {
      void close().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
      });
    }
  }

  function receive(message: unknown) {
    if (message === "shutdown") stop();
  }

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  if (process.send) {
    process.on("message", receive);
    process.once("disconnect", stop);
  }

  try {
    startup.signal.throwIfAborted();
    lease = await acquireFileLease(leaseFile, startup.signal, { wait: false });
    lease.signal.addEventListener("abort", stop, { once: true });
    await checkBackendPort(port, lease.signal);
    await prepare(AbortSignal.any([lease.signal, AbortSignal.timeout(15 * 60_000)]));
    startup.signal.throwIfAborted();
    app = await create();
    startup.signal.throwIfAborted();
    const origin = await app.listen({ port, host: "127.0.0.1" });
    startup.signal.throwIfAborted();
    started = true;
    console.log(`Video agent: ${origin}`);
    if (process.connected)
      process.send?.({ type: "ready", origin }, (error: Error | null) => {
        if (error) stop();
      });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message =
      code === "ELOCKED" ? databaseInUse : code === "EADDRINUSE" ? portInUse(port) : undefined;
    if (!startup.signal.aborted && message && process.connected) {
      await new Promise<void>((resolve) => {
        process.send?.({ type: "startup-error", message }, () => resolve());
      });
    }
    await close();
    if (!startup.signal.aborted) throw message ? Error(message, { cause: error }) : error;
  }
}
