> **Status: SPECIFIED — proposal only, not implemented.**
>
> No renderer exists for this format; nothing below is emitted by USA itself.
> What would graduate it: a renderer plus automated coverage plus an ADR recording the decision.
> Honesty note (live-assurance-phase ADR): every score and finding below is illustrative
> fiction about the invented demo-app project, never a measured fact.

# Sample 01 — Executive report (board-level)

The one-page story for the board: is demo-app shippable, where it stands against its
maturity band, the five risks that matter, what moved since the last review, and the
decisions the board must make now. Detail lives elsewhere; this page carries the call.

## Verdict

**SHIP WITH CONDITIONS** — demo-app is inside its maturity band, but two open
security findings block an unconditional go until the fixes below land.

## Score versus band

Overall health **62.4 out of 100**, against the illustrative MVP band of 45 to 70:
**inside the band**. <!-- usa:allow-claim -->

Automation coverage is **71.9 percent**; the remaining checks sit in the judgement
queue for a human, so the score reflects verified evidence only. <!-- usa:allow-claim -->

Strongest dimension: Architecture at **8.0 out of 10**; weakest: Testing at
**2.1 out of 10**. <!-- usa:allow-claim -->

## Top 5 risks

1. Hardcoded credentials in `src/config.js:3` — CRITICAL, direct file evidence.
2. SQL built by string concatenation in `src/db.js:15` — CRITICAL, one instance.
3. No backup or restore drill on record — HIGH, judgement item awaiting an owner.
4. Plaintext HTTP endpoint in `src/legacy.js:5` — MEDIUM after profile downgrade.
5. Zero regression protection around payments in `src/payments.js:41` — MEDIUM.

Counts above are illustrative samples drawn from 9 open findings of HIGH severity or
worse in this fiction. <!-- usa:allow-claim -->

## What changed since last

Score moved **up 4.1 points** since the previous review, driven by supply-chain fixes;
2 CRITICAL findings closed, 1 new MEDIUM opened. <!-- usa:allow-claim -->

Judgement queue shrank from **31 to 27 items**; 2 reviews are overdue and flagged
with the usual overdue marker. <!-- usa:allow-claim -->

## The ask (decisions needed)

1. Approve slipping the release by one sprint to clear the 2 CRITICAL items.
2. Name an owner for the backup drill (currently unowned in the queue).
3. Accept or reject the 2 suppressions whose dated expiry falls this month.

## When to pick this format

Pick the executive view when the reader signs off rather than fixes: maximum signal,
minimum scrolling, every claim traceable to the evidence and assurance companions.
Full detail: https://github.com/Er-Sajan-PLG/universal-software-auditor
