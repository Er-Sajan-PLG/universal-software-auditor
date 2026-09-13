# 22. Suppressions are site-level, and unused ones are reported

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

`.usa.yaml` suppressions were **rule-wide**: `{rule, reason, until}` excused
every finding the rule produced, anywhere in the tree. That is the right tool
for "we accept this risk wholesale" (ADR-0007) and the wrong tool for the far
more common case: one vendored file, one legacy script, one known N+1 in an
admin panel — while the same rule must keep firing everywhere else.

The rule-wide model forced a bad choice. To excuse one location you had to
either suppress the whole rule and lose its coverage everywhere, or disable it
via `rules.<id>.disabled` and lose it from the report entirely — the exact
failure ADR-0007's "accepted risk stays visible" was written to prevent. The
missing axis was **where**: a waiver should be able to name the site it
excuses and nothing more.

A second, quieter problem: a suppression that no longer matched anything — the
finding was fixed, the file was renamed, the rule changed — stayed in the
config forever, invisibly. Nothing distinguished a load-bearing waiver from
dead text. Every exception system eventually rots this way; ESLint solved it
with `--report-unused-disable-directives`.

## Decision

**A suppression may be scoped to a site, and a suppression that suppresses
nothing is reported.**

**1. Two shapes, one field.** A suppression keeps its rule-wide form. Adding a
`file` glob (and optionally a `line`) makes it site-level:

```yaml
suppressions:
  - rule: PERF-005 # rule-wide: every finding, everywhere
    reason: 'Known N+1; 40 rows max.'
  - rule: SEC-004 # site-level: only this file
    file: 'scripts/legacy/**'
    reason: 'Vendored legacy script; replaced in Q3.'
  - rule: CQ-010 # one line of one file
    file: 'src/parser.ts'
    line: 42
    reason: 'Generated table; refactor tracked in #123.'
```

A bare filename (`old.js`) is anchored with a leading `**/` so it matches at
any depth; a glob containing `/` is matched as written.

**2. A site waiver excuses locations, not findings.** `applySuppressions`
splits a finding's locations into those an entry matches and those it does not.
If every location is excused the finding is suppressed (`suppressedReason`
set, locations cleared). If some survive, the finding **stays active** with the
excused locations removed — a waiver can never hide more than it names. A
rule-wide entry, by contrast, excuses the finding as a whole, including a
location-less repo-level MISSING; a site-level entry leaves a location-less
finding untouched, because a waiver naming one file must not silence a
repo-wide failure.

**3. Usage is tracked, and the audit reports the dead.** The index marks an
entry `used` when it suppresses at least one location. After evaluation,
`runAudit` warns for every unused entry: `suppression for SEC-004
(scripts/legacy/**) matched no finding — remove it or fix the target`.

**4. Expiry is unchanged and still fails closed.** The `until` check applies
before indexing (ADR-0007); a site waiver expires by the same rule. The
Accepted Risk table gains a **Where** column whenever any suppressed finding
has a location, so a site waiver is reviewable at its exact `file:line`.

## Rationale

1. **Scoping is the missing axis.** Rule-wide waivers answered "what" and
   "why"; they could not answer "where". Without `where`, the only way to
   excuse one place was to lose the rule everywhere — a worse outcome than the
   finding.
2. **A waiver must not over-suppress.** Removing only the matched locations
   means a partial waiver produces a partial finding. The alternative — "if any
   location matches, hide them all" — would let one vendored file excuse an
   unrelated secret elsewhere. That is the failure mode this ADR exists to
   avoid.
3. **Dead waivers are debt.** Reporting unused entries turns suppressions from
   append-only text into a reviewed list. It also catches typo'd globs and
   renamed paths at the next audit, not never.
4. **It matches the tool users already know.** The `file`/`line`/unused model
   is ESLint's; the mental model transfers, so the behaviour is unsurprising.

## Consequences

**Good:** one vendored file can be excused without blinding the rule to the
rest of the tree; the Accepted Risk table shows exactly what was waived and
where; stale waivers surface as warnings and get cleaned up. The rule-wide
form is unchanged, so every existing `.usa.yaml` keeps working.

**Bad:** a partial waiver leaves a finding active with fewer locations, which
is subtly different from both "passed" and "suppressed" — the report must make
the remaining locations visible (it does) and the score still counts the
finding (it should, since real unmatched violations remain). Config authors
must now understand that `file` narrows rather than replaces.

**Neutral:** `file` globs are matched against the finding's location paths,
which are repository-relative; a glob written against an absolute path will
not match and will be reported as unused. The mechanism adds one index build
and a linear pass per suppressed rule — bounded and deterministic.
