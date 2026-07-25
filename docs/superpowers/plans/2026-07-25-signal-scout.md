# Signal Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` for behavioral code and `superpowers:verification-before-completion` before reporting success. Independent file groups may run in parallel after Task 1 establishes the shared toolchain.

**Goal:** Ship a public, installable repository whose CLI produces deterministic evidence packets for competitor-page changes and whose website makes that trust model immediately inspectable.

**Architecture:** A framework-independent TypeScript core performs guarded capture, normalization, diffing, classification, hashing, storage, and report rendering. A thin CLI invokes that core. A Next.js 16 App Router site consumes the same versioned evidence type to render a polished static demo without credentials or runtime data services.

**Tech Stack:** Node.js 24, pnpm 11, Next.js 16.2.11, React 19.2.4, TypeScript, Zod 4.4.3, Cheerio 1.2.0, Vitest 4.1.10, Playwright 1.62.0, axe-core 4.12.1, tsx 4.23.1, tsup 8.5.1, CSS Modules/global CSS, GitHub Actions.

## Global Constraints

- The product is Git-native Evidence CI, not a hosted AI digest dashboard.
- Deterministic evidence remains useful without API keys or external services.
- Every claim links back to exact source fragments, capture time, canonical URL, and SHA-256 hashes.
- Demo content is visibly labelled `Synthetic fixture`; no invented usage, customers, testimonials, success, or live activity.
- Configuration supports 1–50 public HTTP(S) sources, 0–20 ignore selectors each, and no embedded URL credentials.
- Capture timeout is 15 seconds and maximum accepted body size is 2 MiB.
- Evidence schema identifier is exactly `signal-scout/evidence@1`.
- Priorities are exactly `low`, `medium`, or `high`; no field is named `confidence`.
- Invalid configuration exits `2`; any source failure exits `1`; fully successful changed or unchanged scans exit `0`.
- The web application uses Server Components by default and isolates interaction in small Client Components.
- The design uses Cold paper `#EDF3F6`, Signal ink `#10232D`, Proof blue `#2457D6`, Trace teal `#087C6A`, Change ember `#C84B31`, and Rule steel `#B8C7CE`.
- Typography uses Chivo, Public Sans, and IBM Plex Mono through `next/font`.
- The UI supports 320 px widths, keyboard operation, visible focus, reduced motion, semantic landmarks, and WCAG 2.2 AA contrast.
- Core behavior follows observed red-green-refactor TDD.
- No database, authentication, billing, email, Slack, AI provider, or hosted scheduler is added.

---

## File map

```text
src/
  app/
    demo/page.tsx                 interactive evidence demo route
    globals.css                   design tokens and responsive system
    layout.tsx                    metadata, fonts, skip link, global shell
    opengraph-image.tsx           generated social image
    page.tsx                      product landing route
  components/
    chain-of-evidence.tsx         provenance rail
    demo-explorer.tsx             only stateful demo filter
    diff-fragment.tsx             accessible before/after fragment
    site-header.tsx               navigation
  core/
    classify.ts                   deterministic category and priority
    config.ts                     Zod configuration boundary
    diff.ts                       semantic line diff
    fetch.ts                      guarded HTTP capture
    normalize.ts                  stable semantic HTML lines
    packet.ts                     hashing and evidence contract
    report.ts                     Markdown renderer
    scan.ts                       pipeline orchestration
    storage.ts                    atomic local persistence
    types.ts                      shared contracts
  cli/
    index.ts                      init/scan/report entry point
  data/
    demo-packet.ts                transparent synthetic fixture
tests/
  cli/cli.test.ts
  core/classify.test.ts
  core/config.test.ts
  core/diff.test.ts
  core/normalize.test.ts
  core/report.test.ts
  core/scan.test.ts
  fixtures/demo-before.html
  fixtures/demo-after.html
e2e/
  site.spec.ts
examples/
  github-actions/scan.yml
  signal-scout.config.json
docs/
  architecture.md
  trust-model.md
.github/
  ISSUE_TEMPLATE/bug.yml
  ISSUE_TEMPLATE/feature.yml
  workflows/ci.yml
  workflows/codeql.yml
```

## Task 1: Scaffold and shared quality gates

**Files:**

- Create: generated Next.js App Router files
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`
- Create: `.prettierignore`
- Create: `LICENSE`

**Interfaces:**

- Produces the `@/* -> ./src/*` import alias.
- Produces scripts `dev`, `build`, `build:cli`, `lint`, `typecheck`, `format:check`, `test`, `test:coverage`, `test:e2e`, and `check`.

- [ ] **Step 1: Scaffold generated framework files non-interactively**

Run in a temporary directory:

```bash
pnpm dlx create-next-app@16.2.11 app --ts --eslint --app --src-dir --use-pnpm --no-tailwind --import-alias "@/*" --yes
```

Copy the generated files into the repository without replacing `docs/` or `.git/`.

- [ ] **Step 2: Install exact runtime and quality dependencies**

```bash
pnpm add cheerio@1.2.0 zod@4.4.3
pnpm add -D vitest@4.1.10 @vitest/coverage-v8@4.1.10 @playwright/test@1.62.0 @axe-core/playwright@4.12.1 tsx@4.23.1 tsup@8.5.1 prettier@3.9.6
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/core/**/*.ts", "src/cli/**/*.ts"],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
```

- [ ] **Step 4: Configure browser verification**

Create `playwright.config.ts` with `baseURL` `http://127.0.0.1:3100`, `pnpm dev --hostname 127.0.0.1 --port 3100` as the web server command, Desktop Chrome and Mobile Chrome projects, trace on first retry, and full-page screenshots only on failure.

- [ ] **Step 5: Set the package contract**

`package.json` must declare:

```json
{
  "name": "signal-scout",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "bin": { "signal-scout": "./dist/cli/index.js" },
  "files": ["dist", "signal-scout.schema.json", "README.md", "LICENSE"],
  "engines": { "node": ">=24", "pnpm": ">=11" }
}
```

Add scripts:

```json
{
  "build": "next build && pnpm build:cli",
  "build:cli": "tsup src/cli/index.ts --format esm --dts --clean --banner.js '#!/usr/bin/env node'",
  "cli": "tsx src/cli/index.ts",
  "typecheck": "tsc --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build"
}
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm lint
pnpm typecheck
```

Expected: both exit `0`.

Commit:

```bash
git add .
git commit -m "chore: scaffold Signal Scout"
```

## Task 2: Evidence core with strict TDD

**Files:**

- Create: `src/core/types.ts`
- Create: `src/core/config.ts`
- Create: `src/core/normalize.ts`
- Create: `src/core/diff.ts`
- Create: `src/core/classify.ts`
- Create: `src/core/packet.ts`
- Test: `tests/core/config.test.ts`
- Test: `tests/core/normalize.test.ts`
- Test: `tests/core/diff.test.ts`
- Test: `tests/core/classify.test.ts`

**Interfaces:**

- Produces `parseConfig(input: unknown): SignalScoutConfig`.
- Produces `normalizeHtml(html: string, options: NormalizeOptions): NormalizedDocument`.
- Produces `diffLines(before: string[], after: string[]): DiffFragment[]`.
- Produces `classifyFragment(fragment: DiffFragment, kind: SourceKind): ClassifiedChange`.
- Produces `buildEvidencePacket(input: PacketInput): EvidencePacket`.

- [ ] **Step 1: RED — configuration boundaries**

Write a test using literal expectations:

```ts
it("rejects embedded credentials and duplicate source ids", () => {
  const result = safeParseConfig({
    version: 1,
    sources: [
      {
        id: "pricing",
        name: "Pricing",
        url: "https://user:pass@example.com/pricing",
        kind: "pricing",
      },
      { id: "pricing", name: "Pricing 2", url: "https://example.org/pricing", kind: "pricing" },
    ],
  });

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.issues.map((issue) => issue.path)).toEqual(["sources.0.url", "sources.1.id"]);
  }
});
```

Run `pnpm vitest run tests/core/config.test.ts` and confirm failure because the parser does not exist.

- [ ] **Step 2: GREEN — strict Zod 4 configuration**

Implement strict schemas, exact limits, defaults `storageDir: ".signal-scout"` and `ignoreSelectors: []`, field-level issues, and duplicate-ID validation.

Run `pnpm vitest run tests/core/config.test.ts` and confirm pass.

- [ ] **Step 3: RED — stable semantic normalization**

Use `tests/fixtures/demo-before.html` containing navigation, a volatile timestamp, a pricing heading, price, feature list, script, and cookie banner. Assert:

```ts
expect(result.lines).toEqual([
  "Pricing",
  "Launch",
  "$29 per workspace / month",
  "5 projects",
  "Email support",
]);
expect(result.canonicalUrl).toBe("https://fixture.invalid/pricing");
expect(result.limitations).toEqual([]);
```

Run the test and observe the missing implementation failure.

- [ ] **Step 4: GREEN — Cheerio normalization**

Load with Cheerio, resolve `<link rel="canonical">`, remove `script`, `style`, `noscript`, `template`, `svg`, navigation, footer, and configured ignored selectors. Extract ordered `h1`–`h6`, `p`, `li`, `dt`, `dd`, `th`, `td`, `button`, and price-relevant labelled elements. Collapse Unicode whitespace, deduplicate adjacent equal lines, cap at 800 lines and disclose truncation.

Run the normalization test and confirm pass.

- [ ] **Step 5: RED/GREEN — semantic diff**

Write tests proving that a price replacement yields one fragment with:

```ts
{
  before: ["$29 per workspace / month"],
  after: ["$39 per workspace / month"],
  beforeStart: 2,
  afterStart: 2
}
```

Also test pure addition, pure removal, identical input, duplicate lines, and bounded context. Implement an LCS-based line diff with deterministic ordering and a 400 × 400 comparison cap that adds a limitation instead of allocating unbounded memory.

- [ ] **Step 6: RED/GREEN — explainable classification**

Tests must establish:

- `$29` → `$39` on `pricing` is category `pricing`, priority `high`, score `90`, reason `Published price changed`.
- `Starter` → `Launch` on `pricing` is category `packaging`, priority `high`, score `80`, reason `Plan or package name changed`.
- a newly added feature line on `changelog` is category `product`, priority `medium`, score `60`.
- generic copy is category `general`, priority `low`, score `25`.

Implement literal rule tables and stable tie-breaking. Do not generate strategy or confidence language.

- [ ] **Step 7: RED/GREEN — packet integrity**

Test exact schema ID, deterministic SHA-256 hashes, ordered changes, summary counts, and status values. Build packet IDs from source ID plus current normalized hash prefix so reruns over identical inputs are stable.

- [ ] **Step 8: Verify and commit**

Run:

```bash
pnpm vitest run tests/core/config.test.ts tests/core/normalize.test.ts tests/core/diff.test.ts tests/core/classify.test.ts
pnpm typecheck
```

Expected: all tests pass and both commands exit `0`.

Commit:

```bash
git add src/core tests/core tests/fixtures
git commit -m "feat: add deterministic evidence engine"
```

## Task 3: Storage, scan orchestration, reports, and CLI

**Files:**

- Create: `src/core/fetch.ts`
- Create: `src/core/storage.ts`
- Create: `src/core/scan.ts`
- Create: `src/core/report.ts`
- Create: `src/cli/index.ts`
- Create: `signal-scout.schema.json`
- Test: `tests/core/scan.test.ts`
- Test: `tests/core/report.test.ts`
- Test: `tests/cli/cli.test.ts`

**Interfaces:**

- Consumes all Task 2 core interfaces.
- Produces `scanSources(config, dependencies): Promise<ScanRun>`.
- Produces `renderMarkdown(packet): string`.
- Produces `runCli(argv, io): Promise<number>`.

- [ ] **Step 1: RED — two-capture pipeline**

Inject a fetcher returning the before fixture on the first call and after fixture on the second. Use a real temporary storage directory. Assert first scan writes a baseline with status `baseline`, second scan writes status `changed`, and a third identical capture returns `no_change`.

Run `pnpm vitest run tests/core/scan.test.ts` and confirm the missing pipeline failure.

- [ ] **Step 2: GREEN — guarded capture and atomic storage**

Implement:

- `AbortSignal.timeout(15_000)`;
- user agent `SignalScout/0.1 (+https://github.com/derprofi1313/signal-scout)`;
- redirect following;
- accepted MIME types `text/html`, `application/xhtml+xml`, and `text/plain`;
- streaming size guard at `2 * 1024 * 1024` bytes;
- sibling temporary files followed by `rename`;
- successful packets preserved when another source fails.

Do not test the network library. Test Signal Scout’s size, MIME, timeout mapping, and mixed-result contracts through injected responses.

- [ ] **Step 3: RED/GREEN — evidence Markdown**

Assert that Markdown includes the schema, source link, UTC capture times, both normalized hashes, status, priority with textual label, reasons, fenced before/after fragments, limitations, and a footer stating that the report is deterministic evidence rather than strategic advice. Escape backticks from captured content.

- [ ] **Step 4: RED — CLI behavior**

Test:

```ts
expect(await runCli(["init", "--dir", tempDir], io)).toBe(0);
expect(await runCli(["scan", "--config", missingPath], io)).toBe(2);
expect(await runCli(["report", packetPath, "--format", "markdown"], io)).toBe(0);
```

Verify `init` never overwrites an existing configuration and emits a direct recovery instruction.

- [ ] **Step 5: GREEN — CLI commands**

Implement `--help`, `--version`, `init`, `scan`, and `report` with dependency-free argument parsing. Output human text to stderr and machine JSON/Markdown to stdout. Map exit codes exactly to the global constraints.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm vitest run tests/core/scan.test.ts tests/core/report.test.ts tests/cli/cli.test.ts
pnpm build:cli
node dist/cli/index.js --help
```

Expected: tests pass, the CLI build exits `0`, and help lists `init`, `scan`, and `report`.

Commit:

```bash
git add src/core src/cli tests signal-scout.schema.json
git commit -m "feat: ship local scan and report CLI"
```

## Task 4: Evidence-desk web experience

**Files:**

- Replace: `src/app/page.tsx`
- Replace: `src/app/layout.tsx`
- Replace: `src/app/globals.css`
- Create: `src/app/demo/page.tsx`
- Create: `src/app/opengraph-image.tsx`
- Create: `src/components/site-header.tsx`
- Create: `src/components/chain-of-evidence.tsx`
- Create: `src/components/diff-fragment.tsx`
- Create: `src/components/demo-explorer.tsx`
- Create: `src/data/demo-packet.ts`
- Test: `e2e/site.spec.ts`

**Interfaces:**

- Consumes `EvidencePacket` from `src/core/types.ts`.
- `DemoExplorer` is the only stateful Client Component.

- [ ] **Step 1: RED — browser contract**

Write Playwright tests before replacing the scaffold page:

```ts
test("makes the evidence chain inspectable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Markets move/ })).toBeVisible();
  await page.getByRole("link", { name: "Inspect the evidence" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByText("Synthetic fixture", { exact: true })).toBeVisible();
  await expect(page.getByText("Published price changed")).toBeVisible();
});
```

Add a keyboard test, mobile 320 px overflow test, reduced-motion test, and an axe scan tagged `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa`.

Run the tests against the scaffold and confirm they fail on missing content.

- [ ] **Step 2: Build metadata and document shell**

Use Server Components and `next/font/google` for Chivo, Public Sans, and IBM Plex Mono. Add title template, description, metadata base `https://github.com/derprofi1313/signal-scout`, Open Graph metadata, skip link, semantic header/main/footer, theme color, and generated `opengraph-image.tsx`.

- [ ] **Step 3: Build the landing thesis**

Implement the exact hero headline:

```text
Markets move.
Your evidence shouldn’t.
```

The primary action is `Inspect the evidence`; secondary copy shows `pnpm dlx signal-scout init`. The hero’s chain rail visibly connects source, normalized hash, exact diff, and priority reason. The animation runs once and is removed under reduced motion.

- [ ] **Step 4: Build the transparent demo**

Use a source named `Demo pricing fixture` at `https://fixture.invalid/pricing`. Label it `Synthetic fixture` above the first data fragment. Render capture times, shortened hashes with accessible full values, before/after fragments, textual addition/removal markers, categories, scores, and reasons.

`DemoExplorer` filters `all`, `pricing`, `packaging`, and `product` through keyboard-operable buttons with `aria-pressed`. Empty filtered states explain how to return to all changes.

- [ ] **Step 5: Apply the Evidence Desk design**

Use the exact six-color token system, a 12-column desktop grid, 4-column mobile grid, sharp evidence cards with 2–8 px radii, monospaced metadata, generous cold-paper space, and the provenance rail as the one visual signature. Do not add gradients, fake charts, glassmorphism, floating orbs, or decorative statistics.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm typecheck
pnpm build
pnpm test:e2e
```

Expected: all exit `0`.

Commit:

```bash
git add src/app src/components src/data e2e playwright.config.ts
git commit -m "feat: create evidence desk experience"
```

## Task 5: Open-source repository surface and automation

**Files:**

- Create: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `CHANGELOG.md`
- Create: `docs/architecture.md`
- Create: `docs/trust-model.md`
- Create: `examples/signal-scout.config.json`
- Create: `examples/github-actions/scan.yml`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/codeql.yml`
- Create: `.github/dependabot.yml`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/pull_request_template.md`
- Create: `public/banner.svg`

**Interfaces:**

- Documents the exact CLI and schema from Tasks 2–3.
- CI consumes only package scripts from Task 1.

- [ ] **Step 1: Write the README as an executable quick start**

Lead with the outcome, display `public/banner.svg`, and include:

```bash
pnpm install --frozen-lockfile
pnpm cli init
pnpm cli scan
```

Explain baseline versus changed runs, output paths, exit codes, the synthetic demo, trust guarantees, limitations, security posture, local development, architecture, roadmap, contributing, and license. Never state that the package is published to npm or that a hosted product is live.

- [ ] **Step 2: Add real examples**

The example configuration uses `https://example.com/pricing` and clearly says it must be replaced. The Action example installs Node 24 and pnpm 11, runs `pnpm install --frozen-lockfile`, invokes the checked-out CLI, and uploads `.signal-scout/reports` as an artifact. It does not auto-commit or open pull requests.

- [ ] **Step 3: Add governance and security**

Security reporting uses GitHub private vulnerability reporting. The policy explicitly rejects authenticated scraping and bypassing access controls. Contribution commands match `package.json`. The code of conduct uses Contributor Covenant 2.1 with the repository owner as enforcement contact through GitHub.

- [ ] **Step 4: Add CI and dependency automation**

CI triggers on pushes to `main` and pull requests, uses Node 24/pnpm 11, caches pnpm, installs with frozen lockfile, runs `pnpm check`, installs Chromium with dependencies, and runs `pnpm test:e2e`. CodeQL runs for JavaScript/TypeScript on pushes, pull requests, and weekly. Dependabot checks npm and GitHub Actions weekly with grouped development updates.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: every command exits `0`.

Commit:

```bash
git add README.md CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md CHANGELOG.md docs examples .github public
git commit -m "docs: complete open source project surface"
```

## Task 6: Full-story verification and release

**Files:**

- Modify only files required by verified findings.

**Interfaces:**

- Consumes the complete repository.
- Produces the public GitHub repository `derprofi1313/signal-scout`.

- [ ] **Step 1: Run the complete local gate**

```bash
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
git diff --check
```

All commands must exit `0`.

- [ ] **Step 2: Exercise the real CLI**

Run the compiled CLI against local fixture HTTP responses in a temporary directory. Verify:

- `init` writes a valid config;
- first scan writes a baseline;
- second changed scan writes JSON and Markdown;
- third identical scan returns `no_change`;
- hashes and exact fragments match the fixture;
- invalid config exits `2`.

- [ ] **Step 3: Inspect desktop and mobile screenshots**

Capture `/` and `/demo` at 1440 × 1000 and 390 × 844. Check typography loading, chain alignment, evidence labels, focus states, overflow, reduced motion, and contrast. Remove one unnecessary decorative element if the page feels busy.

- [ ] **Step 4: Request independent review**

Give the reviewer the design spec, this plan, commit range from the root spec commit to `HEAD`, and the full diff. Fix every Critical or Important finding, then request a scoped re-review.

- [ ] **Step 5: Create and push the repository**

```bash
gh repo create derprofi1313/signal-scout --public --source=. --remote=origin --description "Git-native evidence CI for competitive changes — exact diffs, hashes, and reviewable reports." --push
gh repo edit derprofi1313/signal-scout --add-topic competitive-intelligence --add-topic change-detection --add-topic developer-tools --add-topic cli --add-topic nextjs --add-topic typescript --enable-issues --enable-projects=false --enable-wiki=false
```

Verify:

```bash
gh repo view derprofi1313/signal-scout --json url,visibility,defaultBranchRef,description
gh run list --repo derprofi1313/signal-scout --limit 5
```

Expected: public visibility, default branch `main`, intended description, and CI queued or completed.
