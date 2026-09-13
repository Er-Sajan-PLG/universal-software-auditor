# 30. Live assurance phase: LLM outside the spine, honesty as a gate

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

The roadmap is graduated and the vision (VISION.md) points past auditing
into live, conversational assurance: sessions, interviews, testing evidence,
direction decisions — with an LLM where reasoning helps. The naive integration
is a model call inside the audit loop. That would trade away everything the
twenty-eight prior ADRs bought: determinism, offline operation, evidence over
claims, producer≠judge. A model that both finds and grades is a judge grading
its own homework, and its verdicts are not reproducible.

## Decision

**The LLM enters as `src/agent/`, a layer beside the spine — never inside it.
And every capability ships labeled with its honesty status.**

**1. Layering.** `src/engine` stays deterministic and offline; it gains no
network dependency and no model client. `src/agent` holds provider presets,
session state, and interview drivers. The contract between them is narrow and
auditable: the agent layer may _read_ reports, trailers, and findings, and may
_propose_ text; only the engine _verifies_ and _scores_. Anything the model
asserts that the engine can check, the engine re-checks; anything it cannot
check rides the judgement queue as a claim with provenance, never as a fact.

**2. Provider posture.** Keys live in environment, never in files. No key (or
no network) degrades to the deterministic core with a loud message — the tool
loses conversation, never correctness. Model lists are fetched live where the
provider supports it, pinned where it does not; parameters (temperature,
reasoning effort, context budget) are explicit config, never hidden defaults.

**3. Honesty discipline (normative).** Every new capability is labeled, in
docs and in reports:
`IMPLEMENTED` (claim → file → symbol → test → observed result),
`PARTIALLY IMPLEMENTED`, `SPECIFIED` (documented, not built), `PROPOSED`, or
`NOT IMPLEMENTED` / `MISSING`. Report formats under selection are
SPECIFIED exemplars until one graduates to a renderer. Converting a proposal
into an implementation claim fails review the way an unmarked numeric claim
fails docs governance. No ✅ without evidence applies to the roadmap too.

**4. Taxonomies derive, never duplicate.** Testing knowledge (level ≠
objective ≠ technique ≠ strategy), future categories, evidence models — all
land as data with derivation functions, following ADR-0021's precedent. A
second framework that redescribes the first is rejected at review.

## Rationale

1. **The spine is the asset.** Offline determinism is what makes USA's scores
   reproducible and its gates trustworthy. The phase is designed so the asset
   can never be spent.
2. **Fail-closed extends to intelligence.** An unverifiable model claim is
   handled exactly like an unverifiable check: surfaced with provenance,
   excluded from arithmetic.
3. **Labels prevent rot.** The testing program's own honesty section becomes
   repository law, so ambition cannot silently outrun implementation.

## Consequences

**Good:** conversational auditing, interviews, and evidence interpretation
without surrendering determinism; provider choice (major presets + custom
endpoints) without lock-in; every ambitious claim carries its status visibly.

**Bad:** duplicated effort at the seam — deterministic heuristics must
approximate what a model sees instantly (assertion quality, intent drift),
and the approximation is honestly weaker; some users will ask why the model
isn't "just allowed" to score (answer: ADR-0006, scores need arithmetic, not
opinions).

**Neutral:** `src/agent` will grow session transcripts and provider code the
spine never imports; the dependency arrow points one way (agent → engine) and
code review enforces it.
