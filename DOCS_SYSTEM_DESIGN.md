# Autonomous Documentation System — Design (DOCS_SYSTEM_DESIGN.md)

This document is the design for the **Autonomous Documentation System** that is
present and enforced in the Universal Software Auditor (USA) repository. It is
written in two parts:

1. **As-built system** — what `chore/autonomous-docs-system` inherited from
   ADR-0020 (machine-synced docs) and ADR-0042 (documentation universe). This
   already satisfies most of the autonomous-doc requirement.
2. **Gap-closing extensions** — the three concrete additions this work makes
   (ASVS gate in CI, pre-push hook, doc→code manifest/classification gate) so
   that every enforcement point the task brief asks for is present and green.

The brief calls for a layered model. USA maps onto it as follows — deliberately
fast at the cheapest layer, thorough where time exists.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Layer 0 · Source of truth (single sources per doc type)               │
│  rules/*.yaml  package.json  src/engine/sections.ts  examples/demo-app  │
└────────────┬───────────────────────────────────────────────────────────┘
│  Layer 1 · Pre-commit (fast, staged, <seconds)                        │
│            fact-autosync (markers) + lint-staged (eslint+prettier)      │
│            → blocks stale counts / bad format on the commit that drifts │
├────────────┼───────────────────────────────────────────────────────────┤
│  Layer 2 · Pre-push (thorough, full-repo, runs local first)            │
│            build + docs:all  →  pre-empting CI                         │
├────────────┼───────────────────────────────────────────────────────────┤
│  Layer 3 · CI required checks (PR-blocking)                            │
│            hygiene: adrs, check, cli, sample, asvs, manifest          │
│            resync bot: regenerates+pushes generated docs                │
│            self-audit: usa audit --fail-on critical + docs --fail-on med│
├────────────┼───────────────────────────────────────────────────────────┤
│  Layer 4 · Scheduled (prose-only residue no commit can see)            │
│            docs-link-check.yml (15d) · docs-review.yml (15d)            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Stack and chosen tools

The repo is TypeScript 5.7 / Node 20+ / pnpm (single package) with a custom
doc-automation framework built around the real compiled engine in `dist/`.
Tool choices honour "prefer mature standard tools over bespoke ones":

| Concern                  | Tool                                                                                                 | Why not the alternative                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Generated-docs byte gate | `scripts/gen-*.mjs --check` (uses `dist/`)                                                           | Reproducible from real CLI output; a foreign linter cannot derive `--help`.                               |
| Mechanical facts         | `usa:fact`/`usa:begin` markers + `sync-docs.mjs`                                                     | Single source of truth; no markdown linter knows `package.json`'s version.                                |
| Markdown governance      | `scripts/check-docs.mjs` (11 checks)                                                                 | Replaces markdownlint/remark/vale with stack-aware checks (sections, flags, version pins, banned tokens). |
| ADR hygiene              | `scripts/check-adrs.mjs`                                                                             | Enforces immutable, sequentially-numbered history.                                                        |
| Doc universe inventory   | `rules/docs-taxonomy.yaml` (220 artifacts) + `src/engine/docs-{taxonomy,audit,impact,invariants}.ts` | The doc→code manifest IS this taxonomy (sources/derives_from/syncs_with).                                 |
| Hook framework           | husky + lint-staged (existing)                                                                       | Already present; the pre-push hook reuses it.                                                             |
| Commit gates             | commitlint (existing)                                                                                | Already enforced in CI + local hook.                                                                      |

No new dependencies are introduced. Every addition here is a script, a YAML
file, or a workflow step that re-uses an existing gate.

---

## 2. Sources of truth (one per doc type)

| Doc type                          | Source of truth                                                           | How it is kept in sync                                       |
| --------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Rule/section/DRAC counts, version | `rules/index.yaml`, `src/engine/sections.ts`, `package.json`, `docs/adr/` | fact markers, autosynced pre-commit + `docs:check` CI        |
| CLI reference                     | `dist/cli.js --help` + `dist/cli.js rules`                                | `gen-cli-docs.mjs` byte-compare CI + resync bot              |
| Sample report                     | `dist/cli.js audit examples/demo-app`                                     | `gen-sample-report.mjs` byte-compare CI + resync bot         |
| ASVS coverage                     | `rules/catalogues/asvs-5.0-controls.yaml` + loaded rule packs             | `gen-asvs-coverage.mjs` byte-compare (see extension E1)      |
| Doc→code mapping                  | `rules/docs-taxonomy.yaml` (`sources`, `derives_from`, `syncs_with`)      | `docs-taxonomy.ts` loader + `docs impact` (see extension E4) |
| Prose truth                       | the human reviewer, dated                                                 | scheduled `docs-review.yml` (15 d) + claim scanner           |
| Release history                   | changesets notes → `CHANGELOG.md`                                         | `changesets` CI job + commitlint                             |

**Principle:** anything computable is derived, never typed. ADR-0020 is the
rule; this design does not weaken it.

---

## 3. The layered enforcement model

### Layer 1 — Pre-commit (fast, incremental)

`.husky/pre-commit` currently runs:

```
node scripts/docs-autosync.mjs   # rewrite usa:fact/usa:begin blocks from source, re-stage
pnpm exec lint-staged            # eslint+prettier on staged source; prettier on staged md/yaml
```

This keeps the **mechanical facts** true on the very commit that would drift
them (e.g. a PR that adds rules auto-updates the `rules` fact to the new total in USA.md). It does
**not** run the heavier `--check` gates (they need `dist/`, i.e. a build, which
would make every commit slow) — that is the Layer-2 job. This is the repo's
deliberate trade (documented in `docs/writing-docs.md` §3): keep commit fast;
CI is the backstop.

### Layer 2 — Pre-push (thorough, full repo)

**Extension E2 (added by this work):** install `.husky/pre-push` to run the
full `docs:all` gate locally before code leaves the machine:

```
pnpm run build && pnpm run docs:all
```

`docs:all` = `docs:adrs` + `docs:check` + `docs:cli` + `docs:sample` +
`docs:asvs` (now five gates; AGENTS.md corrected from "four"). This catches
doc-only breakage (broken links, stale claims, stale generated docs) on the
developer's machine, not only in CI.

### Layer 3 — CI (required status checks, PR-blocking)

The `hygiene` job in `ci.yml` is the PR-blocking Layer-3 gate. **Extension E1
(added by this work):** add `docs:asvs` to it, so every generated doc now has its
`--check` gate in CI.

The `resync` job (PR-only, same-repo, loop-proof) auto-regenerates stale
generated docs and pushes a `docs: resync generated docs` commit. **E1 also
adds ASVS regeneration** to this bot so a rules change auto-fixes the coverage
map without human intervention.

The `self-audit.yml` workflow runs the documentation-universe gate as a
**separate, required step** (`usa docs audit . --fail-on medium`), distinct from
the security audit, so doc drift does not block a build whose security posture
passes — but USA still _reports_ its own doc debt as findings on every PR.

### Layer 4 — Scheduled (prose-only residue)

`docs-link-check.yml` and `docs-review.yml` run every 15 days, each opening one
deduped issue. These are explicitly "redundancy, not the primary gate" (ADR-0042):
they catch link rot and prose staleness that no commit-time check can see, then
hand off to a human.

---

## 4. The doc→code manifest (the "which docs does this change affect?" question)

The manifest is `rules/docs-taxonomy.yaml` (schema `usa-doc-taxonomy-v1`):
14 categories × 220 artifact types. Each artifact declares:

- `patterns` — globs that detect presence (empty ⇒ `MANUAL`, never `MISSING`);
- `sources` — what invalidates it (a changed file hits it) — this is the
  doc→code mapping;
- `derives_from` / `syncs_with` — propagation edges for the impact graph;
- `applies_when` — applicability predicate over detection facts;
- `alias_rule` — the existing USA rule that already reports this absence, so the
  main audit never double-dips the score.

`src/engine/docs-impact.ts` runs a **bounded BFS** over these edges from the
changed files to produce `usa docs impact` — the semantic answer to "this file
changed, which docs are now lying?" Detection is deliberately conservative
(a flagged doc beats a stale one; `any-source` artifacts absorb every change).

This satisfies the brief's "doc-to-code mapping registry" requirement: it is
data, version-controlled, fail-closed on malformed edges, and unit-tested
(`tests/unit/docs-taxonomy.test.ts` pins 220 artifacts / 14 categories / zero
warnings).

---

## 5. Gap-closing extensions (this work)

### E1 — ASVS coverage gate in CI (closes gap G1, Critical)

Today `docs/reference/asvs-coverage.md` + `tests/fixtures/asvs-coverage-snapshot.json`
are generated by `gen-asvs-coverage.mjs --check`, but **no CI job runs it** and
the resync bot ignores it. Only the integration test checks
snapshot-vs-citedIds (not the MD byte-compare), so the doc can silently rot.

**Change:**

- `hygiene` job: add `pnpm run docs:asvs` (after `docs:sample`).
- `resync` job: regenerate `docs/reference/asvs-coverage.md` (and the snapshot)
  alongside `cli.md`/`sample-report.md`, include both in the dirty check +
  `git add` + commit.

Result: every generated USA doc now has a CI `--check` gate and an auto-resync
bot. Consistent with the existing generated-doc convention (byte-compare, not
diff heuristics).

### E2 — Pre-push hook (closes gap G2, High)

**Change:** add `.husky/pre-push`:

```sh
#!/usr/bin/env sh
. "$(dirname "$0")/h"
pnpm run build && pnpm run docs:all
```

Runs the full doc gate (build + all five `--check` gates) before push. A red
local push beats a red main. Hook is non-bypassing in spirit (CI remains the
backstop per the "no --no-verify culture" rule), but catches doc-only breakage
on the developer's machine.

### E3 — Correct AGENTS.md gate count (closes gap G3, Low)

`AGENTS.md` §6 and §7 say "four doc gates"; `docs:all` runs five (adds
`docs:asvs`). Two-word correction. (Catches itself: the claim scanner would flag
a bare "4" once it is no longer the count.)

### E4 — Doc classification gate (closes gap G4, Low)

The taxonomy maps artifact _types_. The brief additionally asks for a gate that
**fails the build if any doc file is unclassified** (not generated, not
fact-markered, not explicitly standalone-reviewed). This closes the root-`.md`
index-coverage gap (today only `docs/` is index-checked).

**Design:** a new `docs:manifest` gate (`scripts/check-manifest.mjs`) that
auto-classifies every tracked `*.md` by content and requires the remainder to
declare a dated review:

| Classification (auto-derived by scanning content)   | Requirement                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `generated` — contains `<!-- GENERATED by`          | none (byte-gated by its own `--check`)                                                |
| `fact-markered` — contains `usa:fact` / `usa:begin` | none (sync-gated)                                                                     |
| `immutable-history` — under `docs/adr/`             | none (ADR-hygiene gates it)                                                           |
| `meta` — `docs/writing-docs.md`                     | exempt (quotes the machinery)                                                         |
| `standalone` — none of the above                    | must appear in `docs/manifest.yaml` with a `reviewed: YYYY-MM-DD` date and a `reason` |

The checker fails (exit 1, actionable) if:

- any tracked doc is **unclassified** (falls through all rules above), or
- a `standalone` entry's `reviewed` date is older than 180 days (dated-review
  decay, mirroring ADR-0023's principle), or
- `docs/manifest.yaml` itself is malformed.

`docs:all` gains `docs:manifest`; CI `hygiene` gains it too. The manifest lists
only the ~handful of standalone prose docs — most are auto-classified, so
maintenance is the date bump on review.

---

## 6. Enforcement points (who requires what, and how)

| Enforcement point      | Runs                   | Blocks commit?        | Required CI check?                                           |
| ---------------------- | ---------------------- | --------------------- | ------------------------------------------------------------ |
| pre-commit autosync    | `.husky/pre-commit`    | yes (on fact drift)   | n/a                                                          |
| lint-staged            | `.husky/pre-commit`    | yes (format/types)    | n/a                                                          |
| **pre-push docs gate** | `.husky/pre-push` (E2) | yes (full `docs:all`) | n/a                                                          |
| CI `hygiene`           | `ci.yml`               | n/a                   | yes (adrs, check, cli, sample, **asvs (E1)**, manifest (E4)) |
| CI `resync`            | `ci.yml`               | n/a                   | yes (auto-fixes generated docs)                              |
| self-audit             | `self-audit.yml`       | n/a                   | yes (docs universe `--fail-on medium`)                       |
| scheduled link check   | `docs-link-check.yml`  | n/a                   | issue, not block                                             |
| scheduled prose review | `docs-review.yml`      | n/a                   | issue, not block                                             |

**Branch protection (human step):** `hygiene`, `resync`, `self-audit`,
`commits`, `changesets`, `test`, `lint`, `build`, `rules` must all be required
status checks on `master`. The resync bot has `contents: write` only on PR
branches (master is protected; master red = human looks).

---

## 7. No-bypass / no-stale-tolerance

- `commitlint` + `lint-staged` run in the hook; CI re-runs `docs:all` and the
  self-audit. `--no-verify` defeats the hook only — CI is the independent
  backstop (documented in `CONTRIBUTING.md`).
- Every generated doc carries a `<!-- GENERATED by … -->` marker; hand-editing
  between sync runs is always reverted to source on the next `--check`.
- ADRs are immutable; prose is dated; facts are marked. A stale doc is a
  **build failure with an actionable message** (file/section/repair command),
  never a green check.
