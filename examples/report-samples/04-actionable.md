> **Status: SPECIFIED — proposal only, not implemented.**
>
> No renderer exists for this format; nothing below is emitted by USA itself.
> What would graduate it: a renderer plus automated coverage plus an ADR recording the decision.
> Honesty note (live-assurance-phase ADR): every score and finding below is illustrative
> fiction about the invented demo-app project, never a measured fact.

# Sample 04 — Actionable report (developer sprint view)

The sprint view: work sequenced into Sprint 0, 1, 2, and Backlog with owners and
checks, the judgement queue rewritten as a task list with evidence slots, and the
foundation pillar grades up front so nobody builds on sand.

## Sprint 0 — stop the bleeding

- Rotate the hardcoded credential in `src/config.js:3`, owner: Priya. Check: secret
  scanner green plus a dated review on the finding.
- Parameterize the query in `src/db.js:15`, owner: Sam. Check: injection probe suite
  passes and the snippet no longer matches.
- Force https for `src/legacy.js:5`, owner: Sam. Check: config scan shows zero
  plaintext endpoints.

## Sprint 1 — close the HIGHs

- Record a backup restore drill under `docs/ops/`, owner: Ops (unassigned — needs a
  name). Check: drill log plus a dated review.
- Pin dependency ranges in `package.json:22`, owner: Priya. Check: lockfile diff
  reviewed and the NEEDS REVIEW item settled.
- Add the refund-path journey test around `src/payments.js:41`, owner: Jo. Check:
  new end-to-end journey green on the branch.

## Sprint 2 — harden

- Access-control integration pass over `src/auth/matrix.js:18`, owner: Jo. Check:
  matrix test with dated sign-off.
- Rate-limit verification for `src/api/throttle.js:7`, owner: Sam. Check: asserted
  claim converted to DIRECT evidence or dropped.
- Settle the 2 overdue reviews flagged in the queue. <!-- usa:allow-claim -->

## Backlog

- Email template snapshots, LOW, no owner needed until the redesign lands.
- License file selection, LOW, one-line fix waiting for a legal nod.
- Load rig past 3 times peak traffic, MEDIUM, needs budget before scheduling.
  <!-- usa:allow-claim -->

## Judgement queue as task list

- [ ] Confirm backup drill absence is real, evidence slot: `docs/ops/` listing,
      provenance: engine scan, needs: ops owner.
- [ ] Rule on dependency pinning at `package.json:22`, evidence slot: lockfile
      diff, provenance: engine flag, needs: dated human review.
- [ ] Settle rate-limit assertion at `src/api/throttle.js:7`, evidence slot: load
      probe output, provenance: contributor claim, needs: reviewer sign-off.

Queue totals in this fiction: 27 items to review, 18 assisted and 9 manual, with
automation coverage at 71.9 percent. <!-- usa:allow-claim -->

## Foundation pillar grades

Vision: PARTIAL. Intent: READY. Architecture: READY. Delivery: PARTIAL.
Data: MISSING. Operations: PARTIAL. Growth: MISSING.

A MISSING pillar blocks graduation claims above it: data and growth stay MISSING
until the drill log and the load story exist, no matter how green the unit tests
(932 illustrative) look. <!-- usa:allow-claim -->

## When to pick this format

Pick the sprint view when the reader ships the fix: owners, checks, and evidence
slots instead of prose. Standup-ready, merge-gated, boredom-proof.
Source project: https://github.com/Er-Sajan-PLG/universal-software-auditor
