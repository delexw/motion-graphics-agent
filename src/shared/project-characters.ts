import { z } from "zod";

export const ProjectCharacterSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  appearance: z.string().trim().min(1).max(4000),
  personality: z.string().trim().max(2000).default(""),
  role: z.string().trim().min(1).max(2000),
  evidence: z.string().trim().min(1).max(4000),
});
export const ProjectCharactersSchema = z
  .array(ProjectCharacterSchema)
  .max(20)
  .refine(
    (characters) => new Set(characters.map((character) => character.id)).size === characters.length,
    "Character IDs must be unique",
  );
export type ProjectCharacter = z.infer<typeof ProjectCharacterSchema>;
