# Signal Scout

Signal Scout turns changes on public competitor pages into versioned JSON and
Markdown evidence: source URLs, capture times, SHA-256 hashes, exact changed
fragments, and deterministic priority reasons.

![Signal Scout evidence desk](public/banner.svg)

It is a Git-native, local-first evidence pipeline. The quick start below runs
the checked-out repository; it does not assume a published npm package or a
hosted Signal Scout service.

The package manifest is intentionally private to prevent accidental npm
publication under the unscoped project name. Public distributions are GitHub
source releases.

## Quick start

Requirements: Node.js 24 or newer and pnpm 11.6.0.

```bash
npm install --global pnpm@11.6.0
git clone https://github.com/derprofi1313/signal-scout.git
cd signal-scout
pnpm install --frozen-lockfile
pnpm cli init
```

The explicit pnpm install works on Node.js releases that no longer bundle
Corepack and matches the version pinned by this repository.

Replace the example URL in `signal-scout.config.json`, then run:

```bash
pnpm cli scan
```

`init` creates `signal-scout.config.json` without overwriting an existing
configuration. The first successful capture establishes a `baseline`; there is
no earlier document to compare. Later captures return `changed` when normalized
semantic lines differ and `no_change` when they do not.

Local state is written below the configured `storageDir`, which defaults to
`.signal-scout` relative to the configuration file. Baseline snapshots are kept
separately from the machine-readable JSON and reviewable Markdown reports under
`.signal-scout/reports`.

```text
.signal-scout/
├── baselines/
│   └── <source-id>.json
└── reports/
    ├── <source-id>.json
    └── <source-id>.md
```

Each successful scan atomically replaces the current files for that source.
Review or copy reports elsewhere before the next scan if you need run-by-run
retention.

### Opt in to Git history

`/.signal-scout` is ignored by default so a capture cannot be published from
this repository by accident. After reviewing the generated files, explicitly
stage the evidence you want Git to track:

```bash
git add -f .signal-scout
git diff --cached -- .signal-scout
```

Commit only evidence that is safe to retain and share. After that first
intentional commit, later scans update tracked files and a normal
`git diff -- .signal-scout` shows the next change. Remove the paths from the
index again if you no longer want capture data in repository history.

## Configure sources

Signal Scout accepts 1–50 public HTTP(S) sources. Use
[`examples/signal-scout.config.json`](examples/signal-scout.config.json) as a
reference, or edit the file produced by `init`:

```json
{
  "$schema": "./signal-scout.schema.json",
  "version": 1,
  "storageDir": ".signal-scout",
  "sources": [
    {
      "id": "example-pricing",
      "name": "Replace with your pricing page",
      "url": "https://example.com/pricing",
      "kind": "pricing",
      "ignoreSelectors": [".cookie-banner", "[data-volatile]"]
    }
  ]
}
```

Replace `https://example.com/pricing`; it is documentation-only. Source IDs use
lowercase letters, numbers, and hyphens. Each source may declare up to 20 CSS
selectors for known volatile content. Allowed kinds are `pricing`, `changelog`,
`product`, `positioning`, `policy`, and `general`. The runtime schema is
[`signal-scout.schema.json`](signal-scout.schema.json).

Signal Scout is for public pages, not authenticated scraping or bypassing
access controls. Before every production connection, including redirects, it
resolves the target, rejects non-public and reserved IPv4/IPv6 addresses, and
pins a validated address to the socket while retaining the hostname for HTTP
and TLS. Redirects are revalidated hop by hop and stop after five hops.

## CLI

During repository development, invoke the checked-out TypeScript CLI through
the package script:

```text
pnpm cli --help
pnpm cli --version
pnpm cli init [--dir <directory>]
pnpm cli scan [--config <path>]
pnpm cli report <packet.json> [--format markdown|json]
```

Without options, `init` writes `signal-scout.config.json` in the current
directory and `scan` reads that file. `init` never overwrites an existing
configuration. A relative `storageDir` is resolved from the directory containing
the selected configuration, not from an unrelated shell directory.

`scan` writes the per-source files shown above and emits the complete `ScanRun`
as JSON on stdout. `report` reads a stored packet and emits Markdown by default;
pass `--format json` for formatted JSON.

Human-readable diagnostics go to stderr. JSON or Markdown intended for another
tool goes to stdout.

| Exit code | Meaning                                                                                           |
| --------: | ------------------------------------------------------------------------------------------------- |
|       `0` | Help/version, initialization, reporting, or a fully successful scan, whether changed or unchanged |
|       `1` | At least one source or another runtime operation failed; successful-source evidence is preserved  |
|       `2` | Missing or invalid config, arguments, packet input, or refusal to overwrite an existing config    |

## What an evidence packet contains

Every packet uses the schema identifier `signal-scout/evidence@1` and records:

- source identity, requested URL, canonical URL, and UTC capture metadata;
- previous and current raw-byte and normalized-text SHA-256 hashes;
- `baseline`, `no_change`, `changed`, or `failed` status;
- ordered before/after semantic fragments with deterministic positions;
- deterministic category, score, `low`/`medium`/`high` priority, and literal
  reasons; and
- disclosed fetch, parse, truncation, or comparison limitations.

The Markdown report is a review surface for the same evidence contract. It is
deterministic evidence, not strategic advice and not a claim that a page change
caused a business outcome.

## Transparent demo

Run the website locally:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the product explanation
and `/demo` for an inspectable packet. Demo content is labelled
**Synthetic fixture** and uses `https://fixture.invalid/pricing`; it is not a
live scan, customer result, or usage claim.

## Trust guarantees

For identical captured input and configuration, normalization, diffing,
classification, packet ordering, and hashing are deterministic. Reports retain
the exact normalized fragments used for classification, and limitations travel
with the packet.

Raw and normalized SHA-256 values let reviewers compare captured
representations with trusted copies. They do not hash or sign the packet file,
prove who published a page, show that the capture saw every dynamic element, or
guarantee that a remote server returned the same content to every observer.
Read the complete
[trust model](docs/trust-model.md) before using reports for a consequential
decision.

## Known limitations

- Capture supports public HTML, XHTML, and plain text over HTTP(S); it does not
  execute client-side JavaScript.
- A request times out after 15 seconds and accepts at most 2 MiB.
- Raw hashes cover the exact response bytes. Text is decoded as UTF-8; invalid
  UTF-8 is replaced and disclosed in the packet before normalization.
- Semantic extraction is capped at 800 lines. Diff comparison is bounded to
  400 × 400 lines; any truncation or comparison limit is disclosed.
- Ignore selectors can reduce noise and can also hide a real change if they are
  too broad.
- Deterministic rules explain a priority; they do not express statistical
  confidence, intent, impact, or causality.
- Local capture time depends on the operator's system clock. Signal Scout does
  not notarize packets or sign them with an external authority.

See [Architecture](docs/architecture.md) for module and data-flow details.

## GitHub Action

Signal Scout v0.2.0 adds a root GitHub JavaScript Action. It bundles its Node
24 runtime dependencies, so a calling workflow does not install Node, pnpm, or
this repository's package dependencies. The action runs the same `scan`
pipeline and writes the same `signal-scout/evidence@1` packets as the local
CLI.

[`examples/github-actions/scan.yml`](examples/github-actions/scan.yml) is a
scheduled, repository-local example. Its checkout, cache, and artifact actions
are pinned to immutable commits; those steps remain owned and chosen by the
calling workflow.

```yaml
- name: Scan public sources
  id: signal-scout
  uses: ./
  with:
    config: signal-scout.config.json
```

`uses: ./` means “use the action checked out in this repository” and is useful
for developing Signal Scout. A consumer replaces it with
`derprofi1313/signal-scout@<full immutable commit SHA>`. After the v0.2.0
release exists, `derprofi1313/signal-scout@v0.2.0` is a convenient shorthand,
but a tag is mutable; use a full commit SHA where reproducibility matters.

### Inputs

| Input            | Default                    | Meaning                                                                                                  |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `config`         | `signal-scout.config.json` | Path to the configuration file, resolved by the same scanner as the CLI.                                 |
| `fail-on-change` | `"false"`                  | Only `true` or `false` (case-insensitive); `true` fails after evidence is written when a source changed. |

An invalid `fail-on-change` value fails the action before a scan. A source
failure also makes the action fail, but successful-source evidence, outputs,
and the job summary are written first. With `fail-on-change: "true"`, a changed
scan fails only after those writes; it never discards the evidence that caused
the gate.

### Outputs

Use the step ID from the example, such as
`${{ steps.signal-scout.outputs.changed-count }}`, to consume these literal
string outputs.

| Output                       | Meaning                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `baseline-count`             | Sources that established a first baseline.                     |
| `no-change-count`            | Sources whose normalized content was unchanged.                |
| `changed-count`              | Sources whose normalized content changed.                      |
| `failed-count`               | Sources that could not be scanned.                             |
| `high-priority-change-count` | Deterministic changes with priority `high`.                    |
| `has-changes`                | `true` when at least one source produced a changed packet.     |
| `highest-priority`           | `high`, `medium`, `low`, or `none` across all scanned packets. |

When GitHub provides `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY`, the action
appends the outputs and a scan table to those files. The table includes only
bounded metadata—source name, status, change count, highest priority, and
packet ID—and never includes captured before/after fragments. Untrusted source
text is escaped and the summary is bounded below GitHub's per-step limit (at
most 900 KiB). Running the bundled action locally without those environment
files still writes evidence and returns the same action status.

### Cache, artifacts, and side effects

The action writes evidence to the configured local `storageDir` exactly as the
CLI does. It does not save or restore a cache, upload an artifact, call the
GitHub API, request a token, commit, or open a pull request. Keep cache and
artifact steps explicit in the caller workflow; the example restores and saves
`.signal-scout/baselines` and uploads `.signal-scout/reports` with
`if: always()` so review data survives a failing scan.

This is a GitHub source release, not an npm package, a GitHub Marketplace
listing, or a hosted Signal Scout service.

## Local quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm audit
pnpm build
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs formatting, linting, type checking, coverage tests, and the
production build. CI also runs the full dependency audit. Browser installation
and `pnpm test:e2e` remain explicit.

## Security

Use Signal Scout only for public sources you are permitted to access. Do not
place secrets in configuration or reports. Report vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/derprofi1313/signal-scout/security/advisories/new);
do not disclose exploitable details in a public issue. The full policy is in
[`SECURITY.md`](SECURITY.md).

## Roadmap hypotheses

Potential follow-on work includes managed JavaScript-capable capture, encrypted
retention, team review queues, delivery integrations, and optional
evidence-grounded synthesis. These are hypotheses, not available hosted
features. The deterministic packet remains the source of truth.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md), the
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), and the
[architecture notes](docs/architecture.md) before opening a pull request. For
release history, see [`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 Jannik Agethen.
