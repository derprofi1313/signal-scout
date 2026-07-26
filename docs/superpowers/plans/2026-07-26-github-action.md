# Signal Scout GitHub Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Signal Scout v0.2.0 as a directly consumable, evidence-safe GitHub JavaScript Action.

**Architecture:** A pure action-summary module aggregates an existing `ScanRun`;
an environment-bound action runner invokes the real CLI and writes GitHub output
and summary files. A Node 24 CommonJS bundle is committed and reproduced in CI,
while baseline caching and artifact upload remain explicit caller workflow
steps.

**Tech Stack:** TypeScript 5.9, Node.js 24, pnpm 11.6.0, Vitest 4, esbuild 0.28, GitHub Actions metadata.

## Global Constraints

- Preserve `signal-scout/evidence@1` and the existing CLI stdout and exit-code contract.
- Root action metadata uses `runs.using: node24` and `runs.main: dist/action/index.cjs`.
- The action requests no token, performs no GitHub API writes, and never commits, opens pull requests, uploads artifacts, or manages caches.
- Only source metadata enters the job summary; captured before/after fragments never do.
- Treat source names as untrusted Markdown/HTML and keep the summary below GitHub's 1 MiB per-step limit.
- `config` defaults to `signal-scout.config.json`; `fail-on-change` defaults to `"false"` and accepts only booleans.
- Generated `dist/action/index.cjs` is committed and must reproduce byte-for-byte in CI.
- Version all public surfaces as `0.2.0`; do not imply npm publication, Marketplace adoption, or a hosted service.

---

### Task 1: Pure action summary contract

**Files:**

- Create: `src/action/summary.ts`
- Create: `tests/action/summary.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**

- Consumes: `ScanRun`, `EvidencePacket`, and `Priority` from `src/core/types.ts`.
- Produces:
  - `type HighestPriority = Priority | "none"`
  - `interface ActionRunSummary`
  - `summarizeRun(run: ScanRun): ActionRunSummary`
  - `renderActionSummary(run: ScanRun, summary: ActionRunSummary): string`
  - `actionOutputEntries(summary: ActionRunSummary): readonly [string, string][]`

- [ ] **Step 1: Write the failing aggregation test**

Create packets with literal statuses `baseline`, `no_change`, `changed`, and
`failed`. The changed packet has one low and two high changes. Assert the
literal output:

```ts
expect(summarizeRun(run)).toEqual({
  baselineCount: 1,
  noChangeCount: 1,
  changedCount: 1,
  failedCount: 1,
  highPriorityChangeCount: 2,
  hasChanges: true,
  highestPriority: "high",
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/action/summary.test.ts`

Expected: FAIL because `@/action/summary` does not exist.

- [ ] **Step 3: Implement minimal aggregation**

Walk `run.packets` once, count exact packet statuses, count changes whose
`priority === "high"`, and promote `none < low < medium < high`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm vitest run tests/action/summary.test.ts`

Expected: PASS with one test.

- [ ] **Step 5: Write failing output and rendering tests**

Assert the seven literal output name/value pairs from the design. Render a
packet whose source name contains `|`, `<script>`, a newline, a bidi override,
and a C0 control. Assert that the result:

- contains one table row per packet;
- contains escaped `\|` and `&lt;script&gt;`;
- does not contain raw `<script>`, the bidi override, or the C0 control;
- does not contain any `before` or `after` evidence fragment.

- [ ] **Step 6: Run the focused tests and verify RED**

Run: `pnpm vitest run tests/action/summary.test.ts`

Expected: FAIL because output serialization and Markdown rendering are absent.

- [ ] **Step 7: Implement safe outputs and bounded Markdown**

Use literal output values and escape backslashes, table pipes, HTML metacharacters,
line breaks, and unsafe control/bidi code points. Render only source name,
status, total changes, highest priority, and packet ID.

- [ ] **Step 8: Extend coverage and verify GREEN**

Add `src/action/**/*.ts` to Vitest coverage includes.

Run: `pnpm vitest run tests/action/summary.test.ts`

Expected: all summary tests pass.

- [ ] **Step 9: Verify and commit**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

Commit: `feat: define GitHub Action scan summaries`

### Task 2: Real action runner and bundle-safe CLI entry

**Files:**

- Create: `src/action/index.ts`
- Create: `src/cli/main.ts`
- Create: `tests/action/action.test.ts`
- Modify: `src/cli/index.ts`
- Modify: `scripts/build-cli.mjs`
- Modify: `tests/cli/cli.test.ts`

**Interfaces:**

- Consumes: Task 1's `summarizeRun`, `renderActionSummary`, and
  `actionOutputEntries`; existing `runCli`; `CliIo["fetcher"]` and
  `CliIo["now"]`.
- Produces:

```ts
export interface ActionDependencies {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetcher?: CliIo["fetcher"];
  now?: CliIo["now"];
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export async function runAction(dependencies?: ActionDependencies): Promise<number>;
```

Return `0` for success and `1` for any action failure. The direct entry sets
`process.exitCode` to the returned value.

- [ ] **Step 1: Write a failing real-scan action test**

Create a temporary valid config and inject the existing synthetic HTML fetcher
and fixed clock. Set real temporary `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY`
paths in the injected environment. Call `runAction` and assert:

- return code `0`;
- the real `.signal-scout/reports/<source>.json` exists;
- the output file contains literal baseline and boolean values;
- the summary contains the source row but no captured fragment.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/action/action.test.ts`

Expected: FAIL because `@/action/index` does not exist.

- [ ] **Step 3: Make the CLI safe to import from a bundle**

Move only the direct `process.argv` bootstrap into `src/cli/main.ts`. Keep
`runCli` and `isDirectCliEntry` in `src/cli/index.ts`. Change
`scripts/build-cli.mjs` to use `src/cli/main.ts` while continuing to emit
`dist/cli/index.js`. Adjust the CLI direct-entry test to target `main.ts`.

- [ ] **Step 4: Implement the minimal real action path**

Read GitHub inputs from `INPUT_<UPPERCASE NAME>` using the same space-to-underscore
rule as GitHub's toolkit, invoke the real CLI with captured writers, parse its
JSON `ScanRun`, write output and summary files when their paths exist, and
forward sanitized diagnostics. Do not emit workflow command syntax.

- [ ] **Step 5: Run focused CLI and action tests and verify GREEN**

Run:
`pnpm vitest run tests/cli/cli.test.ts tests/action/action.test.ts`

Expected: both files pass.

- [ ] **Step 6: Write failing boundary tests**

Add separate tests for:

- `fail-on-change: true` failing only after a second fixture scan changes;
- a mixed successful/failed scan writing outputs and summary, then returning `1`;
- invalid `fail-on-change` returning `1` without scanning;
- absent GitHub environment-file paths succeeding locally.

- [ ] **Step 7: Run boundary tests and verify RED**

Run: `pnpm vitest run tests/action/action.test.ts`

Expected: at least the change gate and strict boolean cases fail.

- [ ] **Step 8: Implement minimal boundary behavior**

Strictly parse booleans, preserve successful packet storage, ensure scan failure
precedes the change gate in diagnostics, and tolerate missing environment-file
paths.

- [ ] **Step 9: Verify and commit**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

Commit: `feat: run Signal Scout as a GitHub Action`

### Task 3: Action metadata and reproducible distribution

**Files:**

- Create: `action.yml`
- Create: `scripts/build-action.mjs`
- Create: `dist/action/index.cjs` (generated)
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`
- Create: `tests/action/metadata.test.ts`

**Interfaces:**

- Consumes: Task 2's `src/action/index.ts` direct entry.
- Produces: root GitHub Action metadata and a committed Node 24 CommonJS bundle.

- [ ] **Step 1: Write the failing metadata behavior test**

Run `pnpm add --save-dev --save-exact yaml@2.9.0`, then read and parse
`action.yml` with that standards-compliant parser. Assert the public
input/output names, defaults, Node runtime, and bundle path. Spawn the declared
bundle with an invalid `fail-on-change` input and assert it executes and exits
non-zero with the action diagnostic, proving metadata points to a runnable
artifact rather than merely grepping source text.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/action/metadata.test.ts`

Expected: FAIL because `action.yml` and the bundle do not exist.

- [ ] **Step 3: Add metadata and the action build**

Create `action.yml` with the exact design contract. Add
`scripts/build-action.mjs` using esbuild with `bundle: true`,
`platform: "node"`, `format: "cjs"`, `target: "node24"`, and output
`dist/action/index.cjs`.

Change `.gitignore` from ignoring the whole `/dist` tree to ignoring its
contents while re-including `/dist/action/index.cjs`. Keep generated files
excluded from Prettier and Biome.

- [ ] **Step 4: Wire package and CI scripts**

Bump `package.json` and the CLI version to `0.2.0`. Add `build:action` and run
it from `build`. CI runs the normal checks and then:

```bash
git diff --exit-code -- dist/action/index.cjs
```

This proves the committed bundle matches source.

- [ ] **Step 5: Build and verify GREEN**

Run:

```bash
pnpm install
pnpm build:action
pnpm vitest run tests/action/metadata.test.ts
git diff --exit-code -- dist/action/index.cjs
```

Expected: metadata test passes and the freshly built distribution is clean
after staging the intended bundle.

- [ ] **Step 6: Verify and commit**

Run: `pnpm check`

Commit: `build: publish the bundled GitHub Action`

### Task 4: Consumer workflow, trust documentation, and release notes

**Files:**

- Modify: `README.md`
- Modify: `examples/github-actions/scan.yml`
- Modify: `docs/architecture.md`
- Modify: `docs/trust-model.md`
- Modify: `CHANGELOG.md`
- Modify: `SECURITY.md` only if the action changes reporting instructions

**Interfaces:**

- Consumes: the exact metadata and outputs from Tasks 1–3.
- Produces: truthful installation, operation, security, and release guidance.

- [ ] **Step 1: Update the consumer example**

Use pinned `actions/checkout`, cache restore/save, and upload-artifact steps.
Replace repository-local pnpm installation with:

```yaml
- name: Scan public sources
  id: signal-scout
  uses: ./
  with:
    config: signal-scout.config.json
```

Keep `contents: read`, `if: always()` on baseline save and artifact upload,
and state that consumers replace `./` with an immutable Signal Scout commit
SHA or the `v0.2.0` release tag.

- [ ] **Step 2: Document the public contract**

Add a GitHub Action quick start, inputs/outputs table, change-gate semantics,
cache/artifact ownership, immutable-SHA recommendation, and local CLI
equivalence to README. Update architecture and trust model with the environment
file and generated-bundle boundaries.

- [ ] **Step 3: Add v0.2.0 release notes**

Record the GitHub Action, outputs, safe job summary, bundled artifact, and
unchanged packet schema/CLI semantics in `CHANGELOG.md`. Repeat that no npm
package or hosted service is released.

- [ ] **Step 4: Cross-check documentation against metadata**

Compare every documented input, output, default, version, path, and exit
behavior with `action.yml` and the tests. Remove any adoption or Marketplace
availability claim that is not live.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build:action
git diff --exit-code -- dist/action/index.cjs
```

Commit: `docs: launch Signal Scout for GitHub Actions`

### Task 5: Full release verification

**Files:**

- No new source files expected; fix only evidence-backed failures.

**Interfaces:**

- Consumes: complete branch from Tasks 1–4.
- Produces: release-ready commit with fresh local and GitHub evidence.

- [ ] **Step 1: Run complete local gates**

Run:

```bash
pnpm audit
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build:action
git diff --exit-code -- dist/action/index.cjs
git diff --check
git status --short
```

Expected: audit clean, 0 unit/integration/browser failures, reproducible bundle,
no whitespace errors, and only intended committed changes.

- [ ] **Step 2: Exercise the built action**

Create a temporary caller directory with a reviewed config using
`https://example.com`, temporary GitHub output/summary files, and run
`node <worktree>/dist/action/index.cjs`. Verify a baseline evidence packet,
seven outputs, safe Markdown, and exit `0`. Remove the temporary directory.

- [ ] **Step 3: Run independent whole-branch review**

Review the complete diff from the merge base for spec compliance, generated
artifact integrity, command/file injection, untrusted Markdown, path handling,
release honesty, and regression risk. Fix every load-bearing finding and
re-run its covering tests.

- [ ] **Step 4: Merge, push, and verify GitHub**

Fast-forward `main`, push, wait for CI and CodeQL, confirm open code/secret
alerts remain zero, create release `v0.2.0`, and verify the tag resolves to the
tested commit.

- [ ] **Step 5: Confirm remote action consumption**

Run the released `v0.2.0` action in a manual workflow or isolated temporary
consumer repository, verify outputs and summary, and remove any temporary local
clone or consumer repository after evidence is collected.
