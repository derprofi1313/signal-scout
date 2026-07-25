# Contributing to Signal Scout

Signal Scout accepts focused changes that strengthen its deterministic evidence
contract, local CLI, inspectable demo, documentation, or verification.

## Before you start

- Use Node.js 24 or newer and pnpm 11.6.0.
- Read [`docs/architecture.md`](docs/architecture.md) and
  [`docs/trust-model.md`](docs/trust-model.md).
- Search existing issues before proposing overlapping work.
- Report vulnerabilities privately according to [`SECURITY.md`](SECURITY.md).
- Keep captured examples synthetic or clearly replaceable. Do not add customer
  names, testimonials, usage figures, secrets, or private page content.

## Set up the repository

```bash
npm install --global pnpm@11.6.0
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

Start the website with `pnpm dev`. Exercise the checked-out CLI with
`pnpm cli --help`; do not rely on a globally installed or published package.
Installing the pinned pnpm version explicitly keeps setup working on Node.js
releases that do not bundle Corepack.

## Make a change

Keep one concern per pull request. Behavioral core changes follow observed
red-green-refactor:

1. add a focused test that fails for the missing behavior;
2. run that test and confirm the expected failure;
3. implement the smallest complete change;
4. rerun the focused test, then the repository gates; and
5. update documentation and fixtures when the public contract changes.

The core stays independent of Next.js. Network, clock, and filesystem boundaries
must remain injectable where tests need control. A new category or priority rule
must use explicit literals and deterministic tie-breaking; do not introduce a
`confidence` field or strategy claims.

Avoid dependencies when a small, well-tested implementation is sufficient. A
dependency change needs a concrete maintenance or security rationale in the pull
request.

## Verify locally

Run the same non-browser gate used by CI:

```bash
pnpm check
```

Then run browser verification:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Useful focused commands are:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm audit
pnpm build
pnpm build:cli
```

Do not weaken coverage thresholds, accessibility checks, fetch guards, or schema
validation to make a change pass.

## Pull requests

Explain:

- the user-visible problem and the chosen scope;
- evidence that demonstrates the behavior before and after the change;
- commands run and their results;
- changes to the evidence schema, storage, security, or trust boundary; and
- any limitation left intentionally unresolved.

The repository does not accept workflows that automatically commit generated
evidence or open pull requests. A human must decide what enters project history.

By participating, you agree to follow the
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Contributions are licensed under the
repository's [MIT license](LICENSE).
