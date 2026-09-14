# 39. Serve audits on localhost first, with the threat model written down

- **Date:** 2026-09-15
- **Status:** Accepted

## Context

The web version of USA arrives in phases. Phase 1 (static HTML reports)
shipped with no attack surface. Phase 2 — a server that runs audits for
browser and API clients — executes the engine on operator-chosen targets
in a long-lived process. That is new exposure and gets a written threat
model before code, not after an incident.

## Decision

Slice 1 is `usa serve`: loopback-only HTTP, bearer-token auth, local
targets only, one audit at a time. No remote exposure, no multi-user
pretense.

## Threat model (slice 1)

- **Cross-origin drive-by (malicious website → localhost).** A page the
  operator visits can make simple cross-origin requests. Answered by
  design: every state-changing and data route requires an
  `Authorization: Bearer` header, which makes requests preflighted, and
  the server sends no CORS headers, so browsers refuse. No cookies, no
  ambient authority — the token is a secret the operator pastes, printed
  once at startup.
- **Malicious target content.** The audited tree is untrusted input. The
  engine already treats it that way (deterministic file reads, no
  execution of target code), and the same guarantees cover the server:
  targets are read, never run. Model output, where present, stays
  proposal-only per ADR-0030.
- **Path escape (`--out ../../..`, target outside intent).** Targets must
  exist and resolve inside explicit `--allow-root` directories (default:
  the working directory), using the same resolve-and-verify containment
  as the object store (SEC-010). Symlink and `..` escapes throw instead
  of serving.
- **Resource exhaustion (huge repos, concurrent jobs).** One running job
  at a time (a second POST gets 409), bounded history, and the engine's
  existing file/count caps apply. The sync engine cannot be
  time-aborted, so there is deliberately no timeout claim in slice 1.
- **Transcript and report exfiltration.** Reports live in process memory
  behind the token, bounded history, no persistence to disk by the
  server itself.

## Explicitly deferred (gates, not backlog)

- Binding anywhere but loopback. Remote exposure requires a reverse
  proxy the operator owns; the server refuses any other bind address in
  code, not just by default flag.
- Multi-user or multi-tenant operation. Per-tenant isolation (AI-007
  reasoning) does not exist here; a second operator changes the model.
- Worker-thread isolation with memory limits and killable timeouts for
  the sync engine. Required before any untrusted-operator or
  high-concurrency phase — the current single-flight design must not be
  mistaken for that.

## Consequences

- `usa serve` is safe to run on a developer machine and unsafe to expose;
  the code, the help text, and this ADR all say so in the same words.
- Every deferred item above is a go/no-go gate for its phase, reviewed
  here before implementation, not discovered after.
