# 41. Severity follows observed maturity, never declared stage

- **Date:** 2026-09-15
- **Status:** Accepted

## Context

A downstream audit (ai_infrastructure) surfaced a reproducible
observation: `foundation init` records a stage (`prototype`), but the
severity bar keeps following the auto-detected maturity (MVP) — only
`--profile` moves it. The reporter asked whether this is a bug. It is
not; it is the load-bearing half of the foundation contract, and it was
never written down. Until now.

## Decision

Severity dampening reads detected maturity only. Declared stage gates
_which_ intent rules apply, never _how hard_ they hit.

## Rationale

Grading by declaration is gameable in the dangerous direction: a
production system declaring `prototype` would buy leniency with a word.
Grading by observation cannot be talked down — the bar follows measured
reality (commits, tests, releases, signals), not aspiration. The reverse
(declared-higher raises the bar) was considered and rejected: strictness
the team wants is available explicitly via `--profile`, while automatic
max() would punish honest ambition statements and tangle two inputs with
different trust levels. Words declare intent; measurements set the bar.

## Consequences

- `maturity.ts` takes no foundation input, permanently. A future change
  here needs its own ADR overturning this one.
- Teams wanting a harder bar than observed pass `--profile` explicitly.
- The header keeps showing both values side by side (declared stage,
  detected profile) so the distinction stays visible instead of implied.
