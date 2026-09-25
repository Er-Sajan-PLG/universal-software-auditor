# Documentation universe audit

USA treats documentation as a first-class correctness concern: the repository
state is _source + tests + docs + generated artifacts, mutually consistent_,
and `usa docs` audits that contract deterministically. No LLM, no judgement
calls — the taxonomy is data, the impact graph is a bounded search, and the
findings are a pure function of (project, taxonomy, facts, changed files), so
the same inputs always produce byte-identical output.

See [ADR-0042](adr/0042-documentation-universe-audit.md) for the decision and
its costs.

---

## 1 · What the universe is

`rules/docs-taxonomy.yaml` (schema `usa-doc-taxonomy-v1`) declares the full
documentation universe: <!-- usa:fact taxonomy-categories -->14<!-- /usa:fact -->
categories (project & governance, requirements, architecture, source code docs,
API, configuration, testing, operations/SRE, security, user-facing, developer,
compliance/legal, analytics, meta-documentation) and
<!-- usa:fact taxonomy-artifacts -->220<!-- /usa:fact --> artifact types. Each artifact

declares:

| Field          | Meaning                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `tier`         | When it is owed: 0 = Day 1, 1 = Week 1, 2 = Sprint 1, 3 = pre-launch, 4 = ongoing                        |
| `kind`         | Ownership class: `canonical`, `derived`, `generated`, `reference`, `example`, `index`                    |
| `patterns`     | Globs that detect presence; empty list = not mechanically trackable → reported `MANUAL`, never `MISSING` |
| `applies_when` | Optional predicate over detector facts (e.g. a data dictionary applies only when a database is present)  |
| `sources`      | What invalidates it: globs, or `any-source` (every change touches it — conservative by design)           |
| `derives_from` | Downstream artifacts that must follow this one when it changes                                           |
| `syncs_with`   | Mutual-consistency partners (changelog ⇄ release notes, data dictionary ⇄ schema docs, …)                |
| `alias_rule`   | The existing USA rule that already reports this absence, so the main audit never double-dips             |

**Tiers follow the maturity profiles**
([maturity-profiles](maturity-profiles.md)): prototype/legacy expect tiers
0–1, mvp expects 0–2, beta expects 0–3, production expects 0–4. A missing
_expected_ artifact is a finding (tier 0 = MEDIUM, tiers 1–3 = LOW, tier 4 =
FUTURE, subject to the normal profile dampening); a missing _optional_ one is
not noise worth reporting.

---

## 2 · The commands

```
usa docs audit [path]     Inventory + tier coverage + invariants + optional impact; writes a report
usa docs impact [path]    Which documentation a set of changed files affects
usa docs coverage [path]  Coverage report against the full taxonomy
```

All three are read-only, deterministic, and share one load path (project
index → detection → taxonomy), so they can never disagree with each other or
with the main audit.

### `usa docs audit`

Writes `DOC-AUDIT.md` by default (`--out` to move it, `--format json` for
machines) and prints a one-line summary. The report contains:

- **Verification report** — baseline commit, per-tier presence/absence
- **Tier coverage** — applicable vs present vs missing vs manual per tier
- **Documentation universe** — every category, every artifact, with status
- **Invariants** — the six machine checks (§3 below), each PASS/FAIL with
  expected vs actual and the violating locations
- **Impact analysis** — only when `--changed <file>` is given
- **Open findings** — one finding per missing expected artifact and per
  failing invariant, each with location, why, and a concrete repair step
- **Known limitations** — the honest list of what pattern-based detection
  cannot see

`--tiers 0,1,2` overrides the expected tiers; `--profile mvp` overrides the
maturity used for them. `--fail-on medium` gates the command like the main
audit's gate (exit 1 on findings at or above the threshold) — that flag is
the CI check (§5).

```
$ usa docs audit . --out DOC-AUDIT.md
$ usa docs audit . --fail-on medium        # CI gate
```

### `usa docs impact`

The semantic half of "no silent staleness". Given changed files, it answers
_which documentation is now potentially lying_ — directly (a declared
`sources` glob matches the file) and transitively (the artifact's
`derives_from`/`syncs_with` neighbourhood, bounded BFS), marking
cross-category edges and the traversal reason for every hit.

```
$ usa docs impact . --changed src/api/users.ts --changed .env.example
$ usa docs impact . --describe docs/api/users.md
```

Detection is deliberately conservative: a flagged doc beats a stale one.
`any-source` artifacts (changelog, release notes, …) absorb every change —
that is intended, not a bug.

### `usa docs coverage`

The AC-15 view: the full
<!-- usa:fact taxonomy-artifacts -->220<!-- /usa:fact -->-artifact universe against the

project — applicable, present, missing, manual, not-applicable — per tier and
per category, as md or `--format json`.

---

## 3 · The six invariants

Each invariant compares _machine-observed facts_ against _what the docs
claim_, and fails with the expected statement, the actual observation, the
violating locations, a cross-category hint, and a repair command:

| ID                | Contract                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOCU-INV-ROUTES` | Every HTTP route defined in code (Express/Flask/FastAPI/chi-style) is mentioned in the API documentation corpus (OpenAPI, `docs/api/**`, …) |
| `DOCU-INV-ENV`    | Every environment variable read by the code is documented                                                                                   |
| `DOCU-INV-DOCS`   | Public top-level definitions carry docstrings (Python docstrings / JSDoc)                                                                   |
| `DOCU-INV-LINKS`  | Relative links inside the documentation resolve (no broken xrefs)                                                                           |
| `DOCU-INV-GEN`    | Generated artifacts match their generator's declared inputs (drift check)                                                                   |
| `DOCU-INV-CHLOG`  | Release notes/changelog stay consistent with the git tags that exist                                                                        |

Route and env-var extraction are framework-broad heuristics; the known blind
spot (exotic routers) is stated in every report rather than hidden.

---

## 4 · Integration with the main audit

The documentation universe is **opt-in** in the main audit so existing
baselines stay stable:

```
$ usa audit . --docs-universe
```

or, persistently, in `.usa.yaml` (see [configuration](configuration.md)):

```yaml
docs:
  universe: true
```

The injection appends the same DOCU findings the standalone command emits —
same rule ids (`DOCU-*`), same S12 section, same gate — computed by the same
`docFindings` function, so **check == CI** by construction: what
`usa docs audit --fail-on medium` fails on, the main audit reports, and the
quality gate blocks. Artifacts whose absence is already reported by an
existing rule (via `alias_rule`) are suppressed in the main audit so a gap
never double-dips the score; the standalone report still lists everything.

---

## 5 · CI

```yaml
- name: Documentation universe gate
  run: usa docs audit . --fail-on medium
```

This is a separate concern from the main audit gate (drift and staleness
should not block a build that the security posture would pass), so it runs as
its own step. `--fail-on none` is the default: the report is information,
the flag is the enforcement.

---

## 6 · Extending the taxonomy

Adding an artifact type is a data change: append an entry to
`rules/docs-taxonomy.yaml` (next free id 1–220, declared category, valid
tier/kind, patterns or `MANUAL` by omission, `sources` for invalidation,
edges for propagation). The loader is fail-closed — a malformed entry is
skipped with a loud warning, an unknown edge target is dropped with a
loud warning, and a missing or unparsable file degrades the whole universe
gracefully (the audit continues, the report says the universe is
unavailable). The unit tests pin the shipped file's shape (ids, edges,
categories, zero warnings), so silent data rot fails CI.
