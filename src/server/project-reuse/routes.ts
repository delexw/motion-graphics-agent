import type { FastifyInstance } from "fastify";
import type { Store } from "../jobs/store";
import type { Catalog } from "../catalog/catalog";
import { CreateProjectReuseSchema, projectReuseSource } from "../../shared/project-reuse";
import { createProjectReuseDraft } from "./create";
import { readSourceCharacters } from "./characters";

/** One registration for the production API and Vite's development API. */
export function registerProjectReuseRoutes(
  app: FastifyInstance,
  store: Store,
  catalog: Pick<Catalog, "styles">,
) {
  app.post("/api/project-reuse", async (req) =>
    createProjectReuseDraft(store, catalog, CreateProjectReuseSchema.parse(req.body)),
  );
  app.get<{ Params: { projectId: string; jobId: string } }>(
    "/api/project-reuse/:projectId/:jobId/characters",
    async (req) => {
      const project = store.get(req.params.projectId);
      const source = project && projectReuseSource(project, req.params.jobId);
      if (!source) throw Error("Choose a completed video version in this project");
      return { characters: await readSourceCharacters(source) };
    },
  );
}
