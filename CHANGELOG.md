# Changelog

All notable changes to Signal Scout are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No changes yet.

## [0.2.0] - 2026-07-26

### Added

- A root GitHub JavaScript Action with two inputs (`config` and
  `fail-on-change`), seven literal scan outputs, and a Node 24 committed
  CommonJS bundle.
- A bounded, escaped, metadata-only GitHub job summary that never includes
  captured before/after evidence fragments.
- A pinned consumer-workflow example that leaves baseline cache and evidence
  artifact retention under the caller's explicit control.

### Changed

- The bundled Action reuses the existing CLI scan path and preserves the
  `signal-scout/evidence@1` packet schema and CLI scan semantics. A configured
  change gate fails only after evidence, outputs, and summary data are written.

No npm package, GitHub Marketplace listing, or hosted Signal Scout service is
released with v0.2.0.

## [0.1.1] - 2026-07-25

### Security

- Render exact evidence as indented Markdown code blocks, eliminating the
  remaining custom backtick-escaping path identified by CodeQL.

## [0.1.0] - 2026-07-25

### Added

- Git-native capture, normalization, semantic diff, deterministic
  classification, evidence-packet, and Markdown-report pipeline.
- Local `init`, `scan`, and `report` CLI commands with explicit exit codes.
- Evidence Desk landing page and transparent synthetic demo packet.
- Versioned `signal-scout/evidence@1` contract and runtime configuration schema.
- Unit, integration, browser, accessibility, build, and CI quality gates.
- Architecture, trust, contribution, conduct, and security documentation.

No npm publication or hosted Signal Scout service is represented by this
release.

[Unreleased]: https://github.com/derprofi1313/signal-scout/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/derprofi1313/signal-scout/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/derprofi1313/signal-scout/releases/tag/v0.1.1
[0.1.0]: https://github.com/derprofi1313/signal-scout/releases/tag/v0.1.0
