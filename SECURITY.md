# Security policy

Signal Scout fetches remote content and writes evidence to local storage.
Security reports about URL validation, request guards, parsing, path handling,
artifact integrity, dependency behavior, or the website are welcome.

## Supported versions

Signal Scout is pre-1.0. Security fixes target the current `main` branch and the
latest tagged release when one exists. Older snapshots may not receive fixes.

## Report a vulnerability

Use
[GitHub private vulnerability reporting](https://github.com/derprofi1313/signal-scout/security/advisories/new).
Do not open a public issue for an unpatched vulnerability.

Include, when available:

- the affected command, module, and revision;
- prerequisites and a minimal reproduction;
- observed and expected behavior;
- security impact and realistic attack boundary; and
- a suggested mitigation or patch.

Do not include credentials, personal data, private captured pages, or
third-party secrets. The maintainer will coordinate validation and disclosure
through the private advisory. This volunteer project does not promise a fixed
response or remediation time.

## Safe-use boundary

Signal Scout is designed for public HTTP(S) pages that the operator is permitted
to access. It does not support URL credentials or authenticated scraping. Do not
use it to:

- bypass login, paywall, bot protection, rate limit, or other access control;
- probe private services or networks without explicit authorization;
- collect data contrary to applicable law, site terms, or organizational
  policy; or
- publish secrets or sensitive content captured from a source.

Operators choose the source URLs and remain responsible for authorization,
retention, and review of generated artifacts.

## Security properties and limits

Requests have a 15-second timeout, a 2 MiB accepted-body limit, and restricted
HTML/text content types. Configuration rejects embedded URL credentials, local
hostnames, and private literal IP addresses. Successful source results are
retained when another source fails.

Those guards do not make remote content trustworthy. SHA-256 detects content
changes relative to a known hash; it is not a digital signature, origin proof,
timestamp authority, malware scanner, or guarantee that a page was complete.
See [`docs/trust-model.md`](docs/trust-model.md) for the full boundary.

## Out of scope

- reports about a third-party website that do not demonstrate a Signal Scout
  vulnerability;
- requests to add credential handling or access-control bypasses;
- social engineering, denial of service, or destructive testing; and
- automated scanner output without a reproducible security impact.

There is currently no bug bounty or reward program.
