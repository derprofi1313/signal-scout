import { appendFile } from "node:fs/promises";

import { actionOutputEntries, renderActionSummary, summarizeRun } from "./summary";
import { runCli } from "../cli/index";
import type { CliIo, ScanRun } from "../core/types";

export interface ActionDependencies {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetcher?: CliIo["fetcher"];
  now?: CliIo["now"];
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

// biome-ignore lint/complexity/useRegexLiterals: the constructor keeps unsafe code points escaped in source
const unsafeDiagnosticCharacterPattern = new RegExp(
  "[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]",
  "gu",
);

function inputName(name: string): string {
  return `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
}

function actionInput(env: NodeJS.ProcessEnv, name: string): string {
  return env[inputName(name)]?.trim() ?? "";
}

function booleanInput(env: NodeJS.ProcessEnv, name: string): boolean | null {
  const input = actionInput(env, name).toLowerCase();
  if (!input || input === "false") {
    return false;
  }
  if (input === "true") {
    return true;
  }
  return null;
}

function visibleCharacterEscape(value: string): string {
  const codePoint = value.codePointAt(0);
  return codePoint === undefined ? "" : `\\u${codePoint.toString(16).padStart(4, "0")}`;
}

function forwardDiagnostics(writer: (text: string) => void, diagnostics: string): void {
  for (const line of diagnostics.split("\n")) {
    if (line.length > 0) {
      writer(
        `Signal Scout: ${line.replace(unsafeDiagnosticCharacterPattern, visibleCharacterEscape)}\n`,
      );
    }
  }
}

async function appendOutputs(path: string | undefined, run: ScanRun): Promise<void> {
  if (!path) {
    return;
  }

  const entries = actionOutputEntries(summarizeRun(run));
  await appendFile(path, entries.map(([name, value]) => `${name}=${value}\n`).join(""), "utf8");
}

async function appendSummary(path: string | undefined, run: ScanRun): Promise<void> {
  if (!path) {
    return;
  }

  await appendFile(path, renderActionSummary(run, summarizeRun(run)), "utf8");
}

export async function runAction(dependencies: ActionDependencies = {}): Promise<number> {
  const cwd = dependencies.cwd ?? process.cwd();
  const env = dependencies.env ?? process.env;
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  const config = actionInput(env, "config") || "signal-scout.config.json";
  const failOnChange = booleanInput(env, "fail-on-change");
  if (failOnChange === null) {
    forwardDiagnostics(stderr, 'Input "fail-on-change" must be either "true" or "false".');
    return 1;
  }
  let cliStdout = "";
  let cliStderr = "";

  try {
    const cliExitCode = await runCli(["scan", "--config", config], {
      cwd,
      ...(dependencies.fetcher ? { fetcher: dependencies.fetcher } : {}),
      ...(dependencies.now ? { now: dependencies.now } : {}),
      stdout: (text) => {
        cliStdout += text;
      },
      stderr: (text) => {
        cliStderr += text;
      },
    });

    forwardDiagnostics(stderr, cliStderr);
    if (!cliStdout) {
      return 1;
    }

    const run = JSON.parse(cliStdout) as ScanRun;
    await appendOutputs(env.GITHUB_OUTPUT, run);
    await appendSummary(env.GITHUB_STEP_SUMMARY, run);
    const summary = summarizeRun(run);
    if (failOnChange && summary.hasChanges) {
      forwardDiagnostics(
        stderr,
        "Changes were detected and fail-on-change is true; review the evidence before continuing.",
      );
      return 1;
    }
    return cliExitCode === 0 ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    forwardDiagnostics(stderr, `Action failed: ${message}`);
    return 1;
  }
}

if (typeof require === "function" && require.main === module) {
  void runAction().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
