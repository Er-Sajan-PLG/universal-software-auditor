# 24. Quality gates judge new code, not legacy debt

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

`--fail-on` is absolute: it fails the build on any open finding at or above a
severity, including ones that predate USA by years. For a legacy codebase
adopting USA, that makes the gate unusable — the first audit fails CI on debt
nobody introduced, so teams either never enable the gate or suppress wholesale
to make it stop (the exact failure ADR-0007 and ADR-0022 exist to prevent).

The inputs for a better gate were already computed: every report embeds a
machine-readable trailer (`rule → status/severity`, ADR-0008), and `usa diff`
classifies movement between two trailers (fixed, regressed, newly applicable).
The gate just never used them.

## Decision

**`usa audit … --baseline <previous-AUDIT.md>` fails only on what the change
introduced or made worse.**

`parseBaselineTrailer` parses the baseline's trailer fail-closed (empty file,
missing trailer, non-YAML, or a `rules:`-less document all throw → CLI exit 2,
never a silent pass against nothing). `newCodeBlocking` fails a rule when its
movement — computed by the same `ruleMovement` taxonomy that drives `usa diff`
text, so the human-readable diff and the machine verdict cannot disagree — is:

- **newly-applicable AND open at or above the threshold** (default HIGH,
  `--fail-on` overrides, `none` disables), or
- **regressed** — decided before, open or back in the judgement queue now, at
  any severity. Breaking what passed is new debt no matter the rung.

Fixed, unchanged, gone, suppressed, and UNKNOWN findings never block (UNKNOWN
is "needs a human", not "failed" — the same doctrine as `--fail-on` in
`src/engine/gate.ts`). The `--fail-on`-only path is byte-identical; the
threshold handling mirrors `evaluateGate` so the two compose.

## Rationale

1. **Adoption is the bottleneck, not strictness.** A gate that fails on day one
   gets disabled on day two. Judging only the delta keeps the gate on.
2. **One taxonomy for text and verdict.** `ruleMovement`/`isOpenStatus` live in
   `diff.ts` and serve both `usa diff` output and the gate — producer and judge
   cannot disagree about what "regressed" means.
3. **Fail-closed baselines.** A gate that compares against a missing baseline
   and passes is worse than no gate; exit 2 says so loudly.

## Consequences

**Good:** legacy adoption no longer requires a clean tree on day one; SPRINT 0
in the roadmap and the gate now agree on what "new" means; the movement
taxonomy is independently testable without building reports.

**Bad:** teams must keep one baseline report (a dated file in `reports/`, per
the getting-started workflow) or the flag errors; a rule renamed between
baseline and now reads as newly-applicable (fail) plus gone (ignored) — noisy
but safe, and renames are rare.

**Neutral:** the trailer is unchanged, so old baselines keep working; `usa diff`
output strings are byte-identical to the pre-taxonomy implementation (the diff
tests pin them).
