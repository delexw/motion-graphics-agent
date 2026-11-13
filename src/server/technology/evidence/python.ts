import type { TechnologyEvidenceContext, TechnologyUsageDetector } from "./contracts";
export class PythonAssetEvidenceDetector implements TechnologyUsageDetector {
  async detect(context: TechnologyEvidenceContext) {
    const { id, chosen, observation, executions, observationUnchanged, hashFile } = context;
    const usageEvidence: string[] = [];
    if (chosen?.ecosystem === "python") {
      for (const execution of [...executions].reverse()) {
        if (
          execution.interpreter !== chosen.pythonExecutable ||
          !execution.technologies.some(
            (entry) =>
              entry.id === id &&
              entry.package === chosen.package &&
              entry.version === chosen.version,
          )
        )
          continue;
        try {
          if ((await hashFile(execution.script)) !== execution.scriptSha256) continue;
          let valid = true;
          for (const output of execution.outputs)
            if ((await hashFile(output.path)) !== output.sha256) valid = false;
          if (!valid) continue;
          usageEvidence.push("Python execution verified");
          if (
            execution.outputs.some(
              (output) => observation?.resources[output.path] === output.sha256,
            ) &&
            (await observationUnchanged())
          )
            usageEvidence.push("Generated asset loaded");
          break;
        } catch {
          /* Changed or unavailable artifacts invalidate the execution observation. */
        }
      }
    }
    return usageEvidence;
  }
}
