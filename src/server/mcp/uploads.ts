import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AssetOwner } from "../../shared/asset-owner";
import { assetLimits } from "../../shared/asset-limits";
import { kitevaMcpPath } from "../../shared/kiteva-mcp";
import { CodedError } from "../../shared/errors";
import type { Store } from "../jobs/store";
import { attachMcpAssetBytes, validateMcpUpload } from "./assets";

export const mcpUploadPath = `${kitevaMcpPath}/uploads`;
export const mcpUploadTokenHeader = "x-kiteva-upload-token";
export const mcpUploadContentType = "application/octet-stream";
const uploadLifetimeMs = 5 * 60_000;

type PendingUpload = {
  target: AssetOwner;
  filename: string;
  bytes: number;
  expiresAt: number;
  token: Buffer;
  timer: NodeJS.Timeout;
  received?: Buffer;
  confirming?: boolean;
};

/** A short-lived transfer belongs to one server instance and one attachment target. */
export class McpUploads {
  private readonly pending = new Map<string, PendingUpload>();

  constructor(
    private readonly store: Store,
    private readonly assetDirectory?: string,
  ) {}

  request(target: AssetOwner, filename: string, bytes: number) {
    validateMcpUpload(this.store, target, filename, bytes);
    const reservedBytes = [...this.pending.values()].reduce((sum, item) => sum + item.bytes, 0);
    if (
      this.pending.size >= assetLimits.total.count ||
      reservedBytes + bytes > assetLimits.total.bytes
    )
      throw Error("Too many pending uploads. Confirm an upload or wait for it to expire.");

    const uploadId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + uploadLifetimeMs;
    const timer = setTimeout(() => this.pending.delete(uploadId), uploadLifetimeMs).unref();
    this.pending.set(uploadId, {
      target,
      filename,
      bytes,
      token: Buffer.from(token),
      expiresAt,
      timer,
    });
    return {
      kind: "upload_requested" as const,
      uploadId,
      uploadUrl: `${mcpUploadPath}/${uploadId}`,
      method: "PUT" as const,
      headers: { "content-type": mcpUploadContentType, [mcpUploadTokenHeader]: token },
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  authorizePut(id: string, token: string | string[] | undefined) {
    const upload = this.get(id);
    const key = typeof token === "string" ? Buffer.from(token) : Buffer.alloc(0);
    if (
      !upload ||
      upload.received ||
      key.length !== upload.token.length ||
      !timingSafeEqual(key, upload.token)
    )
      throw new CodedError("ACCESS_DENIED", "Upload link is invalid, expired or already used", 403);
    return upload;
  }

  receive(id: string, token: string | string[] | undefined, buffer: Buffer) {
    const upload = this.authorizePut(id, token);
    if (buffer.length !== upload.bytes)
      throw new CodedError("INVALID_REQUEST", "Upload byte count differs from the request", 400);
    upload.received = buffer;
  }

  async confirm(id: string) {
    const upload = this.get(id);
    if (!upload || upload.confirming)
      throw Error("Upload is invalid, expired or already being confirmed");
    if (!upload.received) throw Error("Send the file to the upload link before confirming");
    upload.confirming = true;
    try {
      const asset = await attachMcpAssetBytes(
        this.store,
        upload.target,
        upload.filename,
        upload.received,
        this.assetDirectory,
      );
      return { target: upload.target, asset };
    } finally {
      this.remove(id, upload);
    }
  }

  close() {
    for (const [id, upload] of this.pending) this.remove(id, upload);
  }

  private get(id: string) {
    const upload = this.pending.get(id);
    if (upload && upload.expiresAt <= Date.now()) {
      this.remove(id, upload);
      return undefined;
    }
    return upload;
  }

  private remove(id: string, upload: PendingUpload) {
    clearTimeout(upload.timer);
    this.pending.delete(id);
  }
}
