import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runAction } from "@/action/index";
import { CaptureError } from "@/core/fetch";
import type { CliIo, FetchResult, SignalScoutSource } from "@/core/types";

const fixtureBeforeUrl = new URL("../fixtures/demo-before.html", import.meta.url);
const fixtureAfterUrl = new URL("../fixtures/demo-after.html", import.meta.url);
const temporaryDirectories: string[] = [];
const demoSource: SignalScoutSource = {
  id: "demo-pricing",
  name: "Demo pricing fixture",
  url: "https://example.com/pricing",
  kind: "pricing",
  ignoreSelectors: [".cookie-banner", "[data-volatile]"],
};

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "signal-scout-action-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeConfig(
  directory: string,
  sources: readonly SignalScoutSource[] = [demoSource],
): Promise<void> {
  await writeFile(
    join(directory, "signal-scout.config.json"),
    JSON.stringify({
      version: 1,
      sources,
    }),
    "utf8",
  );
}

function capture(body: string, source: SignalScoutSource): FetchResult {
  return {
    body,
    metadata: {
      capturedAt: "2026-07-26T10:00:00.000Z",
      requestedUrl: source.url,
      finalUrl: source.url,
      statusCode: 200,
      contentType: "text/html",
      bytes: Buffer.byteLength(body),
    },
  };
}

function actionEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("GitHub Action runner", () => {
  it("runs the real CLI scan and writes baseline outputs plus a metadata-only summary", async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, "github-output");
    const summaryPath = join(directory, "github-summary");
    const html = await readFile(fixtureBeforeUrl, "utf8");
    const fetcher: CliIo["fetcher"] = async (source) => capture(html, source);
    await writeConfig(directory);

    const exitCode = await runAction({
      cwd: directory,
      env: actionEnv({
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
      }),
      fetcher,
      now: () => new Date("2026-07-26T10:00:00.000Z"),
      stdout: () => undefined,
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    await expect(
      readFile(join(directory, ".signal-scout", "reports", "demo-pricing.json"), "utf8"),
    ).resolves.toContain('"status": "baseline"');

    const output = await readFile(outputPath, "utf8");
    expect(output).toContain("baseline-count=1\n");
    expect(output).toContain("has-changes=false\n");

    const summary = await readFile(summaryPath, "utf8");
    expect(summary).toContain("| Demo pricing fixture | baseline | 0 | none |");
    expect(summary).not.toContain("$29 per workspace / month");
  });

  it("fails on change only after a baseline exists and still writes changed outputs", async () => {
    const directory = await temporaryDirectory();
    const baselineOutputPath = join(directory, "baseline-output");
    const baselineSummaryPath = join(directory, "baseline-summary");
    const changedOutputPath = join(directory, "changed-output");
    const changedSummaryPath = join(directory, "changed-summary");
    const before = await readFile(fixtureBeforeUrl, "utf8");
    const after = await readFile(fixtureAfterUrl, "utf8");
    let body = before;
    await writeConfig(directory);

    const baselineExitCode = await runAction({
      cwd: directory,
      env: actionEnv({
        "INPUT_FAIL-ON-CHANGE": "true",
        GITHUB_OUTPUT: baselineOutputPath,
        GITHUB_STEP_SUMMARY: baselineSummaryPath,
      }),
      fetcher: async (source) => capture(body, source),
      now: () => new Date("2026-07-26T10:00:00.000Z"),
      stdout: () => undefined,
      stderr: () => undefined,
    });

    body = after;
    let diagnostics = "";
    const changedExitCode = await runAction({
      cwd: directory,
      env: actionEnv({
        "INPUT_FAIL-ON-CHANGE": "TRUE",
        GITHUB_OUTPUT: changedOutputPath,
        GITHUB_STEP_SUMMARY: changedSummaryPath,
      }),
      fetcher: async (source) => capture(body, source),
      now: () => new Date("2026-07-26T11:00:00.000Z"),
      stdout: () => undefined,
      stderr: (text) => {
        diagnostics += text;
      },
    });

    expect(baselineExitCode).toBe(0);
    expect(changedExitCode).toBe(1);
    await expect(readFile(baselineOutputPath, "utf8")).resolves.toContain("has-changes=false\n");
    await expect(readFile(changedOutputPath, "utf8")).resolves.toContain("changed-count=1\n");
    await expect(readFile(changedOutputPath, "utf8")).resolves.toContain("has-changes=true\n");
    await expect(readFile(changedSummaryPath, "utf8")).resolves.toContain(
      "| Demo pricing fixture | changed |",
    );
    expect(diagnostics).toContain("Changes were detected");
  });

  it("preserves mixed changed and failed evidence before reporting scan failure", async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, "mixed-output");
    const summaryPath = join(directory, "mixed-summary");
    const before = await readFile(fixtureBeforeUrl, "utf8");
    const after = await readFile(fixtureAfterUrl, "utf8");
    const brokenSource: SignalScoutSource = {
      id: "broken-page",
      name: "Broken page",
      url: "https://example.net/broken",
      kind: "general",
      ignoreSelectors: [],
    };
    await writeConfig(directory, [demoSource, brokenSource]);
    await runAction({
      cwd: directory,
      env: actionEnv(),
      fetcher: async (source) => capture(before, source),
      now: () => new Date("2026-07-26T10:00:00.000Z"),
      stdout: () => undefined,
      stderr: () => undefined,
    });

    let diagnostics = "";
    const exitCode = await runAction({
      cwd: directory,
      env: actionEnv({
        "INPUT_FAIL-ON-CHANGE": "true",
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
      }),
      fetcher: async (source) => {
        if (source.id === brokenSource.id) {
          throw new CaptureError("timeout", "Capture timed out after 15000 ms");
        }
        return capture(after, source);
      },
      now: () => new Date("2026-07-26T11:00:00.000Z"),
      stdout: () => undefined,
      stderr: (text) => {
        diagnostics += text;
      },
    });

    expect(exitCode).toBe(1);
    await expect(
      readFile(join(directory, ".signal-scout", "reports", "demo-pricing.json"), "utf8"),
    ).resolves.toContain('"status": "changed"');
    await expect(
      readFile(join(directory, ".signal-scout", "reports", "broken-page.json"), "utf8"),
    ).resolves.toContain('"status": "failed"');
    const output = await readFile(outputPath, "utf8");
    expect(output).toContain("changed-count=1\n");
    expect(output).toContain("failed-count=1\n");
    const summary = await readFile(summaryPath, "utf8");
    expect(summary).toContain("| Demo pricing fixture | changed |");
    expect(summary).toContain("| Broken page | failed |");
    expect(diagnostics.indexOf("1 source failed")).toBeGreaterThanOrEqual(0);
    expect(diagnostics.indexOf("Changes were detected")).toBeGreaterThan(
      diagnostics.indexOf("1 source failed"),
    );
  });

  it("rejects an invalid fail-on-change input before scanning", async () => {
    const directory = await temporaryDirectory();
    let fetchCount = 0;
    let diagnostics = "";
    await writeConfig(directory);

    const exitCode = await runAction({
      cwd: directory,
      env: actionEnv({ "INPUT_FAIL-ON-CHANGE": "yes" }),
      fetcher: async (source) => {
        fetchCount += 1;
        return capture("<main>should not scan</main>", source);
      },
      now: () => new Date("2026-07-26T10:00:00.000Z"),
      stdout: () => undefined,
      stderr: (text) => {
        diagnostics += text;
      },
    });

    expect(exitCode).toBe(1);
    expect(fetchCount).toBe(0);
    expect(diagnostics).toContain('Input "fail-on-change" must be either "true" or "false".');
  });

  it("succeeds locally when GitHub environment-file paths are absent", async () => {
    const directory = await temporaryDirectory();
    const html = await readFile(fixtureBeforeUrl, "utf8");
    let diagnostics = "";
    await writeConfig(directory);

    const exitCode = await runAction({
      cwd: directory,
      env: actionEnv(),
      fetcher: async (source) => capture(html, source),
      now: () => new Date("2026-07-26T10:00:00.000Z"),
      stdout: () => undefined,
      stderr: (text) => {
        diagnostics += text;
      },
    });

    expect(exitCode).toBe(0);
    await expect(
      readFile(join(directory, ".signal-scout", "reports", "demo-pricing.json"), "utf8"),
    ).resolves.toContain('"status": "baseline"');
    expect(diagnostics).toContain("Scanned 1 source; 0 sources failed.");
    expect(diagnostics).not.toContain("::");
  });
});
