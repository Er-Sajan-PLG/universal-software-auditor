# 25. Report signatures are verified, never minted

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

The roadmap asks for Sigstore-grade evidence attached to `AUDIT.md`. The
charter (ADR-0011) forbids USA from becoming a signer: no key handling, no
minting, no signing ceremony inside the tool. Those two sentences collide —
"supply-chain-grade evidence" sounds like the tool should sign its own report.

The collision resolves the same way ADR-0019 resolved external scanners:
**verify, don't mint.** USA already consumes evidence other tools produce
(oracle checks ingest SARIF/JSON); a detached signature is just evidence of a
different shape. The tool does not need to sign anything to check that
something was signed.

## Decision

**`src/report/signature.ts` verifies detached report signatures; nothing in
USA creates one.**

- `canonicalReportBytes` reuses the single `trailer()` projection — no second
  canonicalization to drift.
- `verifyDetachedSignature` checks a bound SHA-256 fast path, then shells out
  to an explicitly-invoked local `cosign verify-blob` subprocess (the same
  opt-in posture as `command` checks: absent binary errors explicitly, never a
  fake pass). No network calls from the spine.
- The `.sig.json` sidecar (`usa-report-sig-v1`: payload hash, base64 bundle,
  optional key hint) is parsed fail-closed — seven malformed shapes rejected
  in tests.
- Minting stays blocked pending an ADR-0011 amendment, and `docs/release.md`
  says so plainly. There is no `sign` function, no CLI wiring, no key handling.

## Rationale

1. **The charter holds.** Verification consumes external evidence exactly like
   oracle ingestion; minting would make USA a signer and re-open ADR-0011.
2. **One canonicalization.** Reusing `trailer()` means the signed bytes and the
   diffed bytes are the same bytes — a signature cannot vouch for a report
   `usa diff` would disagree with.
3. **Fail-closed at every layer.** Tampered payload, malformed sidecar, absent
   binary, missing key — each is an explicit error, never a quiet pass.

## Consequences

**Good:** a team with cosign infrastructure gets verifiable audit artifacts
without USA touching keys; the verify path is fully tested including live
cosign end-to-end (skipped gracefully where cosign is absent).

**Bad:** half the roadmap item ships — anyone wanting `usa audit --sign` must
first win the ADR-0011 argument. The sidecar format is new surface to maintain.

**Neutral:** verification is pure library code with no CLI surface yet; wiring
it into a `usa verify-report` command is a small, unblocked follow-up.
