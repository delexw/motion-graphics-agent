import sharp from "sharp";

export const lpcFrameSize = 64;
export const lpcDirections = ["up", "left", "down", "right"] as const;
const columns = { walk: 9, idle: 2 };

export function lpcSheetGrid(animation: keyof typeof columns) {
  return { width: columns[animation] * lpcFrameSize, height: lpcDirections.length * lpcFrameSize };
}

export async function lpcSheetMatchesGrid(input: string | Buffer, animation: keyof typeof columns) {
  const { width, height } = lpcSheetGrid(animation);
  const image = await sharp(input, { limitInputPixels: width * height }).metadata();
  return image.format === "png" && image.width === width && image.height === height;
}
