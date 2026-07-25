# Architecture

Signal Scout is a local evidence pipeline with two consumers: a thin CLI for
real captures and a static website for an explicitly synthetic demonstration.
The framework-independent core is the only place that transforms source content
into evidence.

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

Capture follows redirects, sends an identifying Signal Scout user agent, times
out after 15 seconds, and accepts no more than 2 MiB. Accepted response types are
HTML, XHTML, and plain text. One failed source does not discard packets written
for successful sources.

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

Packet IDs derive from the source ID and current normalized-hash prefix. Equal
normalized input for the same source therefore produces the same packet ID even
when observed in another run. Capture metadata still records when observations
occur.

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

Signal Scout never commits evidence or opens a pull request. The operator
reviews artifacts and chooses whether they belong in Git history.

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
  build. `pnpm test:e2e` is an explicit browser gate.

See [`trust-model.md`](trust-model.md) for what this architecture proves and
what remains outside its boundary.
