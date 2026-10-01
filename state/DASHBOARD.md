# DASHBOARD.md — Executive Summary

**Last Reconciled:** 2026-10-01T17:10:00+05:45
**Reconciled by:** HERMES (HX01) — post-shutdown reconciliation
**Repo:** Universal_Software_Auditor
**Remote:** git@github.com:Er-Sajan-PLG/universal-software-auditor.git

---

## What Is This Project

USA (Universal Software Auditor) is a TypeScript CLI (`usa`) that audits any
project and writes a graded Markdown report. It ships as npm `@xenos1996/usa`
plus a GitHub composite action. The defining habit: **the tool audits itself**.

- **Version:** 2.26.0
- **License:** MIT
- **Language:** TypeScript 5.7 (Node 20+, ESM, strict)
- **Package manager:** pnpm 10.34.5 (pnpm-workspace.yaml)
- **Tests:** vitest 5 (unit/integration/e2e split)
- **Releases:** changesets (author declares bump)
- **CI:** GitHub Actions (11 workflows, 1232 lines total)

---

## Current Branch State

| Branch                                     | Status                   | Ahead/Behind master |
| ------------------------------------------ | ------------------------ | ------------------- |
| `docs/0042-continuous-ingestion` (CURRENT) | 5 ahead of origin, clean | +3 ahead of master  |
| `master`                                   | at origin                | 0                   |
| `chore/autonomous-docs-system`             | behind 2                 | -2                  |
| `feat/asvs-coverage-map`                   | behind 2                 | -2                  |
| `feat/auditor-mutation-probes`             | behind 2                 | -2                  |
| `feat/evil-family`                         | behind 2                 | -2                  |
| `feat/invariant-checks`                    | at origin                | 0                   |
| `fix/asvs-check-prettier`                  | behind 3                 | -3                  |
| `fix/changeset-gate-release-pr`            | behind 3                 | -3                  |
| `fix/npmrc-scope-publish`                  | at origin                | 0                   |
| `fix/reviews-hardening-batch`              | at origin                | 0                   |
| `backup/reviews-hardening-pre-rebase`      | —                        | —                   |

**10 unmerged branches** (excluding master and current). Most are 2-3 commits
behind master — likely stale feature branches that need rebase or closure.

---

## Active Agents

| Agent         | Model                            | Branch                         | Task                  | Started    | Status    |
| ------------- | -------------------------------- | ------------------------------ | --------------------- | ---------- | --------- |
| HERMES (HX01) | meituan/longcat-2.5-preview:free | docs/0042-continuous-ingestion | Bootstrap MACP state/ | 2026-10-01 | COMPLETED |

See `state/REGISTRY.md` for details.

---

## Critical Alerts

- **None.** Working tree is clean, no merge conflicts, no stashes.

---

## Recently Completed (last 10 commits)

1. `e9e14e9` docs(adr): resolve 0042 ADR collision with master (renumber to 0043)
2. `78cfdb2` docs: attach SLSA provenance bundle for v2.26.0 (#173)
3. `3d3c2e0` docs: autonomous documentation governance (ASVS + manifest gates, pre-push hook) (#172)
4. `b58eaa6` chore(master): release (#171)
5. `bdb49cd` feat(docs): documentation universe audit — 14 categories, 220 artifacts (ADR-0042) (#170)
6. `16db103` feat(watch): add timer-friendly ingest-audit-evolve driver script
7. `78c3dc0` docs(adr): record continuous ingestion loop with human-gated promotion
8. `509bfef` fix(ci): keep top-level permissions read-only in every workflow (#167)
9. `4d9f029` docs: attach SLSA provenance bundle for v2.25.3 (#166)
10. `9781409` docs(agents): prove the diagnosis before writing the fix (#165)

---

## Pending Changeset

`.changeset/autonomous-docs-hardening.md` — unreleased changeset waiting for next release.

---

## Key Files Map

| Area         | Path                                                                       |
| ------------ | -------------------------------------------------------------------------- |
| CLI entry    | `src/cli.ts`                                                               |
| Engine       | `src/engine/` (audit, evaluate, score, maturity, diff, loader)             |
| Rules (data) | `rules/` (core/, stacks/, catalogues/, detectors.yaml, docs-taxonomy.yaml) |
| Reports      | `src/report/` (markdown, json, sarif, html, narrative, signature)          |
| Live/Agent   | `src/live/`, `src/agent/`                                                  |
| Evolution    | `src/evolution/`                                                           |
| Foundation   | `src/foundation/`                                                          |
| Serve        | `src/serve/`                                                               |
| Docs         | `docs/` (28 files), `docs/adr/` (43 ADRs + README)                         |
| Scripts      | `scripts/` (13 .mjs files)                                                 |
| Tests        | `tests/` (unit/, integration/, e2e/, contracts/)                           |
| CI           | `.github/workflows/` (11 workflows)                                        |
| Config       | `.usa.yaml`, `package.json`, `tsconfig.json`, `vitest.config.ts`           |
| Provenance   | `provenance/` (v2.9.0 through v2.26.0)                                     |

---

## MACP Protocol Summary

Every agent working in this repo MUST:

1. **Start clean** — `git status`, `git branch -vva`, `git log --oneline -10`, `git stash list`
2. **Read state/** — DASHBOARD.md first, then REGISTRY.md, BLOCKERS.md, INDEX.md
3. **Register** — create `state/sessions/YYYYMMDD-HHMM-<AGENT-ID>-<slug>.md`
4. **Plan** — create `state/plans/agent-<ID>-<slug>.md`
5. **Work** — log progress in real-time in session file
6. **End clean** — commit or stash all work, update DASHBOARD.md, update REGISTRY.md

Full protocol in AGENTS.md.

---

## Documentation System Status

The repo has a sophisticated documentation governance system (ADR-0020 + ADR-0042):

- 43 ADRs, 83 tracked markdown files
- 6 doc gates: adrs, check, cli, sample, asvs, manifest
- Fact-marker engine, claim scanner, byte-compare gates
- Pre-commit: autosync + lint-staged
- Pre-push: build + docs:all
- CI hygiene: all 6 gates
- Self-audit: `usa audit . --fail-on critical` + `usa docs audit . --fail-on medium`

**Open gap:** G3 — AGENTS.md says "four doc gates" but there are now six. Blocked on owner consent (protected file).

---

## Release Machinery

- **Two workflows:** `release.yml` (version + npmjs publish) → `publish.yml` (GPR mirror + SBOM + attestation + provenance PR)
- **Tags:** `@xenos1996/usa@X.Y.Z` (scoped, not `v*`)
- **Registries:** npmjs (OIDC trusted publishing) + GitHub Packages (classic PAT)
- **Provenance:** Sigstore bundles for every release v2.9.0 through v2.26.0
- **Changeset token:** `CHANGESET_TOKEN` (fine-grained PAT, not GITHUB_TOKEN)
