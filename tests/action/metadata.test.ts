import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface ActionMetadata {
  inputs: Record<string, { default?: string }>;
  outputs: Record<string, unknown>;
  runs: {
    using: string;
    main: string;
  };
}

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function actionMetadata(): ActionMetadata {
  return parse(readFileSync(resolve(repositoryRoot, "action.yml"), "utf8")) as ActionMetadata;
}

describe("GitHub Action metadata", () => {
  it("declares the public Node 24 inputs, outputs, and bundled entrypoint", () => {
    const metadata = actionMetadata();

    expect(Object.keys(metadata.inputs)).toEqual(["config", "fail-on-change"]);
    expect(metadata.inputs.config?.default).toBe("signal-scout.config.json");
    expect(metadata.inputs["fail-on-change"]?.default).toBe("false");
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
});
