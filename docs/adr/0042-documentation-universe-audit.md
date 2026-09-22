# 42. Documentation is a first-class audit universe, not a report garnish

- **Date:** 2026-09-21
- **Status:** Accepted

## Context

USA audits correctness, security, and engineering health — but treated
documentation as an afterthought: a handful of README/CHANGELOG rules inside
other sections, no model of _which_ documents a project owes at its stage of
life, no way to answer "this file changed, which docs are now lying?", and no
way for a CI gate to enforce doc health the same way it enforces security
findings. Downstream users asked for exactly that: an auditor that can check
any software repository for documentation as a first-class concern.

## Decision

Add a documentation universe audit as a first-class capability:

- **`rules/docs-taxonomy.yaml`** (schema `usa-doc-taxonomy-v1`) declares the
  full universe: 14 categories, 220 artifact types, each with a tier
  (0 Day-1 → 4 ongoing), an ownership kind (canonical/derived/generated/…),
  presence patterns, applicability predicates, invalidation sources, and
  dependency edges (`derives_from` / `syncs_with`).
- **`usa docs audit|impact|coverage`** — read-only, deterministic commands:
  a tiered inventory with invariants, a semantic impact analysis for changed
  files, and a full-universe coverage report.
- **Six mechanical invariants** (routes, env vars, docstrings, broken links,
  generated-artifact drift, changelog-vs-tags) compare machine-observed
  facts against what the docs claim.
- **Injection, opt-in:** `usa audit --docs-universe` (or
  `.usa.yaml: docs.universe: true`) appends the same DOCU findings to the
  main audit report, so the check and the CI gate use one code path.

## Rationale

- **No silent staleness (AC-1).** A repo state is "source + tests + docs +
  generated artifacts, mutually consistent". The invariants make
  source↔doc divergence a finding instead of a discovery during
  archaeology.
- **Determinism is non-negotiable.** No LLM in the enforcement path: the
  taxonomy is data, the impact graph is a bounded BFS, and the findings are a
  pure function of (project, taxonomy, facts, changed files). The same inputs
  produce byte-identical output, so baselines and CI gates are meaningful.
- **Semantic impact, not git-diff-only.** Changed files map through declared
  sources and dependency edges; transitive and cross-category propagation is
  reported, and detection is deliberately conservative (prefer a flagged doc
  over a stale one).
- **Tiered expectations.** A prototype is not graded against launch bars:
  tier 0 (README/LICENSE/CONTRIBUTING/CHANGELOG/comments) is expected
  immediately, tier 4 only for ongoing projects. Missing expected artifacts
  are findings; missing optional ones are noise.
- **Conservative by construction.** Presence is pattern-based and its limits
  are reported in every report; unknown taxonomy references fail closed with
  loud warnings, never silent skips.

## Cost

- ~5 new engine modules + taxonomy (~2900 lines of YAML data) and a CLI
  surface. Coverage thresholds were re-ratcheted; the standalone commands
  share the main audit's gate so `--fail-on` semantics cannot drift apart.
- The taxonomy is a living document: every new artifact type USA learns about
  is a data change, not a code change — which is the point.
