# 23. Triaged judgement queue, and reviews are dated provenance

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

The Judgement Queue is the tool's headline workflow: it lists every applicable
rule the engine could not settle (`UNKNOWN`), and a human or agent works it. Two
problems made that queue harder than it needed to be.

**1. The queue was flat.** ADR-0021 classified every rule by how much the engine
can decide (`full`, `assist`, `manual`), but that classification stopped at
`usa standards` — it never reached the report. So a rule that needs only a
permission grant or a committed artifact (`command`, `oracle` — automatability
`assist`) sat in the same list, with the same ❓, as one that needs threat
modelling (`manual`). The two call for completely different work: one is "let the
tool run", the other is "reason about it". A wall of identical rows hides that.

**2. A queue that is never remembered is worked twice.** The tool had no
`last-reviewed` concept at all. Once someone read a judgement item and confirmed
it, the next audit showed it again with no record that a human had already looked
— so either it was re-litigated every run, or it was suppressed to make it stop,
which is worse: a suppression says "stop reporting this" (ADR-0007/0022), and
that is not the same as "I looked and it is still open."

The queue needed two things the data already implied: the automatability split,
and a dated record of attention.

## Decision

**The judgement queue is split by automatability, and a review records dated
human attention without hiding anything.**

**1. Every finding carries its rule's automatability.** `evaluateRule` sets
`finding.automatability` from `ruleAutomatability(rule)` (ADR-0021's derived
value). Hand-built findings may omit it; the report treats an absent value as
`manual` — fail closed, because automation we cannot confirm needs a human.

**2. The queue is split accordingly.** `renderJudgementQueue` partitions the
`UNKNOWN` findings:

- **⚙️ Assisted — the tool settles these once.** `assist` rules (`command`,
  `oracle`). The report says plainly how to settle them: enable
  `--allow-commands`, or commit the artifact the check reads.
- **🧠 Judgement — reasoning required.** `manual` rules. These are the ones that
  need a person or an agent, and nothing else moves them.

**3. A `reviews:` ledger records dated provenance.** `.usa.yaml` gains a
`reviews:` list. A review is **not** a suppression and never changes a verdict —
it attaches to a still-open finding:

```yaml
reviews:
  - rule: SEC-015
    reviewed: 2026-09-01
    until: 2027-03-01
    by: sajan
    note: 'Ownership check confirmed on the routes that matter.'
```

A review carries the same `file`/`line` site scoping as a suppression (ADR-0022):
a rule-wide review vouches for the finding whatever its locations, a site-scoped
one only when a location falls inside the site. PASS, SKIPPED, and suppressed
findings are never reviewed — a suppression already recorded the decision.

**4. Staleness is visible, not silent.** A review may carry an `until`
re-review deadline. Once past, the item is **stale**: the section table gains a
**Review** column (`reviewed/total recorded` with `⏳N overdue`), the queue's
**Last reviewed** column shows `date (Nd ago) · due … · ⚠️ overdue`, and the audit
warns. `reviewAgeDays` and `reviewOverdueDays` are pure functions of the report
date, so a report rendered later ages honestly.

**5. Unused and malformed reviews are reported.** A review that matched no
finding is dead provenance and warns (`review for SEC-015 matched no finding —
remove it or re-target it`), the ESLint unused-directive model applied to
attention rather than excusal. A review with an unparseable `reviewed`/`until`
date is dropped with a warning — a deadline we cannot read must not look like
freshness (fail closed, ADR-0009).

## Rationale

1. **The split is already in the data.** Automatability was derived in ADR-0021
   precisely so it could not drift from the check kind. Surfacing it costs one
   field and turns the queue from a list into a plan.
2. **Attention deserves provenance, not erasure.** The old choices were
   re-litigate or suppress. A dated review is the missing third option: it keeps
   the item visible (so it is still honestly open) while recording that a human
   has seen it, and when they should see it again.
3. **Reviews reuse the suppression site model.** `file`/`line` and the unused
   report are the exact semantics ADR-0022 just established; reusing them means
   one mental model, not two. A shared `util/site.ts` keeps the glob logic in
   one place.
4. **Staleness is a fact, not a nag.** `until` lets a team say "revisit this in
   six months" and have the tool remember, instead of relying on a calendar
   reminder that is wired to nothing.

## Consequences

**Good:** the queue tells a human which items the tool will clear and which need
thought; a confirmed judgement item can be recorded once and shows its age next
to the confidence it protects; overdue re-reviews surface in the same table as
confidence, so staleness is not buried; dead reviews decay like dead
suppressions. `automatability` and `review` ride the JSON and SARIF renderers
too, so downstream gates can filter on them.

**Bad:** the report gains two columns and the queue a subheading, which is more
to read; the section table can wrap on narrow terminals. A review is a promise
the tool cannot verify — it records that someone said they looked, not that they
did, which is the same trust boundary as a suppression reason. `until` is
advisory: an overdue review warns and is marked, but it does not change a score
or block a gate, because a review is provenance, not a verdict.

**Neutral:** `automatability` is now on the `Finding` (an additive optional
field) and in the JSON schema; the trailer is unchanged, so `usa diff` is
unaffected. The `reviews:` list is a new config section with the same validation
posture as `suppressions:` — invalid entries are dropped loudly, valid ones are
matched deterministically and reported when they match nothing.
