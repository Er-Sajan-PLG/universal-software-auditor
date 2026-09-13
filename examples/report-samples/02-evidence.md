> **Status: SPECIFIED — proposal only, not implemented.**
>
> No renderer exists for this format; nothing below is emitted by USA itself.
> What would graduate it: a renderer plus automated coverage plus an ADR recording the decision.
> Honesty note (live-assurance-phase ADR): every score and finding below is illustrative
> fiction about the invented demo-app project, never a measured fact.

# Sample 02 — Evidence report (auditor-grade)

The record an auditor can re-derive: every finding pinned to file and line evidence,
an evidence-strength rating per item, and trailer plus diff references so the whole
report is reproducible from the same commit.

## Findings with file and line evidence

- FAIL — No hardcoded credentials in source, `SEC-001`, CRITICAL.
  Where: `src/config.js:3`, `src/config.js:4`. Evidence strength: DIRECT, snippet
  quoted in the finding body. Fix: move secrets to the environment.
- FAIL — SQL is not built by string concatenation, `SEC-005`, CRITICAL.
  Where: `src/db.js:15`. Evidence strength: DIRECT, one quoted instance.
- WRONG — No plaintext HTTP endpoints in configuration, `SEC-003`, MEDIUM.
  Where: `src/legacy.js:5`. Evidence strength: DIRECT, downgraded HIGH to MEDIUM
  by the MVP profile. Fix: move every non-localhost URL to https.
- MISSING — LICENSE present, `REPO-005`, LOW.
  Where: repository root, no file matching LICENSE pattern. Evidence strength:
  DIRECT, absence confirmed by filename scan.
- MISSING — Backup restore drill on record, `DATA-011`, HIGH.
  Where: no drill log found under `docs/ops/`. Evidence strength: INDIRECT,
  absence of artifact only. Queued for human confirmation.
- NEEDS REVIEW — Dependency pinning policy, `DEP-004`, MEDIUM.
  Where: `package.json:22`. Evidence strength: ASSERTED, awaiting a dated human
  review before it can count either way.

Illustrative tallies for this fiction: 4 FAIL, 5 WRONG, 45 MISSING, 27 NEEDS
REVIEW, 21 GOOD across the demo-app snapshot. <!-- usa:allow-claim -->

## Evidence strength per item

DIRECT means the engine quotes the offending text with a file and line anchor;
INDIRECT means an artifact absence or a derived signal a human should confirm;
ASSERTED means a claim with provenance that is excluded from the score until a
dated review lands. Unverifiable claims never enter the arithmetic.

## Trailer and diff references

Report trailer (illustrative): schema usa-report-v1, demo-app at commit
a1b2c3d, USA version 2.5.0, depth standard, 27 checks to review. <!-- usa:allow-claim -->

Diff reference (illustrative): compare commit a1b2c3d against e4f5g6h to replay
the 4.1 point score movement quoted in the executive companion. <!-- usa:allow-claim -->

Suppression record: 2 suppressed findings, each with rule id, reason, author, and
dated expiry; expired suppressions re-open automatically. <!-- usa:allow-claim -->

## When to pick this format

Pick the evidence view when the reader must verify rather than trust: auditors,
regulators, and post-incident reviews. Every line answers "says who, seen where".
Project home: https://github.com/Er-Sajan-PLG/universal-software-auditor
