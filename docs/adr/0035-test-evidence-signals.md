# 35. Test evidence starts as counted signals, not verdicts

- **Date:** 2026-09-14
- **Status:** Accepted

## Context

The assurance program asks what tests prove — a question that tempts
verdicts: "this suite is weak", "coverage is misleading here". A deterministic
module cannot hold those opinions honestly. What it can hold is counts:
how many files look like integration tests, how many assertions mention
failure, how many focused markers would hijack a run, how old the evidence
is. Signals, not sentences.

## Decision

**`src/engine/test-evidence.ts` counts; agents interpret. Every constant is
documented; every heuristic disclaims itself.**

- `classifyTestFile` / `inventoryTests`: path-pattern levels (unit,
  integration, system, e2e, unknown) with caller-overridable patterns.
- `assertionSignals`: regex counts for failure assertions, mock usages,
  focused and skipped markers — presence signals, never verdicts.
- `pyramidAssessment`: shape flags (`top-heavy` above a documented 30%
  system+e2e share, `no-middle`, `untested`) with the docstring stating the
  pyramid is a heuristic, not a law — architecture and risk decide.
- `freshnessCheck`: pure on explicit timestamps; time paradoxes fail closed
  (stale, not an exception).
- No scoring, gate, or report input. The module is library code with 33
  pinned tests, exported for the session layer and future assurance
  rendering to consume.

## Rationale

1. **Counts compose; verdicts don't.** An agent can weigh "74 integration
   tests, 0 contract tests, 3 focused markers" into a gap narrative; a
   premature `health: WEAK` string would just be argued with.
2. **Boundaries beat cleverness.** Mock-pattern detection stops at counting
   — distinguishing over-mocking from proper isolation needs reading, which
   is agent work (the AI-skepticism patterns stay a playbook, not code).
3. **Determinism is testable.** 33 tests pin tables, boundaries, and paradox
   behavior; no fixtures, no clock reads, no network.

## Consequences

**Good:** the session layer and the future assurance report section have a
stable, tested counting foundation; heuristics are reviewable constants, not
buried magic numbers.

**Bad:** counts without interpretation can mislead exactly the way raw
coverage does — consumers must pair every number with the documented
"signals, not verdicts" caveat, and nothing enforces that except review.

**Neutral:** the module reads file paths and contents handed to it — it does
no indexing itself, so callers (sessions, gates, future renderers) own input
provenance.
