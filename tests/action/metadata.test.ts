import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

interface ActionMetadata {
  inputs: Record<string, { default?: string; description?: string; required?: boolean }>;
  outputs: Record<string, unknown>;
  runs: {
    using: string;
    main: string;
  };
}

interface CiWorkflow {
  jobs: {
    verify: {
      steps: { name: string; run?: string }[];
    };
  };
}

interface BundledAction {
  runAction(dependencies: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    fetcher: (source: {
      id: string;
      name: string;
      url: string;
      kind: string;
      ignoreSelectors: string[];
    }) => Promise<{
      body: string;
      metadata: {
        capturedAt: string;
        requestedUrl: string;
        finalUrl: string;
        statusCode: number;
        contentType: string;
        bytes: number;
      };
    }>;
    now: () => Date;
    stderr: (text: string) => void;
  }): Promise<number>;
}

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const temporaryDirectories: string[] = [];
const require = createRequire(import.meta.url);
const INVISIBLE_TEXT_BREAK = "&#8203;";
const bashAvailable =
  spawnSync("bash", ["--version"], { encoding: "utf8", stdio: "ignore" }).status === 0;
const distributionGateTest = bashAvailable ? it : it.skip;

function actionMetadata(): ActionMetadata {
  return parse(readFileSync(resolve(repositoryRoot, "action.yml"), "utf8")) as ActionMetadata;
}

function distributionGate(): string {
  const workflow = parse(
    readFileSync(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8"),
  ) as CiWorkflow;
  const gate = workflow.jobs.verify.steps.find(
    (step) => step.name === "Verify the committed GitHub Action bundle",
  );
  if (!gate?.run) {
    throw new Error("The GitHub Action distribution gate is missing");
  }
  return gate.run;
}

function withoutInvisibleTextBreaks(value: string): string {
  return value.replaceAll(INVISIBLE_TEXT_BREAK, "");
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function git(directory: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("GitHub Action metadata", () => {
  if (process.env.CI && !bashAvailable) {
    it("has bash available for distribution-gate verification in CI", () => {
      expect(bashAvailable).toBe(true);
    });
  }

  it("declares the public Node 24 inputs, outputs, and bundled entrypoint", () => {
    const metadata = actionMetadata();

    expect(metadata.inputs).toEqual({
      config: {
        description: "Path to the Signal Scout configuration file.",
        required: false,
        default: "signal-scout.config.json",
      },
      "fail-on-change": {
        description: "Fail after writing evidence when a changed packet is detected.",
        required: false,
        default: "false",
      },
    });
    expect(Object.keys(metadata.outputs)).toEqual([
      "baseline-count",
      "no-change-count",
      "changed-count",
      "failed-count",
      "high-priority-change-count",
      "has-changes",
      "highest-priority",
    ]);
    expect(metadata.runs).toEqual({
      using: "node24",
      main: "dist/action/index.cjs",
    });
  });

  it("points to a runnable bundle that reports invalid action input", () => {
    const metadata = actionMetadata();
    const result = spawnSync(process.execPath, [resolve(repositoryRoot, metadata.runs.main)], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        "INPUT_FAIL-ON-CHANGE": "not-a-boolean",
      },
      encoding: "utf8",
    });

    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Signal Scout: Input "fail-on-change" must be either "true" or "false".',
    );
  });

  it("runs the exported bundle through a real config scan and GitHub environment files", async () => {
    const metadata = actionMetadata();
    const directory = await temporaryDirectory("signal-scout-bundled-action-");
    const outputPath = join(directory, "github-output");
    const summaryPath = join(directory, "github-summary");
    const configPath = join(directory, "signal-scout.config.json");
    const action = require(resolve(repositoryRoot, metadata.runs.main)) as BundledAction;
    let fetchCount = 0;
    const body = "<main><h1>Public plans</h1><p>Starter plan</p></main>";
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        sources: [
          {
            id: "public-plans",
            name: "Public plans",
            url: "https://example.com/plans",
            kind: "pricing",
            ignoreSelectors: [],
          },
        ],
      }),
      "utf8",
    );

    const exitCode = await action.runAction({
      cwd: directory,
      env: {
        NODE_ENV: "test",
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
      },
      fetcher: async (source) => {
        fetchCount += 1;
        return {
          body,
          metadata: {
            capturedAt: "2026-07-26T12:00:00.000Z",
            requestedUrl: source.url,
            finalUrl: source.url,
            statusCode: 200,
            contentType: "text/html",
            bytes: Buffer.byteLength(body),
          },
        };
      },
      now: () => new Date("2026-07-26T12:00:00.000Z"),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(fetchCount).toBe(1);
    await expect(
      readFile(join(directory, ".signal-scout", "reports", "public-plans.json"), "utf8"),
    ).resolves.toContain('"status": "baseline"');
    await expect(readFile(outputPath, "utf8")).resolves.toContain("baseline-count=1\n");
    const summary = withoutInvisibleTextBreaks(await readFile(summaryPath, "utf8"));
    expect(summary).toContain("| Public plans | baseline | 0 | none |");
  });
});

describe("GitHub Action distribution gate", () => {
  distributionGateTest(
    "rejects an untracked regenerated bundle even when the working-tree diff is empty",
    async () => {
      const directory = await temporaryDirectory("signal-scout-dist-gate-");
      const bundlePath = join(directory, "dist", "action", "index.cjs");
      await mkdir(join(directory, "dist", "action"), { recursive: true });
      await writeFile(bundlePath, "module.exports = {};\n", "utf8");
      git(directory, ["init", "--quiet"]);

      const result = spawnSync("bash", ["-euo", "pipefail", "-c", distributionGate()], {
        cwd: directory,
        encoding: "utf8",
      });

      expect(result.status).not.toBe(0);
    },
  );

  distributionGateTest("accepts a tracked bundle when the generated file is clean", async () => {
    const directory = await temporaryDirectory("signal-scout-dist-gate-");
    const bundlePath = join(directory, "dist", "action", "index.cjs");
    await mkdir(join(directory, "dist", "action"), { recursive: true });
    await writeFile(bundlePath, "module.exports = {};\n", "utf8");
    git(directory, ["init", "--quiet"]);
    git(directory, ["config", "user.email", "signal-scout@example.invalid"]);
    git(directory, ["config", "user.name", "Signal Scout tests"]);
    git(directory, ["add", "dist/action/index.cjs"]);
    git(directory, ["commit", "--quiet", "-m", "test fixture"]);

    const result = spawnSync("bash", ["-euo", "pipefail", "-c", distributionGate()], {
      cwd: directory,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
  });
});
