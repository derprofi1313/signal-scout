# Signal Scout — Product and Technical Design

**Date:** 2026-07-25  
**Status:** Approved by delegated execution authority  
**Owner:** Jannik Agethen

## Product decision

Signal Scout is a Git-native evidence pipeline for competitive changes. It watches public product, pricing, changelog, and positioning pages, normalizes away predictable noise, and writes a reviewable evidence packet containing the source URL, capture time, SHA-256 hashes, exact before/after fragments, deterministic classification, and a human-readable report. Packet-file integrity depends on trusted Git history or an external file hash.

The first release is intentionally not another hosted “AI competitor dashboard.” Its wedge is reproducible proof that can be reviewed like code:

1. configure sources in a small JSON file;
2. run a local CLI or scheduled GitHub Action;
3. commit the baseline and receive Markdown plus JSON evidence when something meaningful changes;
4. inspect every claim against its captured source fragment.

AI enrichment is a future adapter. The deterministic packet remains the source of truth and must stay useful without an API key.

## Why this is the top choice

Three approaches were considered:

### A. Full weekly competitive-intelligence dashboard

This is easy to explain and can support a subscription, but the current field already includes products and repositories that scrape multiple competitor surfaces and generate digests. A July 2026 scan found examples such as [Drift](https://github.com/getdrift/drift), [IndustryLens](https://industry-lens.com/), and several newer feed-style tools. Building the same dashboard would create a distribution problem before a technical advantage.

### B. Pricing-only watcher

Pricing is a valuable, narrow signal, but purpose-built offerings already emphasize structured pricing extraction, verification, and alerts, including [price-watch](https://github.com/comparedge/price-watch-mcp) and PricePulse. A pricing-only clone would be narrow without being distinctive.

### C. Git-native Evidence CI — selected

Evidence CI turns the category inside out. The product is not the summary; it is the reviewable chain from source to decision. This creates a useful open-source artifact for technical founders today and a credible hosted expansion later: managed browser capture, team review queues, long-term retention, private workspaces, and delivery integrations.

This is a product hypothesis, not a claim of customer validation. The repository must make the core loop genuinely usable so validation can begin with real users.

## Audience and job

**Primary user:** a technical founder, product lead, or product marketer at a 2–50 person B2B SaaS company.

**Job:** “Tell me exactly what changed across the few competitor pages that matter, show me proof, and let me keep the history without adopting an enterprise CI suite.”

**Single website job:** make the trust model obvious and let a visitor inspect one transparent demo evidence packet before installing the CLI.

## Release scope

### Included

- Next.js App Router website with a polished landing page and interactive `/demo`.
- TypeScript CLI with `init`, `scan`, and `report` commands.
- JSON configuration validated at runtime.
- Public HTTP(S) capture with timeout, response-size, and content-type guards.
- Deterministic HTML normalization with configurable ignored selectors.
- Line-oriented semantic diff with additions, removals, and unchanged context.
- Rule-based classification for pricing, packaging, product, positioning, policy, and general changes.
- Explainable priority score from explicit signals, never a fabricated confidence value.
- SHA-256 hashes for raw and normalized content.
- Versioned evidence packet schema.
- Markdown and JSON report output.
- Clearly labelled synthetic demo fixtures.
- Local baseline storage.
- Unit and integration tests, browser E2E, accessibility checks, linting, type checking, production build, and GitHub CI.
- MIT license, contribution guide, security policy, code of conduct, architecture notes, release notes, and issue templates.

### Excluded

- Accounts, billing, multi-tenancy, database provisioning, email, Slack, or hosted scheduling.
- Headless-browser capture for sites that require JavaScript.
- Authentication-gated sources or bypassing access controls.
- Claims that a change caused a business outcome.
- AI-generated strategy recommendations.
- Automatic commits or pull requests from the CLI.

## Trust contract

Every evidence packet must:

- identify the source with its canonical URL;
- record capture timestamps in ISO 8601 UTC;
- include raw and normalized SHA-256 hashes;
- preserve exact changed fragments from both captures;
- disclose truncation, fetch, parse, or classification limitations;
- distinguish `baseline`, `no_change`, `changed`, and `failed`;
- use deterministic categories and priority reasons;
- label fixture data as synthetic;
- remain readable without the web application.

The product never displays invented activity, customer logos, testimonials, scan counts, revenue, or “live” results. Demo data is explicitly marked as a fixture.

## Architecture

```text
signal-scout.config.json
          │
          ▼
  config validation
          │
          ▼
 guarded HTTP fetch ──► raw SHA-256
          │
          ▼
 HTML normalization ──► normalized SHA-256
          │
          ├── first capture ──► baseline snapshot
          │
          └── later capture
                    │
                    ▼
              semantic diff
                    │
                    ▼
          classification + score
                    │
                    ▼
     evidence packet JSON + Markdown
                    │
                    ├── local review / Git history
                    └── static demo renderer
```

### Module boundaries

- `src/core/config.ts`: validates and normalizes user configuration.
- `src/core/fetch.ts`: performs guarded capture and returns bytes plus response metadata.
- `src/core/normalize.ts`: converts HTML into stable semantic lines.
- `src/core/diff.ts`: computes changed fragments without network or UI dependencies.
- `src/core/classify.ts`: assigns explicit categories, priority, and reasons.
- `src/core/packet.ts`: builds the versioned evidence contract and hashes.
- `src/core/storage.ts`: reads and writes local baselines and reports.
- `src/core/scan.ts`: orchestrates the pipeline through injected boundaries.
- `src/core/report.ts`: renders Markdown from an evidence packet.
- `src/cli/index.ts`: parses CLI commands and maps failures to exit codes.
- `src/app/**`: Server Component routes and small isolated Client Components.

Core modules do not import Next.js. UI modules consume the evidence packet type but do not reach into capture or storage internals.

## Configuration contract

```json
{
  "$schema": "./signal-scout.schema.json",
  "version": 1,
  "storageDir": ".signal-scout",
  "sources": [
    {
      "id": "demo-pricing",
      "name": "Demo pricing fixture",
      "url": "https://example.com/pricing",
      "kind": "pricing",
      "ignoreSelectors": [".cookie-banner", "[data-volatile]"]
    }
  ]
}
```

Source identifiers use lowercase letters, numbers, and hyphens. URLs must be public `http:` or `https:` URLs without embedded credentials. A configuration contains 1–50 sources. Ignore selectors are optional and limited to 20 entries per source.

## Evidence packet contract

The top-level schema is `signal-scout/evidence@1`. A packet contains:

- stable packet and source identifiers;
- source name, kind, URL, capture metadata, and response metadata;
- previous and current raw/normalized hashes;
- status and limitations;
- ordered change records;
- category, priority (`low`, `medium`, `high`), score from 0–100, and explicit score reasons;
- exact removed and added lines with bounded surrounding context;
- summary counts suitable for machines and Markdown.

No field is named `confidence`; deterministic rules do not imply statistical certainty.

## Error handling

- Invalid configuration exits with code `2` and field-level messages.
- A completely failed run exits with code `1`.
- Mixed success and failure writes packets for every source and exits with code `1`.
- A successful unchanged or changed run exits with code `0`.
- Network requests time out after 15 seconds and accept at most 2 MiB.
- Non-HTML/text content fails clearly.
- Storage writes use a temporary sibling followed by an atomic rename.
- One source failure must not discard successful source results.

## Visual design

### Subject

The interface is an evidence desk for product teams: closer to a forensic instrument readout than a generic analytics dashboard.

### Tokens

- **Cold paper** `#EDF3F6` — page field
- **Signal ink** `#10232D` — primary text and dark surfaces
- **Proof blue** `#2457D6` — actions and verified links
- **Trace teal** `#087C6A` — unchanged/verified states
- **Change ember** `#C84B31` — removals and high-priority changes
- **Rule steel** `#B8C7CE` — borders and evidence rails

Typography uses **Chivo** for display, **Public Sans** for body copy, and **IBM Plex Mono** for hashes, timestamps, source fragments, and controls, all loaded through `next/font`.

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ mark  Signal Scout                         Docs   GitHub     │
├───────────────────────────┬─────────────────────────────────┤
│ Markets move.             │ SOURCE → HASH → DIFF → SIGNAL   │
│ Your evidence shouldn't.  │ interactive evidence specimen   │
│ [Inspect evidence]        │ before │ after │ proof rail      │
└───────────────────────────┴─────────────────────────────────┘
│ WHY EVIDENCE CI  ─────────────────────────────────────────── │
│ capture ── normalize ── compare ── review                    │
├─────────────────────────────────────────────────────────────┤
│ real CLI contract               │ transparent demo packet    │
└─────────────────────────────────┴───────────────────────────┘
```

### Signature element

A continuous “chain of evidence” rail connects source, capture, normalized fragment, diff, and priority reason. It appears in the hero specimen and demo detail view. The rail encodes provenance rather than decorating the page.

### Motion and accessibility

One orchestrated reveal moves a scanning marker through the chain once, then stops. Hover motion is limited to controls. `prefers-reduced-motion` disables all nonessential movement. The interface supports 320 px widths, visible focus, semantic landmarks, skip navigation, keyboard-operable filters, minimum AA contrast, and no information conveyed by color alone.

## Testing strategy

- Unit tests cover configuration boundaries, normalization noise removal, diff ordering, classification reasons, hashing, and Markdown escaping.
- Integration tests run two fixture captures through the real scan pipeline with only the network boundary injected.
- CLI tests exercise argument parsing, output, files, and exit codes using temporary directories.
- Playwright tests cover the landing page, demo filtering, keyboard focus, mobile layout, reduced motion, and automated accessibility scanning.
- TDD is required for core behavior: each production behavior starts with an observed failing test.
- CI runs format check, lint, type check, unit/integration tests, production build, and browser tests.

## Monetization path

The open-source repository is the acquisition and trust layer. A hosted service may later charge for:

- managed JS-capable capture and scheduling;
- long-term encrypted history;
- team review and acknowledgement;
- Slack, email, webhook, and MCP delivery;
- organization policies and audit exports;
- optional evidence-grounded AI synthesis.

No hosted feature is implemented until real users complete the open-source loop and identify a repeated operational burden worth paying to remove.

## Acceptance criteria

The release is complete when:

1. a fresh clone installs with one documented command;
2. `signal-scout init` creates a valid starter configuration;
3. two fixture scans produce a baseline and then a deterministic changed packet;
4. unchanged content produces `no_change` without false events;
5. reports show source URL, hashes, timestamps, exact fragments, categories, and reasons;
6. the landing page and `/demo` render without external credentials;
7. fixture content is visibly labelled synthetic;
8. lint, type check, unit/integration tests, browser tests, accessibility scan, and production build pass;
9. CI and security automation are present;
10. the public GitHub repository contains a clean commit history and a useful README.

## Delegated approval

The user explicitly requested no follow-up questions and fully automatic execution. That instruction grants the implementation agent authority to choose the narrowest credible product wedge, visual direction, architecture, and public-repository defaults. This specification records those decisions in place of an interactive approval loop.
