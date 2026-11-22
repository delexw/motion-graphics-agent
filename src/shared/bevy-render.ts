import { z } from "zod";

export const BevyRenderInputSchema = z.object({
  executable: z.string().min(1).max(240),
  shot: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
  fps: z.number().int().min(1).max(120),
  frames: z.number().int().min(1).max(3000),
});

export type BevyRenderInput = z.infer<typeof BevyRenderInputSchema>;

export type BevyRenderResult =
  | {
      kind: "frames";
      directory: string;
      filenamePattern: "frame-%06d.png";
      startNumber: 0;
      width: number;
      height: number;
      fps: number;
      frames: number;
    }
  | { kind: "error"; message: string };
