# Signal Scout GitHub Action Design

**Date:** 2026-07-26

**Status:** Approved for autonomous implementation

## Problem

Signal Scout is public and has a complete checked-out CLI workflow, but another
repository cannot consume it with a single `uses:` step. The package is
intentionally private and the existing example requires cloning the source,
installing pnpm, and invoking the repository CLI. That raises the activation
cost and prevents GitHub Action discovery.

## Outcome

A repository can check out its own configuration and run:

```yaml
- uses: derprofi1313/signal-scout@v0.2.0
  with:
    config: signal-scout.config.json
```

The action scans the configured public sources, preserves Signal Scout's
existing evidence packets and exit semantics, exposes aggregate outputs, and
adds a bounded GitHub job summary. It does not commit, open pull requests,
upload artifacts, cache baselines, or require a token.

## Public contract

The repository root contains `action.yml` with:

- `runs.using: node24`
- `runs.main: dist/action/index.cjs`
- input `config`, defaulting to `signal-scout.config.json`
- input `fail-on-change`, defaulting to `"false"`
- outputs `baseline-count`, `no-change-count`, `changed-count`,
  `failed-count`, `high-priority-change-count`, `has-changes`, and
  `highest-priority`
- restrained GitHub Marketplace branding

`fail-on-change` accepts only case-insensitive `true` or `false`. When true, a
successful scan with at least one `changed` packet makes the action fail after
outputs and the summary have been written. A source failure always fails the
action. Baselines and `no_change` packets do not trigger the change gate.

## Runtime architecture

`src/action/summary.ts` owns the pure aggregation and safe Markdown rendering.
The summary contains one row per configured source and only packet metadata:
source name, status, total change count, highest deterministic priority, and
packet ID. Source names are untrusted and must be neutralized for Markdown
tables and HTML rendering. The maximum of 50 configured sources keeps the
summary far below GitHub's 1 MiB per-step limit.

`src/action/index.ts` owns the GitHub environment-file boundary. It invokes the
real `runCli(["scan", ...])`, captures the existing JSON stdout and diagnostic
stderr, parses the `ScanRun`, appends safe `name=value` records to
`GITHUB_OUTPUT`, and appends the rendered Markdown to `GITHUB_STEP_SUMMARY`.
Missing environment-file paths are tolerated for local execution. Tests inject
only the network fetcher, clock, environment, and writers; configuration,
scanning, storage, CLI serialization, aggregation, and file output remain real.

The CLI bootstrap moves from `src/cli/index.ts` to `src/cli/main.ts`. This keeps
`runCli` importable in the bundled action without accidentally executing the CLI
entrypoint. The installed CLI artifact remains `dist/cli/index.js`.

`scripts/build-action.mjs` bundles all runtime dependencies into one CommonJS
file targeted at Node 24. The generated `dist/action/index.cjs` is committed.
CI rebuilds it and fails when the committed distribution differs.

## Trust boundaries

- The action retains the existing public-HTTP(S), DNS pinning, redirect,
  content-size, timeout, normalization, diff, and packet contracts.
- It requests no GitHub token and needs only the caller's normal
  `contents: read` checkout permission.
- It never commits, comments, opens issues or pull requests, uploads artifacts,
  or changes caches.
- Baseline persistence and evidence upload remain explicit caller workflow
  steps.
- Job-summary content is metadata, not captured page fragments or strategic
  advice.
- Generated JavaScript is treated as a release artifact: source is canonical,
  CI proves reproducibility, and reviewers inspect both source and the build
  check.

## Failure behavior

- invalid action input: fail before scanning with a concise diagnostic
- invalid or missing config: preserve CLI exit `2` semantics and fail the action
- capture/storage/runtime failure: preserve successful evidence, write outputs
  and summary when a `ScanRun` exists, then fail
- `fail-on-change: true` plus changed packets: write outputs and summary, then
  fail with a review-oriented message
- absent `GITHUB_OUTPUT` or `GITHUB_STEP_SUMMARY`: continue locally without
  error

## Documentation and release

The README leads with the checked-out local CLI but adds a direct GitHub Action
quick start, immutable-SHA guidance, cache and artifact ownership, and the
output contract. The example workflow uses pinned first-party GitHub actions
and the local `./` action so CI can verify the checked-out revision. Architecture
and trust documentation state the new boundary and limitations. The release is
`v0.2.0`; no npm package or hosted service is implied.

## Explicit non-goals

- Marketplace adoption or usage claims
- automatic baseline caching
- automatic artifact upload
- automatic commits, pull requests, issues, or notifications
- AI-generated synthesis
- JavaScript-rendered page capture
- a persisted run-history index
