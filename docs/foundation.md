# Foundation readiness

Some audits fail before the first rule runs — not because the code is bad, but
because nobody wrote down what the project is for. Foundation readiness checks
whether that groundwork exists: a stated vision, explicit intents, and
per-pillar evidence, recorded before the deeper audit grades the
implementation.

The interview is a conversation — with a person, or conducted by an agent —
and its output is a file: `.usa/foundation.yaml`. The FND rule pack reads that
file, and the report renders a Foundation Readiness section grading each
pillar as READY, PARTIAL, or MISSING alongside the ordinary findings.

## The workflow: vision, then intent, then verify

### Vision

One honest paragraph: what the project is for, who it serves, and what it
explicitly is not. Everything below hangs off this — an intent that does not
serve the vision is scope creep wearing a badge.

### Intent

Explicit statements of what the project promises: the behaviours, guarantees,
and constraints the team stands behind. Each intent names how it will be
recognised when it holds, so verification is a lookup rather than an argument.

### Verify

Evidence per pillar that the vision and intents are real: pointers to docs,
owners, tests, environments, pipelines, and standards the project actually
follows. A claim without a pointer is a wish; the interview keeps wishes out
of the file.

## The seven pillars

| Pillar       | What the interview asks                                               |
| ------------ | --------------------------------------------------------------------- |
| Docs         | Is the vision written down where a newcomer will find it?             |
| Governance   | Who decides, who owns each area, and how exceptions are recorded?     |
| AI readiness | Can an agent work here safely — instructions, guardrails, provenance? |
| Testing      | What proves the intents hold, and how often does it run?              |
| Environment  | Can a newcomer reproduce the setup from a clean machine?              |
| Pipelines    | Does every change travel the same reviewed, checked path to release?  |
| Standards    | Which external bars apply, and where is compliance shown?             |

Each pillar maps to a group of foundation rules (ranges along the lines of
FND-001…FND-012 for the first pillar, and similar groupings for the rest). The
rule pack owns the exact mapping — the interview file only records the
answers, never rule titles.

## The interview file

`.usa/foundation.yaml` is the recorded interview. It lives beside
`.usa.yaml` rather than inside it: audit configuration says how USA runs, the
foundation file says what the project is. See [Configuration](configuration.md)
for the audit side.

A complete example, with the reasoning behind each field:

```yaml
# .usa/foundation.yaml — the recorded foundation interview.
# Written by a person or an agent; read by the FND rule pack.
# Rule ranges noted below are indicative groupings only — the rule pack owns
# the exact mapping, so this file records answers, never rule titles.

version: 1

# ── Vision ────────────────────────────────────────────────────────────
# One paragraph: what the project is for, who it serves, what it is not.
# Informative grouping along the lines of FND-001…FND-012.
vision:
  statement: 'A self-hosted checklist app for small teams, fast over fancy.'
  audience: 'Teams of two to twenty who want shared state without accounts.'
  non_goals:
    - 'No real-time collaboration beyond shared lists.'
    - 'No mobile clients; the web UI is the product.'

# ── Intents ───────────────────────────────────────────────────────────
# Explicit promises. Each names how it will be recognised when it holds, so
# verification is a lookup rather than an argument.
# Informative grouping along the lines of FND-013…FND-024.
intents:
  - id: 'offline-first'
    statement: 'Lists remain readable and editable with no network.'
    recognised_by: 'Airplane-mode walkthrough in the release notes.'
  - id: 'single-binary-deploy'
    statement: 'Deployment is one artifact with no external services.'
    recognised_by: 'The deploy guide finishes in one page.'

# ── Pillars ───────────────────────────────────────────────────────────
# Per-pillar evidence: pointers, never prose claims. A claim without a
# pointer is a wish — leave the field empty rather than inventing one.
# Informative groupings along the lines of FND-025 onward, one range per
# pillar; the rule pack defines the exact correspondence.
pillars:
  docs:
    # Where a newcomer finds the vision and the guides that matter.
    evidence:
      - 'README.md'
      - 'docs/getting-started.md'
  governance:
    # Who decides and who owns each area.
    owners:
      - 'area: product, owner: sam'
      - 'area: security, owner: jo'
    exceptions: 'Recorded as ADRs under docs/adr.'
  ai-readiness:
    # What lets an agent work here safely.
    instructions: 'AGENTS.md'
    guardrails: 'Agents may not merge without human review.'
  testing:
    # What proves the intents hold.
    suites:
      - 'unit: npm test'
      - 'walkthrough: docs/release-checklist.md'
  environment:
    # Reproducing setup from a clean machine.
    setup: 'README.md#setup'
    pinned: 'Node version pinned in .nvmrc.'
  pipelines:
    # The path every change travels to release.
    checks: 'CI runs lint, tests, and the audit on every pull request.'
  standards:
    # Which external bars apply and where compliance is shown.
    applies:
      - 'bar: accessibility basics, shown_by: docs/a11y-notes.md'
```

Empty fields are honest: a pillar with no evidence grades MISSING, which is
the report telling the truth, not a failure to fill in a form. Never mark a
pillar ready without a pointer — a foundation that invents readiness is worse
than none, because the audit downstream trusts it.

## How readiness is graded

Each pillar counts its applicable foundation findings: READY means every
applicable check passes, PARTIAL means some are open, MISSING means none pass.
Suppressed and not-applicable findings do not move the grade — accepted risk
is already listed under Accepted Risk, not re-litigated here. Pillars with no
applicable checks are omitted rather than graded on nothing.

When the audit finds no foundation rules at all, the report renders exactly as
it would without them — there is no empty section, only the grades when there
is something to grade.

## Next steps

- [Getting started](getting-started.md) — run the first audit with the
  foundation in place
- [Configuration](configuration.md) — the `.usa.yaml` audit-configuration side
- [Agent integration](agent-integration.md) — the agent-conducted interview
  playbook
