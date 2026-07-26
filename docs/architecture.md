# Architecture

Signal Scout is a local evidence pipeline with three consumers: a thin CLI for
real captures, a bundled GitHub JavaScript Action for CI, and a static website
for an explicitly synthetic demonstration. The framework-independent core is
the only place that transforms source content into evidence.

## System flow

```text
signal-scout.config.json
          |
          v
 strict config validation
          |
          v
 guarded HTTP capture ------> raw SHA-256
          |
          v
 semantic normalization ----> normalized SHA-256
          |
          +-- first capture ----------> baseline snapshot
          |
          `-- later capture
                    |
                    v
              bounded line diff
                    |
                    v
           deterministic rules
                    |
                    v
        evidence JSON + Markdown
                    |
                    +-- local review / chosen Git history
                    `-- artifact upload
```

The network response and capture time are observations, not deterministic
inputs. Given the same captured bytes, source configuration, and prior
snapshot, the transformation and ordering are deterministic.

## Module boundaries

| Module                  | Responsibility                                                                | Must not do                      |
| ----------------------- | ----------------------------------------------------------------------------- | -------------------------------- |
| `src/core/config.ts`    | Parse strict configuration, apply defaults, and report field-level issues     | Fetch URLs or read UI state      |
| `src/core/fetch.ts`     | Enforce protocol, MIME, timeout, and body-size boundaries around HTTP capture | Classify changes                 |
| `src/core/normalize.ts` | Extract stable semantic lines and canonical URL metadata                      | Call the network                 |
| `src/core/diff.ts`      | Produce ordered fragments under a bounded comparison                          | Infer business meaning           |
| `src/core/classify.ts`  | Apply literal category, score, priority, and reason rules                     | Produce statistical confidence   |
| `src/core/packet.ts`    | Hash content and assemble `signal-scout/evidence@1`                           | Persist files                    |
| `src/core/storage.ts`   | Read baselines and atomically write snapshots and reports                     | Change packet meaning            |
| `src/core/scan.ts`      | Orchestrate sources through injected boundaries and preserve partial success  | Contain UI code                  |
| `src/core/report.ts`    | Render a packet as reviewable Markdown                                        | Add unsupported advice           |
| `src/cli/index.ts`      | Parse commands, separate stdout/stderr, and map exit codes                    | Reimplement core behavior        |
| `src/action/summary.ts` | Aggregate a `ScanRun` and render bounded, escaped job-summary metadata        | Render evidence fragments        |
| `src/action/index.ts`   | Invoke the real CLI and append Action outputs/summary environment files       | Change scan or packet semantics  |
| `action.yml`            | Declare two inputs, seven outputs, Node 24, and the bundle entrypoint         | Install dependencies for callers |
| `dist/action/index.cjs` | Committed CommonJS distribution generated from the Action runner              | Be edited as source              |
| `src/app/**`            | Explain the model and render a typed synthetic packet                         | Fetch or mutate local scan state |

Core modules do not import Next.js. The website consumes the shared
`EvidencePacket` type but does not invoke the scanner or require credentials,
database access, or a hosted API.

## Configuration boundary

The runtime validator accepts version `1`, a `storageDir`, and 1–50 sources.
Each source has a stable lowercase/hyphenated ID, name, public HTTP(S) URL, kind,
and 0–20 ignore selectors. Unknown fields are rejected. Defaults are
`storageDir: ".signal-scout"` and `ignoreSelectors: []`.

Embedded URL credentials are invalid. Configuration validation happens before a
scan so usage errors map to exit code `2`, not a partial network run.

The CLI resolves a relative `storageDir` from the selected configuration file's
directory. This keeps `--config path/to/config.json` and its state together
regardless of the invoking shell's current directory.

## Capture and normalization

Capture resolves every initial and redirected host, rejects non-public or
reserved IPv4/IPv6 results, and pins one validated address into the actual
HTTP(S) socket while preserving the hostname for the Host header and TLS. It
follows at most five manually validated redirects, sends an identifying Signal
Scout user agent, times out the whole operation after 15 seconds, and accepts no
more than 2 MiB. Accepted response types are HTML, XHTML, and plain text. One
failed source does not discard packets written for successful sources.

The raw SHA-256 is computed over the exact response bytes before UTF-8 decoding.
If decoding requires replacement characters, that fact becomes a packet
limitation. A stored baseline whose requested URL no longer matches its source
configuration is reset instead of being compared across URLs.

Normalization removes non-content elements and configured ignore selectors,
extracts ordered semantic text, collapses Unicode whitespace, and removes only
adjacent duplicate lines. It is capped at 800 lines. Any truncation is recorded
as a packet limitation instead of being hidden.

The canonical URL is source-provided metadata retained for review. It does not
replace the requested URL as the record of where capture began.

## Diff and classification

The line diff uses deterministic longest-common-subsequence ordering. A
400 × 400 comparison cap prevents unbounded allocation. When the cap changes the
available comparison, the packet discloses that limitation.

Classification is a literal rule table. It emits a category, numeric score,
textual priority (`low`, `medium`, or `high`), and explicit reasons such as
`Published price changed`. Stable tie-breaking makes repeated classification
reproducible. There is no `confidence` field because these are rules, not a
probabilistic model.

## Evidence packet

`signal-scout/evidence@1` is the compatibility boundary shared by the CLI,
Markdown renderer, tests, and website fixture. A packet includes source and
capture metadata, previous/current raw and normalized hashes, status,
limitations, ordered changes, and summary counts.

Runtime validation recomputes every category, score, priority, and reason from
the stored fragment and source kind. A structurally valid packet with altered
classifier output is rejected before the CLI renders it.

Packet IDs derive from the source ID and current normalized-hash prefix. Equal
normalized input for the same source therefore produces the same packet ID even
when observed in another run. Capture metadata still records when observations
occur. The ID identifies evidence content; it is not a packet-level hash or
signature.

## Storage and reporting

The configured storage directory defaults to `.signal-scout`. Storage keeps the
latest baseline needed for comparison in `baselines/<source-id>.json`. The
current evidence packet and Markdown rendering are written to
`reports/<source-id>.json` and `reports/<source-id>.md`. Writes use a temporary
sibling followed by an atomic rename so an interrupted write does not replace a
complete file with a partial one. A later scan replaces the current per-source
files; long-term retention belongs to the operator's artifact or version-control
policy.

The CLI sends machine-consumable JSON or Markdown to stdout and diagnostics to
stderr. Invalid configuration or usage exits `2`; any source failure exits `1`;
a fully successful baseline, changed, or unchanged scan exits `0`.
Markdown rendering encodes raw HTML in prose fields and writes terminal,
bidirectional, and embedded line controls as visible `\uXXXX` escapes. The JSON
packet retains the original strings.

Signal Scout never commits evidence or opens a pull request. The repository
ignores `/.signal-scout` by default to prevent accidental publication. The
operator reviews artifacts first and must explicitly opt in with
`git add -f .signal-scout` before they belong in Git history; subsequent tracked
scans can be reviewed with a normal Git diff.

## GitHub Action boundary

The root `action.yml` runs `dist/action/index.cjs` with GitHub's Node 24 Action
runtime. `scripts/build-action.mjs` bundles the runner and its dependencies as
CommonJS; the generated bundle is committed, excluded from formatting, and
rebuilt in CI. CI rejects both a changed bundle and an untracked bundle, so the
metadata entrypoint is reproducible from the reviewed sources.

The runner reads `config` (default `signal-scout.config.json`) and
`fail-on-change` (default `"false"`) from the GitHub Action input environment,
then invokes the existing CLI scan path. It accepts only boolean values for the
change gate. It writes the seven literal outputs—baseline, unchanged, changed,
failed, high-priority-change counts, `has-changes`, and
`highest-priority`—to `GITHUB_OUTPUT` when that file exists. It appends a
metadata-only table to `GITHUB_STEP_SUMMARY` when that file exists. The table
is escaped and bounded to 900 KiB; it contains no captured before/after
fragments.

Action failure is deliberately post-write for a completed scan: scan failures
and `fail-on-change: "true"` both return `1` only after successful packets,
outputs, and summary data have been preserved. Invalid action input returns
`1` before scanning. When GitHub's environment-file variables are absent, the
same bundled runner is still usable locally and simply omits those appends.

The action has no GitHub token input and makes no GitHub API write. It does not
restore or save caches, upload artifacts, commit evidence, create pull requests,
or manage the caller repository. Those side effects are explicit caller
workflow steps.

## Website boundary

The Next.js App Router site uses Server Components by default. The small demo
filter is the only stateful Client Component. `/demo` renders a packet from
`src/data/demo-packet.ts` that is visibly labelled `Synthetic fixture` and
points to the reserved `.invalid` domain. It does not represent a network call
or customer activity.

## Verification layers

- Unit tests cover configuration, normalization, diffing, classification,
  hashing, and Markdown escaping.
- Integration tests drive repeated fixture captures through the scan pipeline
  with only external boundaries injected.
- CLI tests verify arguments, streams, files, overwrite protection, and exit
  codes.
- Playwright verifies the landing page, demo interaction, keyboard behavior,
  reduced motion, 320 px layout, and WCAG checks.
- `pnpm check` runs formatting, lint, type checking, coverage, and production
  build. CI adds `pnpm audit`; `pnpm test:e2e` is an explicit browser gate.

See [`trust-model.md`](trust-model.md) for what this architecture proves and
what remains outside its boundary.
