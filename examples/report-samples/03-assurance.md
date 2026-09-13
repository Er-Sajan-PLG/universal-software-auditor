> **Status: SPECIFIED — proposal only, not implemented.**
>
> No renderer exists for this format; nothing below is emitted by USA itself.
> What would graduate it: a renderer plus automated coverage plus an ADR recording the decision.
> Honesty note (live-assurance-phase ADR): every score and finding below is illustrative
> fiction about the invented demo-app project, never a measured fact.

# Sample 03 — Assurance report (testing style)

The testing-assurance story: what was exercised at each level, what coverage really
means here, where the risk-weighted gaps are, how confident each area is, what stops
regressions, and what remains UNKNOWN.

## Inventory by level

Unit: 932 fast tests around pure logic, run on every commit. <!-- usa:allow-claim -->

Integration: 148 tests across service boundaries with test doubles at the edges.
<!-- usa:allow-claim -->

Contract and API: 61 checks pinning request shapes and error behavior. <!-- usa:allow-claim -->

End to end: 12 journeys covering signup, checkout, and refund paths. <!-- usa:allow-claim -->

Manual and exploratory: 5 scripted charters for payments and access control, with
dated reviewer sign-off. <!-- usa:allow-claim -->

## Coverage semantics

Code coverage is not behavior coverage is not requirement coverage is not risk
coverage. This fiction claims 84 percent line coverage but only 9 of 12 critical
user journeys exercised end to end, so the report grades journeys, not lines.
<!-- usa:allow-claim -->

## Risk-weighted gaps

1. Payments refund path: HIGH risk, no end-to-end test, gap owner unassigned.
2. Access-control matrix: HIGH risk, unit-only, needs an integration pass.
3. Backup restore: MEDIUM risk, no drill artifact, judgement item open.
4. Rate limiting: MEDIUM risk, asserted but unverified, needs a dated review.
5. Email templates: LOW risk, snapshot-only, accepted as is.

## Confidence by area

Testing overall: confidence **85.7 percent** of applicable checks verified
automatically. Security: **92.9 percent**. Architecture: **60.0 percent**, with the
rest in the judgement queue. <!-- usa:allow-claim -->

A dagger mark follows any dimension where fewer than half of its applicable checks
could be verified, so a perfect 10 out of 10 never masquerades as certainty.

## Regression protection

The 12 end-to-end journeys plus the 61 contract checks form the regression floor:
any change touching checkout or the public API must keep them green before merge.
<!-- usa:allow-claim -->

Mutation-style spot checks run monthly over payments logic; surviving mutants become
new test tasks rather than silent debt.

## UNKNOWNs

- Whether the staging database mirrors production closely enough for the restore
  drill to mean anything: UNKNOWN, needs an ops answer.
- Whether two flaky checkout tests indicate product or harness faults: UNKNOWN,
  needs a triage session.
- Whether load behavior past 3 times peak traffic holds: UNKNOWN, no rig exists
  to ask the question. <!-- usa:allow-claim -->

## When to pick this format

Pick the assurance view when the question is "how sure are we": release readiness,
testing investment, and honest UNKNOWNs instead of padded percentages.
Background: https://github.com/Er-Sajan-PLG/universal-software-auditor
