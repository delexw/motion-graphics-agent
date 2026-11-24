import { safeMessage } from "../../../runtime/config";

type PixelAssetError = { kind: "error"; message: string };

export async function pixelToolResult<T extends { kind: string }>(operation: () => Promise<T>) {
  try {
    const structuredContent = await operation();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
      structuredContent,
    };
  } catch (error) {
    const structuredContent: PixelAssetError = { kind: "error", message: safeMessage(error) };
    return {
      content: [{ type: "text" as const, text: structuredContent.message }],
      structuredContent,
      isError: true,
    };
  }
}
