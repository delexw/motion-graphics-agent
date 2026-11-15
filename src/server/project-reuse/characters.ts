import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { ProjectCharactersSchema } from "../../shared/project-characters";
import type { ProjectReuseSource } from "../../shared/project-reuse";

/** Historical versions may have an inspected snapshot; never guess identities from prose. */
export async function readSourceCharacters(source: ProjectReuseSource) {
  if (source.job.production?.characters !== undefined)
    return ProjectCharactersSchema.parse(source.job.production.characters);
  try {
    const root = await realpath(source.job.workspace);
    const file = await realpath(path.join(root, "CHARACTER_REFERENCES.json"));
    if (path.dirname(file) !== root)
      throw Error("Character snapshot must stay inside its source workspace");
    if ((await stat(file)).size > 128_000) throw Error("Character snapshot is too large");
    return ProjectCharactersSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function selectedSourceCharacters(
  source: ProjectReuseSource,
  keep: boolean,
  ids?: string[],
) {
  if (!keep) {
    if (ids?.length) throw Error("Enable character inheritance before selecting characters");
    return [];
  }
  const available = await readSourceCharacters(source);
  const selectedIds = ids ?? available.map((character) => character.id);
  if (!selectedIds.length && available.length)
    throw Error("Select at least one recorded character to inherit");
  if (selectedIds.some((id) => !available.some((character) => character.id === id)))
    throw Error("Selected character is not recorded in this source version");
  return available.filter((character) => selectedIds.includes(character.id));
}
