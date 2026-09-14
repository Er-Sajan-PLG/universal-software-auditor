# 🔍 Audit: `demo-app`

> **A customer-facing narrative sample.** Hand-authored from the deterministic
> evidence of the raw companion (`sample-report.md`), inspired by seven rounds
> of review. It is **not** engine output and **not** byte-checked against any
> generator — the raw companion carries the machine record. Read this for the
> story; read that for the checklist.

**Date:** 2026-01-01 · **Auditor:** USA 2.7.0 · **Depth:** standard
**Maturity:** Prototype / Spike · **Commit:** detached (no history available)

## Verdict

**🔴 Red — do not expose to untrusted input or real data.**

**One-line story:** a small Express/MySQL spike with a README and a health
check, but it hardcodes secrets, concatenates SQL, evaluates expressions at
runtime, and has no tests, no lockfile, no CI, and no foundation files. It is
a learning artifact, not a deployable system.

> **How to read this.** Foundation first. Security second. Reproducibility
> third. Testability fourth. Then operability, supply chain, architecture,
> future readiness. **"Unknown" is not "pass." "Not detected" is not "not
> applicable."** Critical means stop. High means this sprint. Medium means
> this month. Low and future mean backlog.

## 0. Foundation — the gate

_Everything below is conditional on this. A project without a floor cannot be
judged on its furniture._

| Area               | State      | Why it matters                                        | Next action                                       |
| ------------------ | ---------- | ----------------------------------------------------- | ------------------------------------------------- |
| README             | ✅ Present | Someone can learn what this is.                       | Keep current. Add install/run/contribute.         |
| `.gitignore`       | ✅ Present | Basic hygiene.                                        | Keep.                                             |
| LICENSE            | 🚫 Missing | No legal default. Nobody can safely reuse it.         | Add MIT/Apache-2.0/GPL-3.0.                       |
| `.env.example`     | 🚫 Missing | Nobody knows what env vars are required.              | List every variable with safe placeholders.       |
| Runtime pin        | 🚫 Missing | "Works on my machine" forever.                        | Add `.nvmrc` and `"engines": { "node": ">=20" }`. |
| Lockfile           | 🚫 Missing | Builds are not reproducible. `"express": "*"` floats. | Run `npm install`, commit the lockfile.           |
| CI                 | 🚫 Missing | Nothing verifies a change.                            | Add install → lint → test → build.                |
| Task runner        | 🚫 Missing | Commands live in people's heads.                      | Add `Makefile` or `justfile`.                     |
| Agent instructions | 🚫 Missing | Agents and new devs guess.                            | Add `AGENTS.md` with commands and no-go areas.    |
| CODEOWNERS / ADRs  | 🚫 Missing | No review ownership, no decision memory.              | Defer until the floor exists.                     |

**Foundation readiness: 1 of 6 pillars operational.** The causal chain reads
top-to-bottom — each line produces the one below it:

```text
unpinned environment → unreproducible build → no CI gate → no tests run
  → changes ship unverified → the critical findings below go undetected
```

## 1. Security — stop the bleeding

These are not disconnected findings. They compose into one trust-boundary
failure: unvalidated input reaches a sensitive sink, and the errors come
straight back out.

### 🔴 Critical — fix before any deploy

**Hardcoded credentials in source** (`SEC-001`)

- **Where:** `src/config.js:3`, `src/config.js:4`
- **Evidence:** `api_key: 'example_key_not_real_12345'` (+1 more instance).
- **Why it matters:** If this was ever real, it is burned. If it is fake, it
  teaches the wrong pattern. Either way, secrets belong in a secret manager.
- **Fix:** Move to environment variables. Rotate anything ever committed.
  Scan history with `gitleaks detect --log-opts=--all`.
- **Refs:** CWE-798 · ASVS-2.10.4

**SQL built by string concatenation** (`SEC-005`)

- **Where:** `src/db.js:15`
- **Evidence:** `'SELECT * FROM orders WHERE id = ' + orderId`.
- **Why it matters:** Classic SQL injection — an attacker can read or destroy
  the database. Trust-boundary failure, not a style issue.
- **Fix:** Parameterised queries. Never interpolate user input into SQL text.
- **Refs:** CWE-89 · ASVS-5.3.4

### 🟠 High — this sprint

**Unsafe dynamic code execution** (`SEC-006`) — `return eval(expr);` at
`src/express.js:7`. On untrusted input this is remote code execution. Replace
with explicit parsing or a lookup table. Refs: CWE-95.

**No input validation at trust boundary** (`SEC-008`) — nothing validates
`orderId` before it reaches the query above. Define schemas at the edge
(`zod`/`joi`) and parse before use. Refs: CWE-20.

**Errors leak internals** (`SEC-020`) — `res.status(500).json({ error:
err.message })` at `src/server.js:14` hands stack traces to callers probing
the injection above. Return a generic error plus a correlation ID; log detail
server-side only. Refs: CWE-209.

**Plaintext HTTP endpoints** (`SEC-003`) — `src/config.js:5`,
`src/legacy.js:5`. Move every non-localhost URL to `https://`. Refs: CWE-319.

**Authorization per request unknown** (`SEC-015`) — needs human review:
"logged in" is not "may access THIS record." For each data endpoint, show the
ownership check on the requested resource ID. Refs: OWASP-A01:2021.

**Security story:** exposed, an attacker reads secrets, runs SQL, executes
code, and reads plaintext traffic. Fix the two critical items before any
deploy; fix the rest before any user touches it.

## 2. Data, testing, supply chain — the voids

**Data:** no migrations, no transactions, no constraints, no pagination —
sketch, not a system. Fine for a spike; not fine the moment two users share it.

**Testing:** zero — no suite, no layout, no coverage config. You cannot safely
refactor this app today. Add one smoke test before touching security, or every
fix below is a guess.

**Supply chain:** no lockfile, floating `"express": "*"`, no audit, no SBOM.
Start with a lockfile and `npm audit`; add SBOM before external distribution.

**Reproducibility:** no lockfile, no runtime pin, no CI. Every build is a
different build. Minimal pipeline: install → lint → test → build, required
on every PR.

## 3. Scores, honestly

| Area         | Readiness        | Confidence | Story                                                    |
| ------------ | ---------------- | ---------- | -------------------------------------------------------- |
| Foundation   | 2/10             | High       | Missing license, env example, runtime pin, lockfile, CI. |
| Security     | 3/10             | High       | Two critical defects. Do not expose.                     |
| Data         | 1/10             | Medium     | No migrations, transactions, constraints.                |
| Testing      | 0/10             | High       | No tests at all.                                         |
| Supply chain | 1/10             | Low        | File presence only — dependency safety unverified.       |
| Docs         | —                | None       | **Not rated — insufficient evidence.**                   |
| Release      | —                | None       | **Not verified.**                                        |
| **Overall**  | **🔴 Not ready** | **Medium** | **Prototype with critical security debt.**               |

Sections with fewer than 40% of checks verified print no number — a 10/10 at
25% confidence would be 2.5 of an unknown 10, not a perfect score. The raw
overall (37/100) is demoted to context for exactly this reason: a number does
not average away a CRITICAL.

## 4. Roadmap that tells a story

### Phase 0 — Now (today): stop the bleeding

Remove hardcoded secrets (rotate anything real) · parameterise SQL · remove
`eval` · move HTTP to HTTPS.

### Phase 1 — This week: make it reproducible

Commit lockfile, pin versions · `.nvmrc` + `engines` · `.env.example` ·
`Makefile` · minimal CI (install → lint → test → build) · `AGENTS.md`.

### Phase 2 — Next week: make it testable, then fix with confidence

One smoke test · test for the SQL fix · ESLint + Prettier · central error
handler · structured logging + correlation ID · input validation · coverage
config.

### Phase 3 — Next month: operable and safe for users

Migrations · transactions · pagination · security headers · per-endpoint
authorization review · negative tests · LICENSE · CODEOWNERS + ADRs.

### Phase 4 — Backlog: re-read after the next audit

SBOM · Dependabot · backup + restore drill · SLOs/timeouts/idempotency ·
threat model · mutation testing · deprecated-API cleanup.

## 5. What this audit did not check

A fixed, honest account of the method's limits: reachability and taint
analysis · threat model, data flow, authz matrix · secret validity and full
history scan · dependency vulnerability scan and SBOM · rate limiting, CSRF,
auth existence, prototype pollution · runtime and observability reality ·
benchmark against comparable repos. Static file inspection is not semantic
analysis; absence of a finding is not evidence of safety.

## 6. Machine record

The deterministic substrate lives in the raw companion,
`examples/sample-report.md` (same audit, checklist projection, embedded
`usa-report-v1` trailer — diff it with `usa diff`). Scores there are
reproducible: re-run with the same rules and depth to compare.
