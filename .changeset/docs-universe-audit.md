---
'@xenos1996/usa': minor
---

Documentation universe audit: USA now audits documentation as a first-class
concern (ADR-0042).

- New `rules/docs-taxonomy.yaml` — the full documentation universe:
  14 categories, 220 artifact types, tiered by lifecycle stage, with
  presence patterns, applicability predicates, invalidation sources, and
  dependency edges.
- New commands: `usa docs audit` (inventory, tier coverage, six
  machine-verified invariants, optional impact analysis, `--fail-on` CI
  gate), `usa docs impact` (which docs a set of changed files invalidates —
  direct, transitive, and cross-category), and `usa docs coverage`
  (full-universe coverage report). All read-only and deterministic.
- Six invariants compare machine-observed facts against the docs: HTTP
  routes vs API docs, env vars vs documentation, docstring coverage,
  broken relative links, generated-artifact provenance, and
  changelog/tag consistency.
- Main-audit integration, opt-in: `usa audit --docs-universe` or
  `.usa.yaml → docs.universe: true` appends the same DOCU findings to the
  main report (section S12), so check and CI gate share one code path.
- CI: the self-audit workflow gains a separate documentation-universe gate
  (`usa docs audit . --fail-on medium`).
