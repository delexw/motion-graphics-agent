import { createHash } from "node:crypto";
import type { Run } from "../../shared/contracts";
import { isRunSettled } from "../../shared/contracts";
import type { GovernanceProject } from "../../shared/governance";
import type { Store } from "../jobs/store";
import { projectGovernance } from "./report";

/** Rebuild only changed projects on the requested page; do not reread unchanged event histories. */
export class GovernanceCache {
  private records = new Map<string, { key: string; project: GovernanceProject }>();
  constructor(private store: Pick<Store, "latestEventId" | "allEvents">) {}
  get(run: Run) {
    const key = `${this.store.latestEventId(run.id)}:${createHash("sha256").update(JSON.stringify(run)).digest("hex")}`;
    let entry = this.records.get(run.id);
    if (!entry || entry.key !== key) {
      entry = { key, project: projectGovernance(run, this.store.allEvents(run.id)) };
      if (this.records.size >= 100) this.records.delete(this.records.keys().next().value!);
      this.records.set(run.id, entry);
    }
    const result = structuredClone(entry.project);
    if (!isRunSettled(run)) result.durationMs = Math.max(0, Date.now() - Date.parse(run.createdAt));
    return result;
  }
}
