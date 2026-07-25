# Trust model

Signal Scout preserves a reviewable chain from a configured public URL to exact
normalized change fragments. Its trust claim is deliberately narrower than
“this is everything a competitor changed” or “this change matters.”

## What Signal Scout guarantees

Given the same captured bytes, valid configuration, and prior snapshot, Signal
Scout deterministically:

- computes raw and normalized SHA-256 hashes;
- extracts and orders the same semantic lines;
- produces the same line diff under a bounded comparison;
- applies the same category, score, priority, and literal reasons;
- orders packet changes consistently; and
- renders the same Markdown review for the same evidence packet.

Every packet identifies its schema as `signal-scout/evidence@1`, retains the
requested and canonical URL metadata, records capture times in ISO 8601 UTC,
preserves exact before/after normalized fragments, and carries known
limitations.

## What the hashes prove

A SHA-256 value is a content fingerprint. If a trusted earlier packet says a
normalized document had hash `A` and a later packet says `B`, reviewers can
verify that the normalized representations differ. Recomputing a packet hash
also exposes accidental or deliberate modification relative to a separately
trusted copy.

The hashes are not signatures. By themselves they do not prove:

- who controlled or published the remote page;
- that the response came from the expected organization;
- that the operator's clock was accurate;
- that the server returned the same content to another location or identity;
- that no content was omitted by JavaScript, personalization, normalization, or
  configured ignore selectors; or
- that a stored packet has an externally notarized timestamp.

Use Git history, signed commits, protected artifact storage, or an independent
timestamping system when those properties are required.

## Trust boundaries

### Operator and configuration

The operator chooses URLs, source kinds, ignore selectors, storage location, and
retention. Signal Scout validates shape and rejects embedded URL credentials,
but it cannot decide whether the operator is authorized to capture or retain a
page. An overly broad ignore selector can hide a meaningful change.

### Network and remote source

The captured response is untrusted input. Production capture resolves and
validates every redirect hop, rejects non-public and reserved address ranges,
and pins a validated address into the socket so a later DNS answer cannot
silently change the destination for that connection. Requests are bounded by
redirect count, timeout, body size, and accepted content type. The final
redirected URL and canonical URL metadata are recorded for review. These
controls reduce server-side request-forgery risk; they do not attest to hosting
ownership, publisher identity, or the completeness of a response.

### Local machine

The process trusts its Node.js runtime, dependencies, filesystem, environment,
and clock. Atomic replacement reduces partial-write risk but does not protect
against a compromised machine or an actor with write access to both evidence
and its comparison history.

### GitHub Actions

The example workflow executes repository code on a hosted runner and can cache
baseline state and upload reports. It does not commit or open pull requests.
Repository maintainers remain responsible for workflow permissions, dependency
pinning policy, artifact retention, branch protection, and review.

### Website demo

The website renders a checked-in synthetic fixture. It is a visualization of
the packet contract, not proof that a live scan ran. The `.invalid` URL and
`Synthetic fixture` label are part of that boundary.

## Capture limitations

- Only public HTTP(S) HTML, XHTML, and plain text are supported.
- Client-side JavaScript is not executed, so rendered-only content may be
  absent.
- Requests time out after 15 seconds and accepted bodies are limited to 2 MiB.
- Redirects are limited to five and each destination is resolved, validated,
  and pinned independently.
- Raw hashes cover response bytes before decoding. Invalid UTF-8 is decoded
  with replacement characters and disclosed as a limitation.
- Normalization extracts selected semantic elements and stops at 800 lines.
- Diff comparison is bounded to 400 × 400 lines.
- Cookie banners, navigation, timestamps, A/B tests, localization, and
  personalization can still create noise unless safely ignored.
- Canonical URL elements are page-controlled metadata and may be missing or
  misleading.

Truncation and bounded-comparison effects belong in `limitations`. Absence of a
limitation means the implemented guard did not report one; it is not proof that
the source was complete.

## Classification limitations

Classification is an explainable heuristic over changed text and configured
source kind. A `high` priority with score `90` means a literal rule fired; it is
not 90% confidence. The classifier does not infer intent, financial impact,
competitive strategy, or causality.

Reviewers should inspect the exact fragments and source before acting. Markdown
reports explicitly describe themselves as deterministic evidence rather than
strategic advice.

## Failure semantics

`baseline`, `no_change`, `changed`, and `failed` are distinct states:

- `baseline` means no stored prior capture was available for comparison.
- `no_change` means the compared normalized representations matched.
- `changed` means at least one semantic diff was recorded.
- `failed` means capture or processing did not produce successful evidence for
  that source.

One source failure does not erase another source's successful packet. The
overall CLI exits `1` when any source fails, `2` for invalid configuration or
usage, and `0` only when the requested operation completes without a source
failure.

## Responsible operation

Capture only sources you are permitted to access. Do not add credentials, evade
authentication, bypass access controls, or use Signal Scout to probe private
systems without explicit authorization. Review generated files before sharing
or placing them in version control; public pages can still contain personal or
sensitive data.

Security issues in Signal Scout belong in
[GitHub private vulnerability reporting](https://github.com/derprofi1313/signal-scout/security/advisories/new),
not in a public issue.
