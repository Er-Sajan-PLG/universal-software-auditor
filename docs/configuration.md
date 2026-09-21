# Configuration — `.usa.yaml`

Generate one with `usa init`. Every field is optional; a missing file is fine.

```yaml
version: 1

# ── Lifecycle stage ────────────────────────────────────────────────────────
# Override auto-detection: prototype | mvp | beta | production | legacy
maturity: production

# ── Rule packs ─────────────────────────────────────────────────────────────
include: [stacks/solidity] # force on, regardless of detection
exclude: [stacks/mobile] # force off

# ── Per-rule overrides ─────────────────────────────────────────────────────
rules:
  DOC-003:
    severity: LOW
    reason: 'Docs live in Notion, not the repo (decision: ADR-014)'
  SEC-042:
    disabled: true
    reason: 'No user-facing auth in this worker'
  CQ-010:
    weight: 4

# ── Accepted risk ──────────────────────────────────────────────────────────
suppressions:
  # Whole rule, everywhere.
  - rule: PERF-005
    reason: 'Known N+1 in the admin panel; 40 rows max.'
    until: '2026-12-31'
  # One file (glob), optionally one line — everything else stays active.
  - rule: SEC-004
    file: 'scripts/legacy/**'
    reason: 'Vendored legacy script; replaced in the Q3 migration.'

# ── Recorded reviews ───────────────────────────────────────────────────────
# Provenance, not a waiver: a review does not change a verdict, it records that
# someone examined an open item and when to look again. Same file/line scoping
# as a suppression.
reviews:
  - rule: SEC-015
    reviewed: '2026-09-01'
    until: '2027-03-01'
    by: sajan
    note: 'Ownership check confirmed on the routes that matter.'

# ── Indexing ───────────────────────────────────────────────────────────────
ignore: # extra globs, on top of .gitignore + USA defaults
  - 'generated/**'
  - 'vendor/**'

# ── Facts ──────────────────────────────────────────────────────────────────
facts: # assert what detection could not infer
  - 'has:database'
  - 'platform:server'

# ── Documentation universe ─────────────────────────────────────────────────
docs:
  universe: true # include the documentation-universe audit in `usa audit`
```

## Field reference

| Field                 | Type                                                 | Effect                                                                                                   |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `version`             | `1`                                                  | Schema version                                                                                           |
| `maturity`            | stage                                                | Overrides auto-detection; changes dampening and the expected band                                        |
| `include`             | pack ids                                             | Force packs on even when `skip_when` says no                                                             |
| `exclude`             | pack ids                                             | Force packs off                                                                                          |
| `rules.<id>.severity` | severity                                             | Re-grade one rule (must be on the ladder, else ignored with a warning)                                   |
| `rules.<id>.weight`   | number                                               | Change how much it moves the score (finite, ≥ 0, else ignored with a warning)                            |
| `rules.<id>.disabled` | bool                                                 | Skip entirely (still listed as ➖ SKIPPED)                                                               |
| `rules.<id>.reason`   | string                                               | **Required in practice** — an override with no reason is an unaudited decision                           |
| `suppressions[]`      | `{rule, reason, until, file?, line?}`                | Excluded from the score, listed under Accepted Risk                                                      |
| `reviews[]`           | `{rule, reviewed, until?, file?, line?, by?, note?}` | Dated human-review provenance on open findings (never changes a verdict)                                 |
| `ignore`              | globs                                                | Extra paths to keep out of the index                                                                     |
| `facts`               | fact strings                                         | Assert detection facts manually (`ns:value`)                                                             |
| `sections`            | section ids                                          | Restrict the report to these sections                                                                    |
| `docs.universe`       | bool                                                 | Run the [documentation universe](documentation-audit.md) audit inside `usa audit` (DOCU findings in S12) |

## Foundation interview file

Project vision, intents, and per-pillar evidence live in
`.usa/foundation.yaml` — a sibling of this file, not a field in it. Audit
configuration says how USA runs; the foundation file says what the project
is. See [Foundation readiness](foundation.md) for the workflow, the pillars,
and a commented example. The FND rule pack reads that file; everything on
this page stays as it is.

## What is indexed

The file index skips, in order:

1. `.git/`
2. `DEFAULT_IGNORES` — `node_modules/`, `dist/`, `build/`, `.next/`, `venv/`, `target/`, media, archives, binaries
3. Your `.gitignore`
4. `ignore:` from `.usa.yaml`

Lockfiles **are** indexed (a rule asking "is a lockfile committed?" has to see them)
but are never grepped — they are huge and full of false positives. Files over 2 MB
and anything with a NUL byte in the first 8 KB are skipped as binary.

## Scale limits (honest, not silent)

Two caps bound every audit, and both report instead of absorbing:

- **60,000 files** — indexing stops and the audit warns that the tree is
  bigger than it can see. Treat PASS verdicts as partial; split the target
  (e.g. per-package audits) rather than trusting full coverage.
- **2 MB per file** — oversized files are skipped, counted once each, and
  reported (`N file(s) skipped for exceeding …`). Content checks cannot
  see them; a secret in a 9 MB amalgamation will not be found.

Both warnings print on stderr and ride with the report. An auditor that
silently truncates is an auditor that invents confidence — see ADR-0009.

Build-output checks therefore use `tracked_absent`, which asks git what is tracked
rather than what is on disk:

```yaml
- id: REPO-007
  check:
    kind: tracked_absent
    patterns: ['dist/**', 'build/**', 'node_modules/**']
```

## Rules of thumb

**Prefer `facts:` over `ignore:`.** If detection is wrong, say what is true:

```yaml
facts: ['has:database', 'orm:prisma']
```

**Prefer a suppression over disabling a rule.** A suppression stays visible in the
report under Accepted Risk; a disabled rule disappears and takes its knowledge with it.

**Scope a suppression to the site you are excusing.** A suppression with `file`
(a glob, optionally `line`) hides only the matching locations; a finding that
still has unmatched locations stays active with those locations kept. This is
the deliberate difference between "this one place is fine" and "we never want to
see this rule again" (ADR-0022).

**Unused waivers are reported.** A suppression that suppressed nothing this run
— a fixed finding, a renamed file, a rule that no longer fires — is listed in
the audit warnings so exceptions decay instead of accumulating. Delete it or
fix its target.

**Waivers expire — and expiry fails closed.** An `until` date in the past, or
one that cannot be parsed as a date, excludes the suppression with a warning
and the finding reports normally. Use unambiguous ISO dates (`2026-12-31`).
An audit must never silently honour dead risk acceptances (see ADR-0007).

**A review records attention; it does not excuse.** `reviews:` attaches a
`reviewed` date (and an optional `until` re-review deadline) to a still-open
finding. It changes no verdict and hides nothing — it is provenance, so the next
audit shows the item with its age instead of pretending no one has looked. A
review whose `until` has passed is marked stale in the section table and the
queue, and warns. A review that matched no finding also warns, so the ledger
decays instead of accumulating (ADR-0023). Reviews take the same `file`/`line`
scoping as suppressions, and a review with an unparseable date is dropped
(fail closed).

**`include` forces packs on wholesale.** A force-loaded pack applies all its
rules regardless of depth and `applies_when` — that is the documented
contract, and the operator is responsible for what they force on.

**Keep `.usa.yaml` in the repo.** It is the audit trail for every exception you
have taken. A reviewer should be able to read it and understand what the team decided.
