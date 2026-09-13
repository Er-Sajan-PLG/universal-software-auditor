# 27. Provenance is verified in two halves: existence, then chain

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

The roadmap asked for provenance verification with a maturity split:
existence at beta, chain verification at production. The naive design is one
rule with a clever check. That fails on two counts: a single rule cannot be
both deterministic (file presence) and opt-in (shelling to cosign) without its
automatability lying, and a beta project should not fail for lacking a signing
ceremony it will only need at production.

## Decision

**Two packs, split by what they can prove and when it is required.**

- `core/provenance-attestation.yaml` (SUP-022–024): **existence**, beta and up
  (`skip_when: maturity:prototype`). Deterministic `any_file`/`file_exists`
  checks for SLSA provenance files, Verification Summary Attestations, and
  detached signature/transparency bundles. Absent reads MISSING, per the
  severity/status axis discipline (ADR-0006). Fully automatic.
- `core/provenance-cosign.yaml` (SUP-018–020): **chain**, production only
  (`applies_when: maturity:production`). `command`-kind rules invoking local
  `cosign verify-blob` — assist-class, UNKNOWN without `--allow-commands`,
  FAIL (never PASS) on missing binary, key, bundle, or uncovered artifact.
- Both packs derive catalogue (`SLSA-*` references → `slsa@1.2`) and
  automatability from kind; neither carries a tag that could drift (ADR-0021).
  Both ship per-rule fixtures (ADR-0017). Verification only, per ADR-0011 —
  nothing mints.

## Rationale

1. **The maturity split is the point.** Beta proves the artifact _exists_;
   production proves the _chain_. Encoding that in applicability (not prose)
   means the engine enforces the roadmap's own words.
2. **Kind honesty.** Existence is a pure function of the tree (`full`);
   chain verification needs a permission grant (`assist`). One rule claiming
   both would make `usa standards` lie.
3. **First oracle-adjacent rules in the tree.** The `command`/`oracle` kinds
   shipped with the engine (ADR-0019) but had no first-party rules exercising
   them; these packs close that gap and the fixture harness covers them.

## Consequences

**Good:** the last "Next: rule coverage" roadmap item graduates; `usa
standards` reports SLSA coverage with a real full/assist split; the demo-app
sample shows the packs loading (attestation correctly skipped on a prototype).

**Bad:** production projects without cosign wired up gain new UNKNOWN/FAIL
surface — intended (that is the finding), but noisy on first adoption; the
new-code gate (ADR-0024) is the recommended rollout path.

**Neutral:** rule IDs SUP-021 and SUP-025 are skipped (reserved gaps between
the two packs' ranges); the VSA/attestation filename patterns are heuristic
and will need widening as formats settle — fixtures make that cheap.
