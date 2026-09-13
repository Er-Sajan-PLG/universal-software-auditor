# 32. Testing assurance ships as deterministic slices, honestly labeled

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

The testing-assurance program (sixteen sections: knowledge model, evidence
model, gap detection, quality, coverage semantics, mutation, regression,
architecture-aware, risk-based, pyramid, traceability, spec-vs-implementation,
freshness, AI-test skepticism, assurance report) is largely _interpretive_:
it asks what tests prove, what they omit, and whether confidence is
justified. Most of that needs reasoning no grep can supply. Shipping the
whole program as rules would require the engine to assert what it cannot
verify — the failure ADR-0006 exists to prevent.

## Decision

**Ship the checkable shadow now (TAS-001–011); interpretation stays
agent-side; label everything per ADR-0030's honesty discipline.**

- `core/testing-assurance.yaml` asserts presence-patterns only: unit /
  integration / system layout existence, contract-test files, coverage config
  and thresholds, mutation evidence artifacts, determinism guards, retry
  budgets, failure-path assertions, isolation markers. Each rule's `why`
  states what it proves AND what it does not prove — the honesty clause is
  part of the rule text, not just the docs.
- Deliberate absences: no regression-marker rule (`#123` in tests/ is too
  noisy — absence beats a noisy rule), no quality verdicts, no pyramid
  arithmetic, no traceability claims. Those need the session layer (Wave B)
  or remain permanently agent-side.
- The knowledge taxonomy (level ≠ objective ≠ technique ≠ strategy) is not
  encoded as a second framework: rules cite concrete evidence patterns, and
  the interpretive vocabulary lives in agent-side guidance, not engine data.
  Per ADR-0030's no-duplication rule, a taxonomy without a consumer is prose,
  not architecture.

## Rationale

1. **Presence is checkable; quality is judgement.** The deterministic slice
   is exactly the file/pattern-detectable subset — everything else would be
   the engine opining.
2. **Honesty clauses scale.** A rule that states its own limits teaches the
   agent and the reader at once, and survives the session layer unchanged.
3. **Fixtures pin the modesty.** Every TAS rule's negative/positive fixtures
   prove it fires on absence and passes on presence — nothing more claimed.

## Consequences

**Good:** eleven evacuated, testable checks covering layout, contracts,
coverage config, determinism signals, and isolation markers; the assurance
program has a deterministic foothold the session layer can build on.

**Bad:** the headline promises (gap narratives, risk-weighted assurance,
pyramid health, traceability) are still PROPOSED — anyone reading the rule
titles without the `why` clauses will overestimate what shipped.

**Neutral:** TAS rules are universal (no skip_when), so every audit's S7
moves on day one; the new-code gate (ADR-0024) is again the rollout path.
