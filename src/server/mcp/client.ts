import {
  SettingsConflictError,
  RequestSettingsReviewSchema,
} from "../../shared/request-settings-review";
import { CodedError, parseErrorCode } from "../../shared/errors";
import { z } from "zod";
import type { VideoRequest } from "../../shared/domains/video";
import { port } from "../runtime/config";

/** Submit through the same validation and workflow entry point as the application. */
export async function startIdeaThroughBackend(request: VideoRequest) {
  const response = await fetch(`http://127.0.0.1:${port}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(70000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (body?.code === "SETTINGS_CONFLICT") {
      const details = RequestSettingsReviewSchema.safeParse(body.details);
      if (details.success) throw new SettingsConflictError(details.data);
    }
    const error = z.object({ error: z.string() }).safeParse(body);
    throw new CodedError(
      parseErrorCode(body?.code),
      error.success ? error.data.error : `Kiteva rejected the build (${response.status}).`,
      response.status,
    );
  }
  return z.object({ id: z.string(), phase: z.string() }).parse(await response.json());
}
