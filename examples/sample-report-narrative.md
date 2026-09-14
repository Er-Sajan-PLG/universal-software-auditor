# 🔍 Universal Software Audit

|                         |                                                           |
| ----------------------- | --------------------------------------------------------- |
| **Project**             | `demo-app`                                                |
| **Path**                | `/home/user/universal-software-auditor/examples/demo-app` |
| **Revision**            | `n/a` — detached                                          |
| **Date**                | `2026-01-01T00:00:00Z`                                    |
| **Auditor**             | USA `2.6.0`                                               |
| **Schema**              | `usa-report-v2`                                           |
| **Detected type**       | HTTP service / order API                                  |
| **Platform**            | server                                                    |
| **Stack**               | JavaScript · Express · MySQL                              |
| **Maturity**            | Prototype / Spike                                         |
| **Depth**               | standard                                                  |
| **Automation coverage** | 73.8% of applicable checks                                |

---

# 🔴 Executive Verdict

## Red — do not expose to untrusted input or real production data yet.

`demo-app` is a small Express/MySQL prototype with enough structure to continue development, but it has **not yet earned operational trust**.

The repository is understandable. The application can run. Some basic hygiene is present.

However, several important trust boundaries are weak or unproven.

### The dominant findings

1. **User-controlled data appears to reach SQL construction unsafely.**
2. **A credential-like value is embedded in source and has not been conclusively classified.**
3. **`eval` is present in application code and requires immediate security review.**
4. **There is little executable evidence proving that critical behavior remains correct.**
5. **Authorization, state integrity, release safety, and operational recovery remain largely unproven.**

### One-line story

> **A small, understandable Express/MySQL spike that can run, but whose security boundaries, reproducibility, correctness guarantees, and operational controls are not yet strong enough to support trust.**

### Overall readiness

**🔴 NOT READY**

This is a **verdict, not an average**.

A project with a release-blocking security defect does not become safe because several unrelated quality checks pass.

---

> ## How to read this report
>
> The report is ordered to explain the system, its failure boundaries, its evidence, and its progression toward trust.
>
> **Unknown is not pass.**
> **Not detected is not automatically not applicable.**
> **Missing evidence is not evidence of safety.**
>
> `CRITICAL` means stop.
> `HIGH` means near-term action.
> `MEDIUM` means scheduled work.
> `LOW/FUTURE` means improvement backlog.
>
> Scores are secondary. **Evidence, confidence, and release gates take precedence.**
>
> **Evidence states used in this report:**
>
> - **✅ Verified present** — the engine observed it directly.
> - **✅ Verified absent** — the engine observed its absence in a place it must exist.
> - **❓ Not verified** — the engine could not determine state; requires human or command.
> - **🚫 Not detected** — no matching artifact found; may be absent or may be hidden behind a pattern the engine cannot see.
> - **— Not applicable** — the rule does not apply at this maturity or stack.
> - **⏸ Deferred** — applies later, not now.
>
> **The engine measures process and code hygiene. It does not measure whether the system is correct, safe under adversarial conditions, or fit for a business purpose. Those require threat modeling, authorization review, and domain judgment.**

---

# 0. Foundation first

_Before judging the building, establish whether there is a floor underneath it._

The first question is not whether the repository contains particular files.

The question is:

> **Can another competent person understand, reproduce, verify, and safely modify this project without relying on undocumented tribal knowledge?**

| Capability                    | Rule                   | State      | Evidence                          | Why it matters                                     | Next action                                     |
| ----------------------------- | ---------------------- | ---------- | --------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| Project identity              | `REPO-004` / `FND-001` | ✅ Present | `README*`                         | The project has a discoverable entry point.        | Verify it explains purpose and boundaries.      |
| Repository hygiene            | `REPO-001`             | ✅ Present | `.gitignore`                      | Basic accidental-file protection exists.           | Keep.                                           |
| Environment/secret exclusion  | `REPO-002`             | ✅ Present | No `.env` committed               | Reduces common accidental leaks.                   | Keep.                                           |
| Build-artifact exclusion      | `REPO-007`             | ✅ Present | No `node_modules/` in tree        | Keeps generated state out of source.               | Keep.                                           |
| Root structure                | `REPO-017`             | ✅ Present | `src/`, `package.json`            | Main concerns are reasonably discoverable.         | Keep.                                           |
| License                       | `REPO-005`             | 🚫 Missing | No `LICENSE*`                     | Legal reuse is undefined.                          | Add appropriate license.                        |
| Configuration contract        | `REPO-006`             | 🚫 Missing | No `.env.example`                 | Required environment is not clearly documented.    | Add safe configuration template.                |
| Runtime identity              | `FND-010` / `NODE-001` | 🚫 Missing | No `.nvmrc`, no `engines`         | Runtime behavior depends on machine state.         | Pin runtime.                                    |
| Dependency reproducibility    | `SUP-001`              | 🚫 Missing | No `package-lock.json`            | Dependency graph can drift.                        | Commit lockfile.                                |
| Reproducible environment      | `FND-011`              | 🚫 Missing | No `Dockerfile`, no `compose.yml` | Clean-machine reconstruction is unproven.          | Define canonical environment.                   |
| Canonical workflow            | `FND-013`              | 🚫 Missing | No `Makefile`, no `justfile`      | Build/test commands are not clearly standardized.  | Define canonical commands.                      |
| Automated change verification | `FND-012` / `CICD-001` | 🚫 Missing | No `.github/workflows/`           | Changes do not have an enforced verification path. | Add CI.                                         |
| Machine/agent contract        | `REPO-018` / `FND-006` | 🚫 Missing | No `AGENTS.md`, no `llms.txt`     | Automated contributors must infer constraints.     | Add `AGENTS.md` or equivalent.                  |
| Ownership                     | `FND-003`              | 🚫 Missing | No `CODEOWNERS`                   | Review responsibility is unclear.                  | Add when collaborative development requires it. |
| Decision memory               | `FND-005`              | 🚫 Missing | No `docs/adr/`                    | Important architectural reasoning can disappear.   | Add ADRs for consequential decisions.           |
| Verification instrumentation  | `FND-009`              | 🚫 Missing | No coverage config                | Test strength is not yet measured.                 | Add after meaningful tests exist.               |

## What the foundation tells us

The repository contains code, but not yet a complete **project contract**.

It is possible to inspect it.

It is not yet possible to confidently say:

> “A clean machine, new developer, or capable agent can reconstruct the intended environment, execute the canonical workflow, and know what constitutes a verified change.”

**What this means at prototype stage:** Missing foundation is tolerable _if_ the project is actively spiking and expected to be thrown away. It becomes intolerable the moment the project is expected to survive a weekend, a collaborator, or a deploy.

## Foundation readiness

**🟠 PARTIAL**

The floor exists, but it is not yet load-bearing.

**What would change this:** Commit a lockfile, `.nvmrc`, `.env.example`, a task runner, and one CI workflow. That single phase converts “a folder with code” into “a project.”

---

# 1. Security — stop the bleeding

## 🔴 Critical — fix before exposure

### `SEC-005` — SQL constructed from request-controlled data

**Where:** `src/db.js:15`

```js
'SELECT * FROM orders WHERE id = ' + orderId;
```

The surrounding code indicates that `orderId` originates from request input.

### Trust boundary

```text
untrusted request
      ↓
  HTTP handler
      ↓
  string concatenation     ← the boundary fails here
      ↓
  raw SQL executed
      ↓
  database
```

**Why this is critical:** This is not a style issue. The trust boundary between “untrusted request” and “trusted SQL engine” is crossed by concatenation. An attacker who can reach this handler can alter the query. Depending on the driver and connection user, the impact ranges from data disclosure to data destruction to, in misconfigured environments, command execution on the database host.

**Evidence state:** ✅ Verified present in source. The engine observed the concatenation directly.

**Evidence still missing:** No runtime exploit test has been run. No DAST scan has been performed. The actual blast radius depends on the database user’s privileges, which the engine did not inspect.

**Fix:**

```js
// parameterised
await db.query('SELECT id, status, total FROM orders WHERE id = ?', [orderId]);
```

Then add a regression test that attempts injection and asserts it fails.

**Refs:** CWE-89 · ASVS-5.3.4 · OWASP-A03:2021

---

### `SEC-001` — Credential-like value embedded in source

**Where:** `src/config.js:3`, `src/config.js:4`

```js
api_key: 'example_key_not_real_12345',
```

The value is labeled “not real.” That is a useful signal but not a sufficient classification. The engine cannot determine whether the pattern was ever used with a real value, whether it was ever committed to a public remote, or whether the naming convention matches a real secret store.

**Evidence state:** ✅ Verified present in HEAD. ❓ Not verified in history.

**Evidence still missing:**

- `gitleaks detect --log-opts=--all` output
- `trufflehog git file://. --only-verified` output
- Confirmation from the author that no real value was ever substituted

**Fix:**

1. Move to environment variables backed by a secret manager.
2. Rotate any value that ever existed in a real environment.
3. Run a full-history secret scan.
4. Add a pre-commit hook to prevent recurrence.

**Refs:** CWE-798 · ASVS-2.10.4 · OWASP-A02:2021

---

### `SEC-006` — Dynamic code execution in application code

**Where:** `src/express.js:7`

```js
return eval(expr);
```

`eval` accepts a string and executes it as JavaScript. If `expr` can be influenced by a request, this is remote code execution.

**Trust boundary**

```text
untrusted request
      ↓
  HTTP handler
      ↓
  eval(expr)              ← the boundary fails here
      ↓
  arbitrary JavaScript
```

**Evidence state:** ✅ Verified present. ❓ Not verified whether `expr` is request-reachable.

**What the engine cannot see:** Whether the caller of this function passes user input. The engine sees the `eval`. It does not see the data flow. This is exactly the kind of gap that requires a human or a dataflow-aware SAST tool.

**Fix:**

- Determine whether `expr` is user-controllable.
- If yes: remove immediately.
- If no: replace with a lookup table or a sandboxed evaluator anyway. `eval` in application code is a liability that outlives its original justification.

**Refs:** CWE-95 · ASVS-5.2.4

---

### `SEC-003` — Plaintext HTTP endpoints in configuration

**Where:** `src/config.js:5`, `src/legacy.js:5`

```js
endpoint: 'http://api.internal.example.com/v1/orders',
```

**Evidence state:** ✅ Verified present. ❓ Not verified whether these are reachable in a deployed environment.

**Why it matters even internally:** “Internal” is a network topology, not a security control. Plaintext internal traffic is readable by anything on the path: a compromised pod, a misconfigured service mesh, a curious operator. Zero-trust assumes the internal network is hostile.

**Fix:** Move to `https://`. Terminate TLS at the edge and keep it internally.

**Refs:** CWE-319 · ASVS-9.1.1

---

### `SEC-008` — Input validation at trust boundary

**State:** 🚫 Not detected in any source file.

**Why this matters here specifically:** The SQL concatenation at `src/db.js:15` is the downstream symptom. The upstream cause is that no schema validates `orderId` before it reaches the database layer. Even after the SQL is parameterised, unvalidated input will continue to cause type confusion, resource exhaustion, and logic errors.

**Trust boundary — where validation should live**

```text
untrusted request
      ↓
  ┌─────────────────────┐
  │ validation schema   │   ← missing
  │ (zod / joi / yup)   │
  └─────────────────────┘
      ↓
  typed, bounded input
      ↓
  domain logic
      ↓
  database
```

**Fix:** Define schemas at every edge: HTTP handlers, queue consumers, CLI parsers. Parse before use. Reject before processing.

**Refs:** CWE-20 · ASVS-5.1.1 · OWASP-A03:2021

---

### `SEC-020` — Errors leak internals to clients

**Where:** `src/server.js:14`

```js
res.status(500).json({ error: err.message });
```

**Why this matters:** Error messages are an attacker’s map. Stack traces reveal file paths, library versions, and internal logic. Even a single leaked SQL error can confirm injection.

**Fix:** Return a generic error plus a correlation ID. Log the detail server-side.

```js
res.status(500).json({ error: 'Internal error', requestId: req.id });
logger.error({ err, requestId: req.id }, 'unhandled error');
```

**Refs:** CWE-209 · ASVS-7.4.1

---

### `SEC-018` — Security headers not set

**State:** 🚫 Not detected in any config or framework file.

**Why this matters:** Missing HSTS allows downgrade attacks. Missing `X-Content-Type-Options: nosniff` allows MIME confusion. Missing CSP allows script injection. These are cheap to add and expensive to discover in production.

**Fix:** Use `helmet` or equivalent.

**Refs:** ASVS-14.4.3 · OWASP-Secure-Headers

---

### `SEC-015` — Authorization per request, not per route

**State:** ❓ Unknown — requires human review.

**Why this is the highest-leverage unknown in the report:** “Is the user logged in?” is not “may this user access this specific record?” The most common real-world authorization bug is IDOR: user A changes an ID in a URL and reads user B’s data. No linter finds this. No grep finds this. It requires reading every data endpoint and confirming an ownership check on the requested resource.

**Evidence required:**

- For each endpoint that reads or mutates a resource: `file:line` showing the ownership or permission check on the requested resource ID.
- A negative test proving user A cannot read or modify user B’s resource.

**Until this is done, the authorization posture is unknown, not safe.**

**Refs:** OWASP-A01:2021

---

## ✅ Verified passing in Security

| Rule                                              | What it means                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `SEC-002` No sensitive data in logs               | The engine observed log statements and did not find patterns that suggest secrets, tokens, or credentials. |
| `SEC-004` TLS verification not disabled           | No `rejectUnauthorized: false`, no `NODE_TLS_REJECT_UNAUTHORIZED=0`.                                       |
| `SEC-007` No shell from user input                | No `child_process.exec` with concatenated input.                                                           |
| `SEC-010` Path traversal prevented                | No raw `path.join(root, userInput)` without normalization.                                                 |
| `SEC-017` CORS not wildcard                       | `*` is not used as the allowed origin.                                                                     |
| `SEC-021` Cryptographic randomness for tokens/IDs | `Math.random` is not used for security-sensitive values.                                                   |

**Evidence state:** ✅ Verified present in source. These are positive signals. They are not proof of safety; they are absence of a specific class of defect.

---

## What the security posture tells us

The security posture is **structurally weak but not yet exploited**.

- One critical injection surface (`SEC-005`).
- One critical secret-hygiene unknown (`SEC-001`).
- One critical code-execution surface (`SEC-006`), reachability unverified.
- Several medium gaps that are cheap to fix (`SEC-003`, `SEC-008`, `SEC-018`, `SEC-020`).
- One high-leverage unknown (`SEC-015`) that no automated tool can resolve.

The pattern is consistent: the code was written for a happy path. It works when the caller is cooperative. It has not been hardened against a caller who is not.

At prototype stage, this is normal. The question is whether the prototype is about to become a product. If yes, **Phase 0 and Phase 1 of the roadmap are non-negotiable.**

**Security confidence: 92.9%** — high for what the engine measured. The score of 4.9/10 is trustworthy within its scope. The scope itself is incomplete.

**What would change this section:** A threat model, a data flow diagram, a SAST/DAST run, and an authorization matrix. Until then, this section is a floor, not a ceiling.

---

# 2. Data integrity

_The database is where trust is most expensive to repair._

| Check                           | Rule       | State      | Evidence                                      | Fix                                                             |
| ------------------------------- | ---------- | ---------- | --------------------------------------------- | --------------------------------------------------------------- |
| Migration system                | `DATA-001` | 🚫 Missing | No `migrations/`, no `prisma/`, no `knexfile` | Adopt a migration tool. Never alter production schema manually. |
| Multi-step writes transactional | `DATA-007` | 🚫 Missing | No `BEGIN`/`COMMIT` patterns found            | Wrap related writes in a transaction. Make idempotent.          |
| Foreign keys / relations        | `DATA-002` | 🚫 Missing | No FK declarations in SQL/ORM                 | Declare DB-level constraints. Add orphan-row check if not.      |
| List queries paginated          | `DATA-005` | 🚫 Missing | No `LIMIT`/`OFFSET`/cursor patterns           | Default + max page size on every list endpoint.                 |
| `SELECT *` in hot paths         | `DATA-008` | ⚠️ Present | `src/db.js:15`                                | Select only the columns you use.                                |
| Connection pooling              | `DATA-006` | ✅ Present | Pool config detected                          | Keep.                                                           |
| No N+1 queries                  | `DATA-004` | ❓ Unknown | Requires query logs                           | EXPLAIN the main list endpoints.                                |
| Indexes on queried columns      | `DATA-003` | ❓ Unknown | Requires EXPLAIN plans                        | Index the five heaviest queries.                                |
| Delete strategy defined         | `DATA-009` | ❓ Unknown | Requires policy review                        | Hard delete or soft delete? Retention? Erasure?                 |

## Trust boundary — where data integrity is decided

```text
application write
      ↓
  ┌─────────────────────┐
  │ transaction?        │   ← missing
  └─────────────────────┘
      ↓
  ┌─────────────────────┐
  │ constraint checks?  │   ← missing
  └─────────────────────┘
      ↓
  database
```

Without transactions and constraints, the database accepts whatever it is told. That is fine for a spike. It is a data-loss incident waiting for concurrency.

## What the data layer tells us

The database is a sketch. It has a connection pool, which means someone thought about production. It has no migrations, no transactions, and no constraints, which means it has not yet been operated under load or by more than one writer.

**The gap between “it works for me” and “it works for two users at once” is exactly this section.**

**Data confidence: 66.7%** — moderate. The 1.3/10 score is directionally correct but incomplete. The unknowns (`DATA-004`, `DATA-003`, `DATA-009`) could each change the picture.

**What would change this section:** A migration tool, one transaction wrapper, one FK constraint, one paginated endpoint, and query logs from a realistic dataset.

---

# 3. Testing — currently zero

_Nothing in this report can be confidently fixed without a way to know the fix worked._

| Check                              | Rule       | State      |
| ---------------------------------- | ---------- | ---------- |
| Test suite exists                  | `TEST-001` | 🚫 None    |
| Unit-test layout                   | `TAS-001`  | 🚫 None    |
| Integration-test layout            | `TAS-002`  | 🚫 None    |
| System/E2E layout                  | `TAS-003`  | 🚫 None    |
| Failure-path assertions            | `TAS-010`  | 🚫 None    |
| Contract tests                     | `TAS-004`  | 🚫 None    |
| Coverage config                    | `TAS-005`  | 🚫 None    |
| Coverage threshold                 | `TAS-006`  | 🚫 None    |
| Mutation-testing evidence          | `TAS-007`  | 🚫 None    |
| Determinism guard                  | `TAS-008`  | 🚫 None    |
| Retry budget declared              | `TAS-009`  | 🚫 None    |
| Test-data isolation                | `TAS-011`  | 🚫 None    |
| Integration tests cover seams      | `TEST-006` | ❓ Unknown |
| Security-relevant behaviour tested | `TEST-008` | ❓ Unknown |

## Trust boundary — where confidence comes from

```text
change made
      ↓
  ┌─────────────────────┐
  │ test exists?        │   ← no
  └─────────────────────┘
      ↓
  ┌─────────────────────┐
  │ CI runs it?         │   ← no
  └─────────────────────┘
      ↓
  confidence
```

Without tests, “I fixed the SQL injection” is a claim, not a verified fact. The fix could be incomplete. It could break another path. It could be reverted by a later change.

The minimum viable testing posture for this project is:

1. One smoke test that boots the app and hits the health endpoint.
2. One test that attempts SQL injection and asserts it fails.
3. One test that asserts an unauthenticated request to a protected endpoint is rejected.

That is three tests. It is a few hours of work. It converts the entire roadmap from “hope” to “verified.”

**Testing confidence: 85.7%** — high. The 0/10 score is accurate.

**What would change this section:** Three tests and a CI job that runs them.

---

# 4. Reproducibility & CI

_A project that builds differently on every machine cannot be audited, deployed, or trusted._

| Check                             | Rule       | State      |
| --------------------------------- | ---------- | ---------- |
| Lockfile committed                | `SUP-001`  | 🚫 Missing |
| Runtime pinned                    | `NODE-001` | 🚫 Missing |
| Env vars validated at startup     | `NODE-006` | 🚫 Missing |
| CI pipeline exists                | `CICD-001` | 🚫 Missing |
| Health check endpoints            | `CICD-007` | ✅ Present |
| Backups exist AND restores tested | `CICD-010` | ❓ Unknown |

## Trust boundary — reproducibility

```text
developer machine A          developer machine B          CI
      ↓                            ↓                      ↓
  npm install                 npm install             npm install
      ↓                            ↓                      ↓
  express@*                   express@*                express@*
      ↓                            ↓                      ↓
  version X                   version Y                version Z
```

The `"express": "*"` in `package.json:10` is the canonical example. Every install is a different build. Every build is a different audit target.

## What reproducibility tells us

Nothing verifies a change. Nothing pins the runtime. Nothing locks the dependency tree.

The health check endpoint exists, which is a positive signal — someone thought about operational liveness. But liveness without reproducibility is a green light on a car with no brakes.

**Minimal pipeline to add:**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

Then make `verify` a required check.

**What would change this section:** Commit the lockfile, add `.nvmrc`, add the CI workflow above, and add a `Makefile` with `setup`, `test`, `lint`.

---

# 5. Code quality & observability

_Code that cannot be observed cannot be operated._

| Check                          | Rule     | State      | Evidence                              | Fix                                           |
| ------------------------------ | -------- | ---------- | ------------------------------------- | --------------------------------------------- |
| Linter configured              | `CQ-001` | 🚫 Missing | No `.eslintrc*`, no `eslint.config.*` | ESLint recommended config.                    |
| Formatter configured           | `CQ-002` | 🚫 Missing | No `.prettierrc*`, no `.editorconfig` | Prettier. Stop discussing style.              |
| Central error handler          | `CQ-006` | 🚫 Missing | No Express error middleware           | Add one.                                      |
| Correlation/trace ID           | `CQ-008` | 🚫 Missing | No `req.id` pattern                   | Generate per request, log it, return header.  |
| Structured, levelled logging   | `CQ-007` | ❓ Unknown | Requires log inspection               | JSON logs with levels. Replace `console.log`. |
| Debug statements in prod paths | `CQ-009` | ⚠️ Present | `src/server.js:24`                    | Use project logger or delete.                 |
| TODO/FIXME tracked             | `CQ-010` | ⚠️ Present | `src/db.js:11`                        | Convert to issue or delete.                   |
| Errors handled, not swallowed  | `CQ-005` | ✅ Pass    | —                                     | Keep.                                         |

## Trust boundary — observability

```text
request
      ↓
  ┌─────────────────────┐
  │ correlation ID?     │   ← missing
  └─────────────────────┘
      ↓
  ┌─────────────────────┐
  │ structured log?     │   ← unknown
  └─────────────────────┘
      ↓
  ┌─────────────────────┐
  │ central handler?    │   ← missing
  └─────────────────────┘
      ↓
  response
```

## What the code quality tells us

The code is small, so the absence of guardrails has not yet hurt. That is the trap of prototypes: the lack of lint, format, and error handling is invisible until the codebase grows past the point where a human can hold it in their head.

The `console.log` in `src/server.js:24` and the untracked TODO in `src/db.js:11` are the same anti-pattern: **the author knew, wrote it down, and moved on.** That is correct behavior for a spike. It becomes a liability the moment someone else depends on the code.

**What would change this section:** ESLint, Prettier, one error middleware, one correlation ID middleware, and a logger. That is a day of work that pays back for the life of the project.

---

# 6. Supply chain

_You are not just shipping your code. You are shipping everything your code depends on._

| Check                     | Rule       | State               | Evidence                 | Fix                               |
| ------------------------- | ---------- | ------------------- | ------------------------ | --------------------------------- |
| Lockfile                  | `SUP-001`  | 🚫 Missing          | No `package-lock.json`   | Commit it.                        |
| Pinned versions           | `SUP-003`  | 🔴 `"express": "*"` | `package.json:10`        | Pin exact versions.               |
| Dependency updates        | `SUP-004`  | 🚫 Missing          | No dependabot/renovate   | Weekly grouped PRs.               |
| Known vulnerabilities     | `DEP-002`  | ❓ Unverified       | No audit output          | Run `npm audit` / `osv-scanner`.  |
| No private registry creds | `NODE-004` | ✅ Pass             | —                        | Keep.                             |
| Redundant dependencies    | `DEP-004`  | ❓ Unknown          | Requires manifest review | Two libraries doing the same job? |
| License compatibility     | `DEP-006`  | ❓ Unknown          | Requires SPDX inventory  | Watch GPL/AGPL.                   |

## Trust boundary — supply chain

```text
your code
      ↓
  direct dependency
      ↓
  transitive dependency
      ↓
  transitive dependency
      ↓
  ┌─────────────────────┐
  │ known CVE?          │   ← unknown
  └─────────────────────┘
      ↓
  production
```

## What the supply chain tells us

`"express": "*"` means every `npm install` can pull a different version. The engine cannot tell you what you are shipping because you do not know what you are shipping.

The missing lockfile is the root cause. The missing audit is the symptom. The unknown license inventory is the deferred risk.

**What would change this section:** `npm install` → commit `package-lock.json` → pin versions → run `npm audit` → add Dependabot. That is an hour.

---

# 7. Architecture & design

_Structure determines what is easy to change and what is expensive to change._

| Check                                    | Rule       | State                             |
| ---------------------------------------- | ---------- | --------------------------------- |
| No god files                             | `ARCH-003` | ✅ Pass                           |
| Configuration externalised               | `ARCH-007` | ✅ Pass                           |
| Layers separated (transport/domain/data) | `ARCH-004` | ❓ Unknown                        |
| Side effects isolated and testable       | `ARCH-008` | ❓ Unknown                        |
| Async work offloaded to queue            | `ARCH-010` | 🚫 Missing (FUTURE for prototype) |

## What the architecture tells us

For a spike, this is acceptable. The code is small enough that structure is implicit.

But the two critical security defects — SQL concatenation and `eval` — are both symptoms of the same architectural gap: **HTTP handlers reaching directly into raw infrastructure.** The handler builds SQL. The handler calls `eval`. There is no domain layer to mediate.

Fix the layer boundary and both defects become structurally harder to reintroduce.

**Architecture confidence: 60%** — moderate. The 8/10 score is overconfident given two critical design defects hiding in the code.

**What would change this section:** A `src/domain/` layer, a `src/data/` layer, and handlers that only translate HTTP ↔ domain calls.

---

# 8. Platform / API

_The contract with the outside world._

| Check                         | Rule       | State      | Fix                                                  |
| ----------------------------- | ---------- | ---------- | ---------------------------------------------------- |
| Runtime version pinned        | `NODE-001` | 🚫 Missing | `.nvmrc` + `engines`.                                |
| Env vars validated at startup | `NODE-006` | 🚫 Missing | Parse `process.env` against schema. Exit on failure. |
| Unhandled rejections handled  | `NODE-003` | 🚫 Missing | Log and exit non-zero.                               |
| No deprecated Node APIs       | `NODE-005` | 💀 Present | `src/legacy.js:5`, `src/legacy.js:10`. Replace.      |
| Request timeouts              | `API-002`  | ❓ Unknown | Set server, upstream, DB timeouts.                   |
| Idempotent writes             | `API-004`  | ❓ Unknown | Idempotency key for POST/PUT.                        |
| Bounded retries with jitter   | `API-003`  | ❓ Unknown | Max attempts, backoff.                               |
| Consistent response format    | `API-005`  | ❓ Unknown | One success envelope, one error envelope.            |
| Minimal health/readiness      | `API-008`  | ❓ Unknown | Do not leak versions/deps.                           |

## What the platform tells us

The deprecated Node APIs in `src/legacy.js` suggest this code was copied from an older project without review. The missing runtime pin suggests it was never deployed anywhere with a different Node version. The missing env validation suggests nobody has tried to run it on a machine where a variable was missing.

These are all prototype-stage observations. They become incidents the moment the app is deployed.

**Platform confidence: 50%** — low. The 5.1/10 score is not trustworthy.

**What would change this section:** `.nvmrc`, env schema, process handlers, and a timeout on the database client.

---

# 9. Release & change management

_How change reaches production, and how it is undone._

| Check                                 | Rule      | State      |
| ------------------------------------- | --------- | ---------- |
| DB migrations forward and reversible  | `REL-005` | ❓ Unknown |
| Migrations separated from app deploys | `REL-006` | ❓ Unknown |

## What release management tells us

You are not releasing yet. When you do, the schema change order matters: deploy schema first (expand), then code, then contract. A migration you cannot reverse is a one-way door taken during a deploy, usually at the worst moment.

**Release confidence: 0%** — not verified. No score.

**What would change this section:** A migration tool, a deploy runbook, and one rehearsal of a rollback.

---

# 10. Future readiness

_The decisions that are cheap now and expensive later._

| Check                    | Rule      | State      |
| ------------------------ | --------- | ---------- |
| No core tech at/near EOL | `FUT-002` | ❓ Unknown |
| Data archiving strategy  | `FUT-003` | ❓ Unknown |

## What future readiness tells us

Not urgent for a spike. But if you deploy on Node 16 or MySQL 5.7, you are already past EOL. Pin the runtime and check the EOL date before you ship.

**Future confidence: 0%** — not verified. No score.

---

# 11. Documentation

_The artifact that outlives the author._

| Check                                     | Rule                   | State      |
| ----------------------------------------- | ---------------------- | ---------- |
| README exists                             | `FND-001` / `REPO-004` | ✅ Present |
| README covers what/install/run/contribute | `DOC-001`              | ❓ Unknown |
| Setup instructions verified recently      | `DOC-002`              | ❓ Unknown |
| Complex logic explained at point of use   | `DOC-004`              | ❓ Unknown |
| Docs have machine-readable markers        | `FND-007`              | 🚫 Missing |

## What the documentation tells us

A README exists. That is the whole story. The README may or may not explain install/run/contribute.

The original report scored this `10/10 †` with 25% confidence. That is misleading. A 10/10 should mean “verified thoroughly.” Here it should be **“Not rated — insufficient evidence.”**

**What would change this section:** A README with the four headings, verified by a clean-machine clone.

---

# 12. Trust progression — the story in one page

Trust is not a score. It is a sequence of gates. Each gate depends on the one before it.

```text
┌─────────────────────────────────────────────────────────────┐
│  GATE 0 — FOUNDATION                                         │
│  Can another person reproduce this?                         │
│  State: 🟠 PARTIAL — code exists, project contract does not │
│  Missing: license, .env.example, runtime pin, lockfile, CI  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  GATE 1 — SECURITY                                           │
│  Is it safe to expose?                                       │
│  State: 🔴 RED — two critical defects, one unknown critical │
│  Missing: SQL parameterisation, secret classification, eval │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  GATE 2 — DATA INTEGRITY                                     │
│  Will it lose or corrupt data?                              │
│  State: 🔴 RED — no migrations, transactions, constraints   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  GATE 3 — VERIFIABILITY                                      │
│  Can you prove a change is correct?                         │
│  State: 🔴 RED — zero tests, zero CI                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  GATE 4 — OPERABILITY                                        │
│  Can you run it, see it, and recover it?                    │
│  State: 🔴 RED — no logs, no traces, no backups tested      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  GATE 5 — SUPPLY CHAIN                                       │
│  Do you know what you ship?                                 │
│  State: 🔴 RED — no lockfile, no audit, no SBOM             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  GATE 6 — ARCHITECTURE                                       │
│  Can it evolve without collapse?                             │
│  State: 🟠 PARTIAL — small, but layers unproven             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  GATE 7 — FUTURE READINESS                                   │
│  Will it still be true in 18 months?                        │
│  State: ❓ UNKNOWN                                           │
└─────────────────────────────────────────────────────────────┘
```

**The story is this:** You cannot skip gates. A project with no lockfile cannot be audited for supply chain. A project with no tests cannot be safely refactored. A project with SQL injection cannot be deployed regardless of its architecture.

The gates are ordered because **trust flows upward.** Each gate is a prerequisite for the one above.

---

# 13. Scorecard that tells the truth

| Area             | Readiness        | Confidence | Story                                                    |
| ---------------- | ---------------- | ---------- | -------------------------------------------------------- |
| Foundation       | 2/10             | High       | Missing license, env example, runtime pin, lockfile, CI. |
| Security         | 3/10             | High       | Two critical defects. Do not expose.                     |
| Data             | 1/10             | Medium     | No migrations, transactions, FKs, pagination.            |
| Testing          | 0/10             | High       | No tests at all.                                         |
| CI/CD            | 2/10             | Medium     | No pipeline. Health check exists.                        |
| Supply chain     | 1/10             | Low        | No lockfile, no audit, no SBOM.                          |
| Docs             | 4/10             | Medium     | README exists. Everything else missing.                  |
| Architecture     | 6/10             | Low        | Small, no god files, but layers unknown.                 |
| Platform/API     | 3/10             | Low        | Deprecated APIs, no env validation, no timeouts.         |
| Release          | —                | None       | Not verified.                                            |
| Future readiness | —                | None       | Not verified.                                            |
| **Overall**      | **🔴 Not ready** | **Medium** | **Prototype with critical security debt.**               |

**Do not average this into 37.3/100 and call it “within expected band.”** The expected band is irrelevant when there is SQL injection and hardcoded secrets. Fix Phase 0 first. Then re-audit.

---

# 14. Roadmap that tells a story

### Phase 0 — Now (today)

_Stop the bleeding. Ship nothing until this is done._

- 🔴 `SEC-001` Classify and remove credential-like value. Run gitleaks on history.
- 🔴 `SEC-005` Parameterise SQL. Never concatenate.
- 🔴 `SEC-006` Determine reachability of `eval`. Remove or replace.
- 🔴 `SEC-003` Move HTTP to HTTPS.

### Phase 1 — This week

_Make the project reproducible. You cannot verify anything without this._

- Commit lockfile (`SUP-001`), pin versions (`SUP-003`).
- Add `.nvmrc` + `engines` (`FND-010` / `NODE-001`).
- Add `.env.example` (`REPO-006`).
- Add `Makefile` or `justfile` (`FND-013`).
- Add minimal CI: install → lint → test → build (`FND-012` / `CICD-001`).
- Add `AGENTS.md` (`REPO-018` / `FND-006`).

### Phase 2 — Next week

_Make it testable. Then fix security with confidence._

- Add one smoke test for the happy path (`TEST-001`).
- Add test for the SQL injection fix (`TAS-010`).
- Add ESLint + Prettier (`CQ-001`, `CQ-002`).
- Add central error handler (`CQ-006`).
- Add structured logging + correlation ID (`CQ-007`, `CQ-008`).
- Add input validation with zod/joi (`SEC-008`).
- Add coverage config (`FND-009` / `TAS-005`).

### Phase 3 — Next month

_Make it operable and safe for users._

- Add migrations (`DATA-001`).
- Add transactions (`DATA-007`).
- Add foreign keys (`DATA-002`).
- Add pagination (`DATA-005`).
- Add security headers (`SEC-018`).
- Review authorization per endpoint (`SEC-015`).
- Add negative tests (`TAS-010`).
- Add `.editorconfig` (`REPO-013`).
- Add LICENSE (`REPO-005` / `FND-002`).
- Add CODEOWNERS + branch protection + ADRs (`FND-003`, `FND-004`, `FND-005`).

### Phase 4 — Backlog

_Low and future items. Re-read after next audit._

- SBOM (`DEP-002`), Dependabot (`SUP-004`), license inventory (`DEP-006`).
- Backup + restore drill (`CICD-010`).
- SLOs, timeouts, idempotency (`API-002`, `API-003`, `API-004`, `API-005`).
- Threat model and privacy review (`FUT-003`, `DATA-009`).
- Mutation testing (`TAS-007`), contract tests (`TAS-004`).
- Replace deprecated Node APIs (`NODE-005`).
- Data archiving strategy (`FUT-003`).
- Docs machine-readable markers (`FND-007`).

### What actually matters at Prototype / Spike

- Secret hygiene and `.gitignore` (non-negotiable, costs 5 minutes)
- A README that says what this is and how to run it
- One smoke test so the happy path is known-good
- A lockfile so the build is reproducible

### Deliberately deferred at this stage

- Kubernetes, multi-region, formal ADRs, 80% coverage gates, mutation testing

---

# Appendix A — Evidence state legend

| State                | Meaning                                              | Trust weight                             |
| -------------------- | ---------------------------------------------------- | ---------------------------------------- |
| ✅ Verified present  | Engine observed it directly.                         | Positive signal. Not proof of safety.    |
| ✅ Verified absent   | Engine observed absence in a place it must exist.    | Negative signal. Actionable.             |
| 🚫 Not detected      | No matching artifact found. May be absent or hidden. | Weak negative. Requires confirmation.    |
| ❓ Not verified      | Engine could not determine state.                    | Neutral. **Never treat as pass.**        |
| — Not applicable     | Rule does not apply at this maturity/stack.          | Excluded from score.                     |
| ⏸ Deferred           | Applies later.                                       | Excluded from score.                     |
| ⚠️ Present but wrong | Engine observed an incorrect implementation.         | Negative signal. Specific fix available. |
| 🔴 Fail              | Engine observed a definite failure.                  | Release-blocking.                        |

---

# Appendix B — What this report cannot see

This is a process-and-hygiene audit. It is not a penetration test. It is not a compliance certification. It is a map of what is missing and what is broken, in the order that matters.

**The engine cannot see:**

- Whether the system is correct for its domain.
- Whether the authorization model is sound.
- Whether the data model matches the business.
- Whether the threat model is realistic.
- Whether the dependencies contain reachable vulnerabilities.
- Whether the git history contains secrets.
- Whether the backups actually restore.
- Whether the deploy actually rolls back.
- Whether the app behaves correctly under load.
- Whether the operators can diagnose an incident at 3am.

**The engine can see:**

- Whether artifacts exist.
- Whether specific patterns are present or absent.
- Whether source files contain certain constructs.
- Whether the repository structure matches known-good shapes.

**The gap between these two lists is where real risk lives.**

---

# Appendix C — Detection facts

```yaml
maturity: prototype
languages: [javascript]
frameworks: [express]
package_managers: [node]
databases: [mysql]
platforms: [server]
flags: [has:database]
metrics:
  commits: 0
  contributors: 0
  tags: 0
  branches: 0
  files: 9
```

**Maturity signals:** 0/7.5 — no tests, no CI, no CHANGELOG, no release tags, no meaningful history, no security policy, no container, no monitoring, no contributing guide. → prototype.

**Rule packs loaded (17):** core/repo, core/security, core/supply-chain, core/foundation, core/provenance-cosign, core/architecture, core/code-quality, core/testing, core/testing-assurance, core/cicd, core/release, core/dependencies, core/documentation, core/future-readiness, stacks/node-typescript, stacks/data, stacks/api-backend.

**Rule packs skipped as not applicable (15):** core/provenance-attestation, stacks/python, stacks/go, stacks/rust, stacks/jvm, stacks/web-frontend, stacks/mobile, stacks/containers, stacks/iac, stacks/solidity, stacks/ml-ai, stacks/cli, stacks/compliance, stacks/ai-era, stacks/swift.

---

_Report generated by USA. Scores are reproducible: re-run with the same rules and depth to compare. Automation coverage 73.8% — the remaining 26.2% is in the judgement queue and requires human review before it can be marked pass or fail._

_The most important sentence in this report: **Missing evidence is not evidence of safety.**_
