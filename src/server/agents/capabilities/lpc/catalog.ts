import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { lpcSheetMatchesGrid } from "./sheet";

export const lpcBodyTypes = ["male", "female", "muscular", "pregnant", "teen", "child"] as const;
export const lpcAnimations = ["idle", "walk"] as const;
const pathSegment = "[a-zA-Z0-9_.-]+";
const partPath = new RegExp(`^${pathSegment}(?:/${pathSegment})*$`);
const creditSchema = z.object({
  file: z.string(),
  authors: z.array(z.string().trim().min(1)).nonempty(),
  licenses: z.array(z.string()),
  urls: z.array(z.url({ protocol: /^https?$/ })).nonempty(),
  notes: z.string().optional(),
});
const definitionSchema = z.looseObject({
  name: z.string(),
  animations: z.array(z.string()),
  credits: z.array(z.unknown()),
});
const layerSchema = z.looseObject({ zPos: z.number().finite() });
const ccBy30 = { name: "CC BY 3.0", url: "https://creativecommons.org/licenses/by/3.0/" };
const ogaBy30 = {
  licence: "OGA-BY 3.0",
  licenceUrl: "https://static.opengameart.org/OGA-BY-3.0.txt",
  section: "8(g)",
} as const;
const ogaBy30Label = /^OGA-BY[ -]3\.0\+?$/;
const allowedLicences = [
  {
    match: /^CC0(?: 1\.0)?$/,
    name: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    match: /^CC-BY 4\.0\+?$/,
    name: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    match: /^CC-BY 3\.0\+?$/,
    ...ccBy30,
  },
];

type LpcCredit = Omit<z.infer<typeof creditSchema>, "licenses"> & {
  licence: string;
  licenceUrl: string;
  licenceBasis?: typeof ogaBy30;
};
type LpcLayer = { file: string; z: number; credits: LpcCredit[] };
export type LpcPart = { id: string; name: string; layers: LpcLayer[] };
type LpcBody = (typeof lpcBodyTypes)[number];
type LpcAnimation = (typeof lpcAnimations)[number];

function safeRelative(file: string) {
  return (
    partPath.test(file) && file.split("/").every((segment) => segment !== "." && segment !== "..")
  );
}

function creditsFor(file: string, entries: unknown[]): LpcCredit[] | undefined {
  const candidates = entries.flatMap((entry) => {
    const key = z.object({ file: z.string() }).safeParse(entry);
    if (!key.success) return [];
    const prefix = key.data.file.replace(/(?:\.png|\/)$/, "");
    const stem = file.replace(/\.png$/, "");
    return stem === prefix || stem.startsWith(prefix + "/")
      ? [{ entry, length: prefix.length }]
      : [];
  });
  const mostSpecific = Math.max(...candidates.map(({ length }) => length));
  const credits: LpcCredit[] = [];
  for (const { entry, length } of candidates) {
    if (length !== mostSpecific) continue;
    const parsed = creditSchema.safeParse(entry);
    if (!parsed.success) return;
    const { licenses, ...details } = parsed.data;
    const direct = allowedLicences.find(({ match }) => licenses.some((name) => match.test(name)));
    // OGA-BY 3.0 section 8(g) lets recipients distribute the work under CC BY 3.0.
    const licenceBasis =
      !direct && licenses.some((name) => ogaBy30Label.test(name)) ? ogaBy30 : undefined;
    const licence = direct ?? (licenceBasis ? ccBy30 : undefined);
    if (!licence) return;
    credits.push({
      ...details,
      licence: licence.name,
      licenceUrl: licence.url,
      ...(licenceBasis ? { licenceBasis } : {}),
    });
  }
  return credits.length ? credits : undefined;
}

async function layerVariants(
  spriteRoot: string,
  base: string,
  animation: LpcAnimation,
  z: number,
  entries: unknown[],
) {
  const prefix = `${base}${animation}`;
  const absolute = path.join(spriteRoot, prefix);
  // The upstream standard layout stores a base PNG or a directory of pre-coloured PNGs.
  const [baseFile, files] = await Promise.all([
    lstat(absolute + ".png").catch(() => undefined),
    readdir(absolute, { withFileTypes: true }).catch(() => []),
  ]);
  const candidates = files
    .filter((file) => file.isFile() && file.name.endsWith(".png") && safeRelative(file.name))
    .map((file) => ({ variant: file.name.slice(0, -4), file: prefix + "/" + file.name }));
  if (baseFile?.isFile()) candidates.unshift({ variant: "base", file: prefix + ".png" });
  const layers = await Promise.all(
    candidates.map(async ({ variant, file }) => {
      const credits = creditsFor(file, entries);
      if (!credits) return;
      const target = path.join(spriteRoot, file);
      if ((await realpath(target).catch(() => undefined)) !== target) return;
      const matchesGrid = await lpcSheetMatchesGrid(target, animation).catch(() => false);
      if (matchesGrid) return [variant, { file, z, credits }] as const;
    }),
  );
  return new Map<string, LpcLayer>(layers.filter((layer) => layer !== undefined));
}

async function definitionParts(
  spriteRoot: string,
  definitionId: string,
  input: unknown,
  body: LpcBody,
  animation: LpcAnimation,
) {
  const definition = definitionSchema.safeParse(input);
  if (!definition.success || !definition.data.animations.includes(animation)) return [];
  const { name, credits } = definition.data;
  const layers = Object.entries(definition.data).filter(([key]) => /^layer_\d+$/.test(key));
  if (!layers.length) return [];
  const layerSpecs = layers.map(([, value]) => {
    const layer = layerSchema.safeParse(value);
    if (!layer.success || layer.data.custom_animation) return;
    const base = layer.data[body];
    if (typeof base !== "string" || !base.endsWith("/") || !safeRelative(base.slice(0, -1))) return;
    return { base, z: layer.data.zPos };
  });
  // Skip the entire part if one of its layers is unsupported or unlicensed.
  if (layerSpecs.some((layer) => layer === undefined)) return [];
  const variants = await Promise.all(
    layerSpecs.map((layer) => layerVariants(spriteRoot, layer!.base, animation, layer!.z, credits)),
  );
  const options: LpcPart[] = [];
  for (const variant of new Set(variants.flatMap((layer) => [...layer.keys()]))) {
    const selected = variants.map((layer) => layer.get(variant) ?? layer.get("base"));
    if (selected.every((layer) => layer !== undefined))
      options.push({
        id: `${definitionId}:${variant}`,
        name: variant === "base" ? name : `${name} (${variant})`,
        layers: selected,
      });
  }
  return options;
}

export function lpcCatalogue(root: string) {
  const definitionsRoot = path.join(root, "sheet_definitions");
  const spriteRoot = path.join(root, "spritesheets");
  const cache = new Map<string, Promise<LpcPart[]>>();
  const readParts = async (body: LpcBody, animation: LpcAnimation) => {
    const parts: LpcPart[] = [];
    const canonicalSpriteRoot = path.join(await realpath(root), "spritesheets");
    const files = (await readdir(definitionsRoot, { recursive: true, withFileTypes: true }))
      .filter((file) => file.isFile() && file.name.endsWith(".json"))
      .map((file) => path.join(file.parentPath, file.name))
      .sort();
    for (let offset = 0; offset < files.length; offset += 64) {
      const batch = await Promise.all(
        files.slice(offset, offset + 64).map(async (file) => {
          const id = path.relative(definitionsRoot, file).split(path.sep).join("/").slice(0, -5);
          const definition: unknown = JSON.parse(await readFile(file, "utf8"));
          return definitionParts(canonicalSpriteRoot, id, definition, body, animation);
        }),
      );
      parts.push(...batch.flat());
    }
    return parts;
  };
  return {
    list(body: LpcBody, animation: LpcAnimation) {
      const key = `${body}/${animation}`;
      const existing = cache.get(key);
      if (existing) return existing;
      const parts = readParts(body, animation).catch((error) => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, parts);
      return parts;
    },
    async image(file: string) {
      const target = path.join(spriteRoot, file);
      const [actual, canonicalRoot] = await Promise.all([realpath(target), realpath(root)]);
      if (actual !== path.join(canonicalRoot, "spritesheets", file))
        throw Error("LPC sprite paths cannot use symbolic links.");
      return sharpInput(target);
    },
  };
}

async function sharpInput(target: string) {
  const info = await lstat(target);
  if (!info.isFile() || info.size > 4 * 1024 * 1024)
    throw Error("The LPC layer must be a regular PNG of at most 4 MiB.");
  return readFile(target);
}
