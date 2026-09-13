# 28. Signature verification gets a CLI command

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

ADR-0025 shipped verification as library code with "no CLI surface yet",
calling the wiring "a small, unblocked follow-up". An unverifiable-by-hand
verifier is dead code with tests: nobody will consume `verifyDetachedSignature`
until a command invokes it, and supply-chain evidence nobody checks is
documentation, not control.

## Decision

**`usa verify-report <AUDIT.md> --bundle <sidecar> [--key] [--cosign-binary]
[--quiet]` verifies a detached report signature.**

Exit codes mirror the gate convention (`gate.ts`): 0 verified, 1 mismatch or
failed verification, 2 malformed input (no trailer, bad sidecar, missing
files) or absent cosign — all loud on stderr. The command reuses
`parseTrailer`, `canonicalReportBytes`, and `verifyDetachedSignature`
unmodified; no new canonicalization, no new crypto, no key handling, no
minting (ADR-0011 still holds — the amendment it would need is untouched).

## Rationale

1. **Reuse, not re-implementation.** Every byte of trust logic already existed
   and was tested; the command is argument parsing plus exit codes.
2. **Convention over invention.** Exit-code semantics match the gates, so CI
   authors learn one contract: 0 pass, 1 failed-open finding, 2 broken input.
3. **Docs ship with the flag.** The CLI reference regenerates (the `resync`
   job enforces it per ADR-0026) and `docs/release.md` documents usage next to
   the verify-side design.

## Consequences

**Good:** the verify-side story from ADR-0025 is now end-to-end usable,
including live cosign smoke tests; `tests/verify.test.ts` pins the exit-code
contract.

**Bad:** one more command surface to maintain; `--key` vs bundle-embedded key
semantics inherit cosign's UX rather than improving it.

**Neutral:** no engine, report, or trailer changes — the command is a thin
shell over tested library code, so its blast radius is its own file plus help
text.
