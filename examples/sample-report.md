# 🔍 Audit: `demo-app`

*A narrative audit — a verdict, not a checklist. Every claim below is derived from the same deterministic evidence as the machine record at the bottom.*

| | |
|---|---|
| **Path** | `/home/user/universal-software-auditor/examples/demo-app` |
| **Commit** | `n/a` (detached) |
| **Date** | 2026-01-01T00:00:00.000Z |
| **Stack** | javascript, express |
| **Platform** | server |
| **Maturity** | Prototype / Spike (detected `prototype`) |
| **Depth** | standard · automation coverage 73.8% |

## Verdict

**🔴 RED** — Not safe to connect to real data. Do not show a customer as “working”.

The raw score is **37.3/100**, but a number is not a verdict. A CRITICAL worst-case finding does not average away. Read the sections below; the score is reconciled honestly at the end.

## The foundation — the gate

*Every finding below is a symptom. This section is the disease. Foundation readiness: **0 of 6 pillars operational**.*

| Pillar | Checks passing | State |
|---|---:|---|
| Docs | 1/2 | 🟡 partial |
| Governance | 0/3 | 🔴 missing |
| AI readiness | 0/2 | 🔴 missing |
| Testing | 0/2 | 🔴 missing |
| Environment | 0/2 | 🔴 missing |
| Pipelines | 0/2 | 🔴 missing |
| Standards | — | not applicable / no checks loaded |

The causal chain, read top-to-bottom — each line produces the one below it:

```
unpinned environment → unreproducible build → no CI gate → no tests run
  → changes ship unverified → the critical findings below go undetected
```

The foundation rules (`FND-001`…`FND-014`) are deterministic checks; the intent they serve is recorded in `.usa/foundation.yaml` (see `usa foundation init`). A missing file here reads MISSING — absence of evidence, not evidence of safety.

## The fires — what will hurt you this week

These are not disconnected findings. They compose into one trust-boundary failure: unvalidated input reaches a sensitive sink, and the errors come straight back out. **2 confirmed CRITICAL**, 1 awaiting evidence.

### `SEC-001` — No hardcoded credentials in source

**🔴 CRITICAL** · confirmed · FAIL

- **Where:** `src/config.js:3`, `src/config.js:4`
- **Why it matters:** 2 occurrence(s): `api_key: 'example_key_not_real_12345',` at src/config.js:3 (+1 more).
- **Fix:** Move to environment variables backed by a secret manager; rotate anything that was ever committed.
- **Refs:** CWE-798 · ASVS-2.10.4 · OWASP-A02:2021

### `SEC-005` — SQL is not built by string concatenation

**🔴 CRITICAL** · confirmed · WRONG

- **Where:** `src/db.js:15`
- **Why it matters:** 1 instance(s) of an incorrect implementation: `'SELECT * FROM orders WHERE id = ' + orderId,` at src/db.js:15.
- **Fix:** Use parameterised queries ($1, ?, :name) or the ORM query API. Never interpolate user input into SQL text.
- **Refs:** CWE-89 · ASVS-5.3.4 · OWASP-A03:2021

### `REPO-003` — No secrets in git history

**🔴 CRITICAL** · ⚠️ unverified — in the judgement queue

- **Why it matters:** Shell check skipped (enable with --allow-commands).
- **Fix:** Rotate the exposed values and rewrite history with git-filter-repo. Rotation first: assume it is already public.
- **Refs:** CWE-798 · ASVS-14.3.2

## Severity honesty — what the profile downgraded

The `prototype` profile dampens severity. The distinction that matters: **maturity may defer process, never safety.** 32 safety findings were downgraded — apply the original severity.

**Safety findings downgraded (should not have been):**

- `SEC-003` No plaintext HTTP endpoints in configuration: **HIGH → MEDIUM** (security)
- `SEC-006` No unsafe dynamic code execution: **HIGH → MEDIUM** (security)
- `SEC-008` User input is validated at a trust boundary: **HIGH → MEDIUM** (security)
- `SEC-015` Authorization is enforced per request, not per route: **HIGH → MEDIUM** (security)
- `SUP-001` A lockfile is committed: **HIGH → MEDIUM** (supply-chain)
- `DATA-001` A migration system is in place: **HIGH → MEDIUM** (correctness)
- `DATA-007` Multi-step writes are transactional: **HIGH → MEDIUM** (correctness)
- `TEST-001` A test suite exists: **HIGH → MEDIUM** (correctness)
- `REL-005` Database migrations run forward and are reversible: **HIGH → MEDIUM** (correctness)
- `DEP-002` No known-HIGH/CRITICAL vulnerabilities in dependencies: **HIGH → MEDIUM** (supply-chain)
- `SEC-018` Security headers are set: **MEDIUM → LOW** (security)
- `SEC-020` Errors do not leak internals to clients: **MEDIUM → LOW** (security)
- `FND-008` A test directory exists: **MEDIUM → LOW** (correctness)
- `SUP-003` Dependency versions are pinned, not floating: **MEDIUM → LOW** (supply-chain)
- `SUP-004` Automated dependency updates are configured: **MEDIUM → LOW** (supply-chain)
- `CQ-006` There is a central error handler: **MEDIUM → LOW** (correctness)
- `DATA-002` Foreign keys / relations are defined: **MEDIUM → LOW** (correctness)
- `TAS-001` A unit-test layout exists: **MEDIUM → LOW** (correctness)
- `TAS-002` An integration-test layout exists: **MEDIUM → LOW** (correctness)
- `TAS-003` A system/end-to-end test layout exists: **MEDIUM → LOW** (correctness)
- `TAS-010` Tests assert failure paths: **MEDIUM → LOW** (correctness)
- `TEST-006` Integration tests cover the seams: **MEDIUM → LOW** (correctness)
- `TEST-008` Security-relevant behaviour is tested: **MEDIUM → LOW** (security)
- `REL-006` Migrations are separated from application deploys: **MEDIUM → LOW** (correctness)
- `API-004` Write operations are idempotent: **MEDIUM → LOW** (correctness)
- `NODE-003` Unhandled promise rejections are handled: **MEDIUM → LOW** (correctness)
- `NODE-006` Environment variables are validated at startup: **MEDIUM → LOW** (correctness)
- `FND-009` A coverage configuration exists: **LOW → FUTURE** (correctness)
- `TAS-004` Contract tests are present: **LOW → FUTURE** (correctness)
- `TAS-005` Coverage configuration or output is present: **LOW → FUTURE** (correctness)
- `TAS-006` A coverage threshold is pinned in the package.json-embedded jest config: **LOW → FUTURE** (correctness)
- `TAS-008` A determinism guard is set in test config or CI: **LOW → FUTURE** (correctness)

**Process findings deferred (legitimate for this maturity):**

- `REPO-005` LICENSE present: HIGH → LOW (compliance)
- `REPO-006` .env.example documents required configuration: HIGH → LOW (maintainability)
- `DATA-004` No N+1 query patterns: HIGH → LOW (performance)
- `DATA-005` List queries are paginated: HIGH → LOW (performance)
- `CICD-001` A CI pipeline exists: HIGH → LOW (operations)
- `CICD-010` Backups exist AND restores have been tested: HIGH → LOW (operations)
- `API-002` Request timeouts are configured: HIGH → LOW (performance)
- `REPO-013` .editorconfig present: LOW → FUTURE (style)
- `REPO-015` Commit history is meaningful: LOW → FUTURE (maintainability)
- `REPO-018` Agent instruction file present (AGENTS.md / CLAUDE.md): LOW → FUTURE (documentation)
- `FND-002` License, contribution, and security docs are present: MEDIUM → FUTURE (compliance)
- `FND-003` A CODEOWNERS file assigns review ownership: MEDIUM → FUTURE (compliance)
- …and 32 more

## The voids — what is missing

**45 required items are absent.** They collapse into a handful of underlying absences — each MISSING list below is one missing capability, not 45 separate problems.

- **No reproducible environment** — no pinned runtime, no lockfile, no `.env.example`.
- **No verification loop** — no test suite, no CI, no coverage config.
- **No governance floor** — no CODEOWNERS, no ADRs, no branch-protection evidence.
- **No delivery provenance** — no SBOM, no signing, no dependency-vulnerability scan.

The detailed machine list lives in the record below; these are the stories, not the rule IDs.

## The score, honestly

Raw overall **37.3/100** sits against the Prototype / Spike band 30–65 — but the band is not the point. A band that normalises a CRITICAL is doing the score's emotional work, and this report declines it.

| Section | Reported | Confidence | Honest reading |
|---|---:|---:|---|
| S1 · Repository & Project Structure | 7.2/10 | 83.3% | directionally sound |
| S2 · Security | 4.9/10 | 92.9% | trustworthy |
| S3 · Supply Chain & Build Provenance | 0.7/10 | 100% | trustworthy |
| S4 · Architecture & Design | 8/10 | 60% | directionally sound |
| S5 · Code Quality | 3.5/10 | 87.5% | directionally sound |
| S6 · Data & Database | 1.3/10 | 66.7% | directionally sound |
| S7 · Testing & Quality Assurance | 0/10 | 85.7% | directionally sound |
| S8 · CI/CD, Infrastructure & Observability | 3.3/10 | 66.7% | directionally sound |
| S9 · Release & Change Management | — | — | **NOT ASSESSED** — nothing was verified |
| S10 · Dependencies & Third-Party | ~~10/10~~ | 25% | **INSUFFICIENT EVIDENCE** — treat as unknown |
| S12 · Documentation & Knowledge | ~~10/10~~ | 25% | **INSUFFICIENT EVIDENCE** — treat as unknown |
| S15 · Platform-Specific | 5.1/10 | 50% | use with caution |
| S16 · Future Readiness | — | — | **NOT ASSESSED** — nothing was verified |

**2 section(s)** print a score on confidence below 40% in the checklist renderer. Here they read **INSUFFICIENT EVIDENCE** — a 10/10 at 25% confidence is 2.5 of an unknown possible 10, not a perfect score.

### Today — stop the bleeding

*Close CRITICAL and security-HIGH before anything else.*

- 🟠 `SEC-003` No plaintext HTTP endpoints in configuration HIGH→MEDIUM → Move every non-localhost URL to https://. Terminate TLS at the edge and keep it on internally too.
- 🟠 `SEC-006` No unsafe dynamic code execution HIGH→MEDIUM → Replace with explicit parsing, a lookup table, or a sandboxed expression evaluator with a capability allowlist.
- 🟠 `SEC-008` User input is validated at a trust boundary HIGH→MEDIUM → Define schemas at the edge (HTTP handler, queue consumer, CLI arg parser) and parse before use.
- 🔴 `SEC-001` No hardcoded credentials in source → Move to environment variables backed by a secret manager; rotate anything that was ever committed.
- 🔴 `SEC-005` SQL is not built by string concatenation → Use parameterised queries ($1, ?, :name) or the ORM query API. Never interpolate user input into SQL text.

### This week — make it reproducible

*Foundation + the remaining declared-HIGH findings (some are shown as MEDIUM below after downgrade).*

- 🟠 `REPO-005` LICENSE present HIGH→LOW → Add MIT / Apache-2.0 / GPL-3.0 as appropriate. Choose at choosealicense.com.
- 🟠 `REPO-006` .env.example documents required configuration HIGH→LOW → Add .env.example listing every variable the app reads, with safe placeholder values and a comment per var.
- 🟠 `DATA-005` List queries are paginated HIGH→LOW → Enforce a default and maximum page size on every list endpoint; prefer cursor pagination.
- 🟠 `CICD-001` A CI pipeline exists HIGH→LOW → Add a minimal pipeline first: install → lint → test → build. Expand from there.
- 🟠 `SUP-001` A lockfile is committed HIGH→MEDIUM → Commit the lockfile for your package manager and install with the frozen/immutable flag in CI.
- 🟠 `DATA-001` A migration system is in place HIGH→MEDIUM → Adopt the migration tool for your ORM; never alter production schema manually.
- 🟠 `DATA-007` Multi-step writes are transactional HIGH→MEDIUM → Wrap related writes in a transaction; make the operation idempotent so retries are safe.
- 🟠 `TEST-001` A test suite exists HIGH→MEDIUM → Start with the happy path of the main flow and every bug you have already fixed once.

### This month — the safety net

*Declared-MEDIUM findings: migrations, transactions, validation, reliability.*

- 🟡 `FND-002` License, contribution, and security docs are present MEDIUM→FUTURE → Commit a LICENSE plus at least one of CONTRIBUTING, SECURITY, or CODE_OF_CONDUCT.
- 🟡 `FND-003` A CODEOWNERS file assigns review ownership MEDIUM→FUTURE → Add a CODEOWNERS file mapping critical paths to the teams that must review them.
- 🟡 `FND-004` Branch-protection evidence lives in .github MEDIUM→FUTURE → Check in branch-protection evidence (e.g. a settings or policy file under .github) requiring reviews and status checks.
- 🟡 `FND-006` Agent instructions (AGENTS.md or llms.txt) exist MEDIUM→FUTURE → Add an AGENTS.md (or llms.txt) with build, test, and contribution instructions for agents.
- 🟡 `FND-010` The runtime version is pinned MEDIUM→FUTURE → Pin the runtime with .nvmrc, .tool-versions, .python-version, or the ecosystem equivalent.
- 🟡 `FND-011` The environment is reproducible from checked-in files MEDIUM→FUTURE → Commit a .env.example and a Dockerfile (or compose/devcontainer definition) so setup is declarative.
- 🟡 `FND-012` A CI workflow exists MEDIUM→FUTURE → Add a CI workflow that runs build, tests, and lint on every pull request.
- 🟡 `CQ-001` A linter is configured MEDIUM→FUTURE → Add the standard linter for your stack, start with its recommended config, fix what it finds.
- 🟡 `NODE-001` Node runtime version is pinned MEDIUM→FUTURE → Add .nvmrc plus "engines": { "node": ">=20" } and node-version-file: .nvmrc in CI.
- 🟡 `NODE-005` No deprecated Node APIs in use MEDIUM→FUTURE → Buffer.from/alloc, new URL(), crypto.createCipheriv, punycode/. Replace as you touch the file.
- 🟡 `SEC-018` Security headers are set MEDIUM→LOW → Use helmet (Node) or equivalent; add HSTS (max-age ≥31536000; includeSubDomains), X-Content-Type-Options: nosniff, Referrer-Policy, and a CSP.
- 🟡 `SEC-020` Errors do not leak internals to clients MEDIUM→LOW → Return a generic error plus a correlation ID; log the detail server-side only.
- 🟡 `FND-008` A test directory exists MEDIUM→LOW → Create a tests (or test/__tests__/spec) directory and put the first happy-path test there.
- 🟡 `SUP-003` Dependency versions are pinned, not floating MEDIUM→LOW → Pin exact versions for applications. Ranges are acceptable for published libraries with a lockfile.
- 🟡 `SUP-004` Automated dependency updates are configured MEDIUM→LOW → Enable Dependabot or Renovate with grouped PRs and a weekly schedule.
- …and 8 more

### Deferred — after the floor exists

*Declared-LOW and FUTURE. Explicitly not now; re-read after the next audit.*

- 🟢 `REPO-013` .editorconfig present LOW→FUTURE → Add a 6-line .editorconfig (charset, EOL, indent style/size, trailing whitespace, final newline).
- 🟢 `REPO-018` Agent instruction file present (AGENTS.md / CLAUDE.md) LOW→FUTURE → Add AGENTS.md: setup, build/test/lint commands, conventions, and explicit no-go areas.
- 🟢 `FND-005` Architecture decisions are recorded as ADRs LOW→FUTURE → Record significant decisions as ADRs under docs/adr.
- 🟢 `FND-007` Docs carry machine-readable markers LOW→FUTURE → Reference AGENTS.md/llms.txt from the README and tag machine-actionable facts with usa: markers.
- 🟢 `FND-009` A coverage configuration exists LOW→FUTURE → Add a coverage config (e.g. codecov.yml or coverage settings in your test runner config).
- 🟢 `FND-013` A local task runner captures common workflows LOW→FUTURE → Add a Makefile or justfile with setup, test, and lint targets.
- 🟢 `ARCH-010` Async work is offloaded to a queue LOW→FUTURE → Move email, image processing, webhooks, and report generation onto a queue with retries and a DLQ.
- 🟢 `CQ-002` A formatter is configured LOW→FUTURE → Prettier/Black/gofmt/rustfmt — pick the default config and stop discussing it.
- 🟢 `CQ-008` Requests carry a correlation/trace ID LOW→FUTURE → Generate an ID per request, put it in every log line and in the response header.
- 🟢 `CQ-009` Debug statements are not left in production paths LOW→FUTURE → Use the project logger, or delete the line. Add a lint rule to keep it out.
- 🟢 `CQ-010` TODO/FIXME debt is tracked, not just annotated LOW→FUTURE → Convert each one to a tracked issue with a link in the comment, or delete it if it no longer applies.
- 🟢 `DATA-008` No SELECT * in hot paths LOW→FUTURE → Select the columns you use.
- 🟢 `TAS-004` Contract tests are present LOW→FUTURE → Record consumer-driven contracts (e.g. Pact) or add a tests/contracts suite asserting request/response shapes.
- 🟢 `TAS-005` Coverage configuration or output is present LOW→FUTURE → Turn on coverage reporting in the test runner and publish the number on every PR.
- 🟢 `TAS-006` A coverage threshold is pinned in the package.json-embedded jest config LOW→FUTURE → Set jest.coverageThreshold in package.json, or keep the threshold wherever the runner reads it and accept this marker as not-applicable.
- …and 4 more

## What this audit did not check

A fixed, honest account of the method's limits — not a claim about the project:

- **Reachability / taint analysis** — pattern matching is not semantic analysis; a dead-vs-live line is not distinguished.
- **Threat model / data-flow / authz matrix** — requires design-level reasoning, not file presence.
- **Secrets validity + full-history scan** — the engine greps HEAD patterns; gitleaks/trufflehog verify and scan history.
- **Dependency vulnerability scan (SBOM / CVE)** — `osv-scanner`/`npm audit`/`syft` are deferred to the oracle/command layer.
- **Rate limiting, CSRF, auth existence, prototype pollution** — no rules cover them today — they are rule-set gaps, not clean verdicts.
- **Runtime / observability reality** — the audit reads files, not a running process.
- **Benchmark against comparable repos** — a score without a reference class is a number, not a finding.

## Machine record (reproducible appendix)

The deterministic substrate this narrative was derived from. `usa diff` reads it.

<!-- USA:TRAILER:BEGIN -->
```yaml
schema: usa-report-v1
generated_at: 2026-01-01T00:00:00.000Z
usa_version: 2.6.0
overall: 37.3
sections:
  S1: {score: 7.2, open: 4, review: 2}
  S2: {score: 4.9, open: 7, review: 1}
  S3: {score: 0.7, open: 15, review: 0}
  S4: {score: 8, open: 1, review: 2}
  S5: {score: 3.5, open: 6, review: 1}
  S6: {score: 1.3, open: 5, review: 3}
  S7: {score: 0, open: 12, review: 2}
  S8: {score: 3.3, open: 1, review: 1}
  S9: {score: null, open: 0, review: 2}
  S10: {score: 10, open: 0, review: 3}
  S12: {score: 10, open: 0, review: 3}
  S15: {score: 5.1, open: 4, review: 5}
  S16: {score: null, open: 0, review: 2}
severity_totals:
  CRITICAL: 2
  HIGH: 0
  MEDIUM: 7
  LOW: 17
  FUTURE: 29
rules:
  "REPO-001": {status: PASS, severity: CRITICAL, section: S1}
  "REPO-002": {status: PASS, severity: CRITICAL, section: S1}
  "REPO-003": {status: UNKNOWN, severity: CRITICAL, section: S1}
  "SEC-001": {status: FAIL, severity: CRITICAL, section: S2}
  "SEC-005": {status: WRONG, severity: CRITICAL, section: S2}
  "SEC-007": {status: PASS, severity: CRITICAL, section: S2}
  "NODE-004": {status: PASS, severity: CRITICAL, section: S15}
  "REPO-004": {status: PASS, severity: HIGH, section: S1}
  "REPO-007": {status: PASS, severity: HIGH, section: S1}
  "SEC-002": {status: PASS, severity: HIGH, section: S2}
  "SEC-004": {status: PASS, severity: HIGH, section: S2}
  "SEC-010": {status: PASS, severity: HIGH, section: S2}
  "SEC-017": {status: PASS, severity: HIGH, section: S2}
  "CQ-005": {status: PASS, severity: HIGH, section: S5}
  "REPO-008": {status: PASS, severity: MEDIUM, section: S1}
  "REPO-017": {status: PASS, severity: MEDIUM, section: S1}
  "SEC-003": {status: FAIL, severity: MEDIUM, section: S2}
  "SEC-006": {status: WRONG, severity: MEDIUM, section: S2}
  "SEC-008": {status: MISSING, severity: MEDIUM, section: S2}
  "SEC-015": {status: UNKNOWN, severity: MEDIUM, section: S2}
  "SEC-021": {status: PASS, severity: MEDIUM, section: S2}
  "FND-001": {status: PASS, severity: MEDIUM, section: S3}
  "SUP-001": {status: MISSING, severity: MEDIUM, section: S3}
  "ARCH-003": {status: PASS, severity: MEDIUM, section: S4}
  "ARCH-007": {status: PASS, severity: MEDIUM, section: S4}
  "DATA-001": {status: MISSING, severity: MEDIUM, section: S6}
  "DATA-006": {status: PASS, severity: MEDIUM, section: S6}
  "DATA-007": {status: MISSING, severity: MEDIUM, section: S6}
  "TEST-001": {status: MISSING, severity: MEDIUM, section: S7}
  "CICD-007": {status: PASS, severity: MEDIUM, section: S8}
  "REL-005": {status: UNKNOWN, severity: MEDIUM, section: S9}
  "DEP-001": {status: PASS, severity: MEDIUM, section: S10}
  "DEP-002": {status: UNKNOWN, severity: MEDIUM, section: S10}
  "REPO-005": {status: MISSING, severity: LOW, section: S1}
  "REPO-006": {status: MISSING, severity: LOW, section: S1}
  "SEC-018": {status: MISSING, severity: LOW, section: S2}
  "SEC-020": {status: WRONG, severity: LOW, section: S2}
  "FND-008": {status: MISSING, severity: LOW, section: S3}
  "SUP-003": {status: FAIL, severity: LOW, section: S3}
  "SUP-004": {status: MISSING, severity: LOW, section: S3}
  "CQ-006": {status: MISSING, severity: LOW, section: S5}
  "DATA-002": {status: MISSING, severity: LOW, section: S6}
  "DATA-004": {status: UNKNOWN, severity: LOW, section: S6}
  "DATA-005": {status: MISSING, severity: LOW, section: S6}
  "TAS-001": {status: MISSING, severity: LOW, section: S7}
  "TAS-002": {status: MISSING, severity: LOW, section: S7}
  "TAS-003": {status: MISSING, severity: LOW, section: S7}
  "TAS-010": {status: MISSING, severity: LOW, section: S7}
  "TEST-006": {status: UNKNOWN, severity: LOW, section: S7}
  "TEST-008": {status: UNKNOWN, severity: LOW, section: S7}
  "CICD-001": {status: MISSING, severity: LOW, section: S8}
  "CICD-010": {status: UNKNOWN, severity: LOW, section: S8}
  "REL-006": {status: UNKNOWN, severity: LOW, section: S9}
  "DOC-005": {status: PASS, severity: LOW, section: S12}
  "API-002": {status: UNKNOWN, severity: LOW, section: S15}
  "API-004": {status: UNKNOWN, severity: LOW, section: S15}
  "NODE-003": {status: MISSING, severity: LOW, section: S15}
  "NODE-006": {status: MISSING, severity: LOW, section: S15}
  "REPO-013": {status: MISSING, severity: FUTURE, section: S1}
  "REPO-015": {status: UNKNOWN, severity: FUTURE, section: S1}
  "REPO-018": {status: MISSING, severity: FUTURE, section: S1}
  "FND-002": {status: MISSING, severity: FUTURE, section: S3}
  "FND-003": {status: MISSING, severity: FUTURE, section: S3}
  "FND-004": {status: MISSING, severity: FUTURE, section: S3}
  "FND-005": {status: MISSING, severity: FUTURE, section: S3}
  "FND-006": {status: MISSING, severity: FUTURE, section: S3}
  "FND-007": {status: MISSING, severity: FUTURE, section: S3}
  "FND-009": {status: MISSING, severity: FUTURE, section: S3}
  "FND-010": {status: MISSING, severity: FUTURE, section: S3}
  "FND-011": {status: MISSING, severity: FUTURE, section: S3}
  "FND-012": {status: MISSING, severity: FUTURE, section: S3}
  "FND-013": {status: MISSING, severity: FUTURE, section: S3}
  "ARCH-004": {status: UNKNOWN, severity: FUTURE, section: S4}
  "ARCH-008": {status: UNKNOWN, severity: FUTURE, section: S4}
  "ARCH-010": {status: MISSING, severity: FUTURE, section: S4}
  "CQ-001": {status: MISSING, severity: FUTURE, section: S5}
  "CQ-002": {status: MISSING, severity: FUTURE, section: S5}
  "CQ-007": {status: UNKNOWN, severity: FUTURE, section: S5}
  "CQ-008": {status: MISSING, severity: FUTURE, section: S5}
  "CQ-009": {status: FAIL, severity: FUTURE, section: S5}
  "CQ-010": {status: WRONG, severity: FUTURE, section: S5}
  "DATA-003": {status: UNKNOWN, severity: FUTURE, section: S6}
  "DATA-008": {status: WRONG, severity: FUTURE, section: S6}
  "DATA-009": {status: UNKNOWN, severity: FUTURE, section: S6}
  "TAS-004": {status: MISSING, severity: FUTURE, section: S7}
  "TAS-005": {status: MISSING, severity: FUTURE, section: S7}
  "TAS-006": {status: MISSING, severity: FUTURE, section: S7}
  "TAS-007": {status: MISSING, severity: FUTURE, section: S7}
  "TAS-008": {status: MISSING, severity: FUTURE, section: S7}
  "TAS-009": {status: MISSING, severity: FUTURE, section: S7}
  "TAS-011": {status: MISSING, severity: FUTURE, section: S7}
  "DEP-004": {status: UNKNOWN, severity: FUTURE, section: S10}
  "DEP-006": {status: UNKNOWN, severity: FUTURE, section: S10}
  "DOC-001": {status: UNKNOWN, severity: FUTURE, section: S12}
  "DOC-002": {status: UNKNOWN, severity: FUTURE, section: S12}
  "DOC-004": {status: UNKNOWN, severity: FUTURE, section: S12}
  "API-003": {status: UNKNOWN, severity: FUTURE, section: S15}
  "API-005": {status: UNKNOWN, severity: FUTURE, section: S15}
  "API-008": {status: UNKNOWN, severity: FUTURE, section: S15}
  "NODE-001": {status: MISSING, severity: FUTURE, section: S15}
  "NODE-005": {status: DEPRECATED, severity: FUTURE, section: S15}
  "FUT-002": {status: UNKNOWN, severity: FUTURE, section: S16}
  "FUT-003": {status: UNKNOWN, severity: FUTURE, section: S16}
```
<!-- USA:TRAILER:END -->
