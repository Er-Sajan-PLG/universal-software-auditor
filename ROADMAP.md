# USA Roadmap

Short, dated, explicitly non-committal. Rule-coverage direction first (this
is an audit template — the packs _are_ the product), automation second.
Items graduate to ADRs when decided and to `CHANGELOG.md` when shipped.

> Charter constraint (ADR-0011): no CVE database, no resolver, no dataflow
> engine, no signer. Proposals crossing that line re-open ADR-0011 first.

## Shipped

Rule coverage (the product):

- [x] **`usa bootstrap` self-extension** — curated starter packs for
      uncovered stacks (php/ruby/cpp/csharp/swift + fallback), fail-closed
      per ADR-0012, proven on Vapor.
- [x] **Honest scale limits** — truncation/oversize warnings instead of
      silent absorption.
- [x] **First graduation** — Swift pack + vapor/platform/executable
      detectors shipped from the bootstrap proof; catalog entry replaced.
      _(the standing rule: every bigger repo expands the template)_
- [x] **SARIF + JSON renderers** — `--format md|json|sarif`, `--out`
      extension inference; SARIF 2.1.0 schema-validated. ADR-0018 supersedes
      ADR-0004.
- [x] **Per-rule expected-finding fixtures** — positive/negative fixture per
      automatable rule, coverage gate blocks untested rules. ADR-0017.
- [x] **Oracle-ingestion check kind** — `oracle` ingests a committed
      SARIF/JSON artifact and asserts a bound; offline-by-default preserved.
      ADR-0019.

Automation and governance:

- [x] **Complexity budget** — warn-only `complexity` rule + dispatch-table
      refactors; lint is warning-free.
- [x] **Self-audit correctness hardening** — 27-finding adversarial review
      (fail-closed inputs, expiry-aware suppressions, fixed-point detection,
      trailer hygiene).
- [x] **release-please + commitlint** — reviewable Release PRs (version +
      CHANGELOG + tag atomically); human gate kept on rule-content releases.
- [x] **Trusted publishing + npm provenance + SBOM** — OIDC (no long-lived
      `NPM_TOKEN`), `--provenance`, CycloneDX SBOM artifact on every release.
- [x] **Generated CLI reference + diff gate** — `docs/reference/cli.md`
      regenerated from the real parser and asserted with `--check` in CI.
- [x] **Coverage thresholds** — ratcheted at the measured number.
- [x] **OpenSSF Scorecard action** — monthly + on push, SARIF to the
      Security tab.

## Next: rule coverage

- [x] **Catalogue pinning + automatability tags** — `rules/catalogues.yaml`
      pins every standard's version; catalogue is derived from each rule's
      `references:` and automatability from its check kind (explicit override
      allowed, `full` refused on non-deterministic kinds). `usa standards`
      reports coverage; the table is machine-synced into
      `docs/standards-mapping.md`. ADR-0021. _(S)_
- [x] **Provenance verification checks (verify, don't mint)** — `cosign
verify` chain at production (`core/provenance-cosign`, SUP-018–020),
      attestation/VSA existence at beta and up
      (`core/provenance-attestation`, SUP-022–024); verification only per
      ADR-0011. ADR-0027. _(L)_
- [x] **Site-level suppressions** — a waiver may carry a `file` glob (and
      optional `line`); only matching locations are excused, unmatched ones
      stay active, and a waiver that matched nothing is reported. ADR-0022. _(M)_
- [x] **Hotspot triage + review staleness** — the judgement queue is split by
      automatability (`assist` = the tool settles it once allowed, `manual` =
      reasoning required), and `.usa.yaml` `reviews:` record dated human
      attention with an optional `until` deadline that surfaces as stale. ADR-0023. _(M)_
- [x] **New-code quality gates** — `usa audit --baseline` fails only on
      newly-introduced ≥ HIGH plus regressed rules, sharing the `usa diff`
      movement taxonomy so text and verdict agree. ADR-0024. _(M)_
- [x] **Foundation readiness** — `usa foundation init` interviews vision,
      intents, and per-pillar promises into `.usa/foundation.yaml`; intents
      become audit facts, the `core/foundation` pack (FND-001–014) checks the
      setup deterministically, and the report grades per pillar. The LLM stays
      outside the spine: agents interview and judge, the engine verifies.
      ADR-0029. _(L)_

## Next: automation and governance

- [x] **OpenSSF Best Practices badge** — honest in-progress badge + status
      section (Scorecard action and branch protection already in place;
      registration at bestpractices.dev is the remaining step). _(S)_
- [x] **Signed reports, verify side (Sigstore)** — detached-signature
      verification via local cosign (`src/report/signature.ts`) plus a
      `usa verify-report` CLI command; minting stays blocked pending an
      ADR-0011 amendment. ADR-0025, ADR-0028. _(M)_
- [x] **Generated docs resync** — the `resync` CI job regenerates and pushes
      `cli.md`/`sample-report.md` on PRs instead of merely failing. ADR-0026.
- [ ] **MADR/log4brains** — only when the ADR corpus triples or decisions
      become routinely contested. Not now.

## Deliberately not planned

- CVE database / lockfile resolver / reachability analysis (ADR-0011)
- Interprocedural analysis, DAST, fuzzing (see "What USA is not")
- Compliance certification (USA maps to standards; auditors certify)
- Full DORA platform (no deployment to measure at this scale)
- Renovate migration (no problem to solve at ~10 dependencies)
- HTML / JUnit renderers (JSON and SARIF feed standards-based consumers;
  HTML/JUnit would only feed bespoke ones — ADR-0018)
