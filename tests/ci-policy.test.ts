import { globSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile, chmod, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { expect, it } from "vitest";

const step = z.object({
  name: z.string().optional(),
  run: z.string().optional(),
  if: z.string().optional(),
});
const workflow = z.object({
  on: z.record(z.string(), z.unknown()),
  jobs: z.record(
    z.string(),
    z.object({ if: z.string().optional(), "runs-on": z.string(), steps: z.array(step) }),
  ),
});
const load = (name: string) =>
  workflow.parse(
    parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8")),
  );
const ci = load("native-windows");
const merge = load("dependabot-auto-merge");

it("checks every PR without path filters and runs the entire suite alongside native Windows", () => {
  expect(ci.on.pull_request).toBeNull();
  expect(ci.jobs.quality["runs-on"]).toBe("macos-15");
  const commands = ci.jobs.quality.steps.map((s) => s.run ?? "").join("\n");
  for (const command of [
    "npm run format:check",
    "npm run lint",
    "npm run build",
    "npm test -- --maxWorkers=1",
  ])
    expect(commands).toContain(command);
  expect(commands).not.toContain("npm test -- tests/");
  expect(commands).toContain("npm run multiplane:setup");
  expect(ci.jobs["native-windows"].steps.some((s) => s.run === "npm run windows:check")).toBe(true);
});

it("checks every speech requirements file against the adapters without downloading models", () => {
  const speech = ci.jobs["speech-dependencies"];
  expect(speech["runs-on"]).toBe("macos-15");
  const commands = speech.steps.map((s) => s.run ?? "").join("\n");
  const requirements = globSync("src/server/audio/providers/**/*requirements*.txt");
  expect(requirements.length).toBeGreaterThan(0);
  for (const file of requirements) expect(commands).toContain(`-r ${file}`);
  for (const engine of ["kokoro", "pocket", "pocket-zh", "ming"])
    expect(commands).toContain(`scripts/check-speech-libraries.py ${engine}`);
  expect(commands).not.toContain("speech:setup");
});

it.each([
  {
    success: true,
    numTotalTests: 2,
    numPassedTests: 2,
    numPendingTests: 0,
    numTodoTests: 0,
    accepted: true,
  },
  {
    success: true,
    numTotalTests: 2,
    numPassedTests: 1,
    numPendingTests: 1,
    numTodoTests: 0,
    accepted: false,
  },
  {
    success: true,
    numTotalTests: 2,
    numPassedTests: 1,
    numPendingTests: 0,
    numTodoTests: 1,
    accepted: false,
  },
  {
    success: true,
    numTotalTests: 0,
    numPassedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    accepted: false,
  },
  {
    success: false,
    numTotalTests: 2,
    numPassedTests: 1,
    numPendingTests: 0,
    numTodoTests: 0,
    accepted: false,
  },
])(
  "executes the no-skipped-tests gate against report $accepted/$numPendingTests/$numTodoTests/$numTotalTests",
  async (report) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "ci-report-"));
    try {
      await writeFile(path.join(folder, "test-results.json"), JSON.stringify(report));
      const command = ci.jobs.quality.steps.find(
        (s) => s.name === "Reject skipped or missing tests",
      )!.run!;
      const result = spawnSync("bash", ["-e", "-c", command], { cwd: folder, encoding: "utf8" });
      expect(result.status === 0).toBe(report.accepted);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);

it("allows every dependency ecosystem and update size while trusting only same-repository Dependabot", () => {
  expect(merge.jobs["auto-merge"].if).toContain("dependabot[bot]");
  expect(merge.jobs["auto-merge"].if).toContain("head.repo.full_name == github.repository");
  expect(merge.jobs["auto-merge"].steps.every((s) => !s.if)).toBe(true);
  expect(merge.jobs["auto-merge"].steps.map((s) => s.run).join("\n")).not.toContain("checkout");
});

it.each([
  ["Full test suite, lint and format", "success"],
  ["Full test suite, lint and format", "failure"],
  ["Full test suite, lint and format", "skipped"],
  ["Full test suite, lint and format", "cancelled"],
  ["Full test suite, lint and format", "missing"],
  ["Python speech dependencies", "failure"],
  ["Python speech dependencies", "missing"],
])("executes auto-merge when the %s job is %s", async (checkedJob, conclusion) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "ci-merge-"));
  try {
    const jobs = [
      "native-windows",
      "Full test suite, lint and format",
      "Python speech dependencies",
    ]
      .map((name) => ({ name, conclusion: name === checkedJob ? conclusion : "success" }))
      .filter((job) => job.conclusion !== "missing");
    await writeFile(path.join(folder, "jobs.json"), JSON.stringify({ jobs }));
    const gh = path.join(folder, "gh");
    await writeFile(
      gh,
      `#!/usr/bin/env node
const fs=require('node:fs');const {execFileSync}=require('node:child_process');
const a=process.argv.slice(2);fs.appendFileSync('calls.jsonl',JSON.stringify(a)+'\\n');
if(a[0]==='run'&&a[1]==='list') console.log('123');
else if(a[0]==='run'&&a[1]==='view') process.stdout.write(execFileSync('jq',[a[a.indexOf('--jq')+1],'jobs.json']));
else if(a[0]==='pr'&&a[1]==='merge'&&!a.includes('--match-head-commit')) process.exit(1);
`,
    );
    await chmod(gh, 0o755);
    const command = merge.jobs["auto-merge"].steps[0].run!;
    const result = spawnSync("bash", ["-e", "-c", command], {
      cwd: folder,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${folder}${path.delimiter}${process.env.PATH}`,
        HEAD_SHA: "checked-sha",
        PR_URL: "https://example.com/pull/1",
        PR_NUMBER: "1",
        GH_REPO: "example/my-app",
        BASE_BRANCH: "main",
      },
    });
    const calls = await readFile(path.join(folder, "calls.jsonl"), "utf8");
    expect(result.status === 0).toBe(conclusion === "success");
    expect(calls.includes('"merge"')).toBe(conclusion === "success");
    expect(calls.includes("event=APPROVE")).toBe(conclusion === "success");
    if (conclusion === "success") {
      expect(calls).toContain('"--match-head-commit","checked-sha"');
      expect(calls).toContain('"workflow","run","native-windows.yml","--ref","main"');
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
