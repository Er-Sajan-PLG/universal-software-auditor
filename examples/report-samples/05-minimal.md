> **Status: SPECIFIED — proposal only, not implemented.**
>
> No renderer exists for this format; nothing below is emitted by USA itself.
> What would graduate it: a renderer plus automated coverage plus an ADR recording the decision.
> Honesty note (live-assurance-phase ADR): every score and finding below is illustrative
> fiction about the invented demo-app project, never a measured fact.

# Sample 05 — Minimal report (CI-pipeline terse)

One screen for the pipeline: gate verdict first, counts second, delta third, links
last. Designed to be read in the ten seconds before the merge button.

## Gate

Gate: FAIL — 2 CRITICAL findings block merge on demo-app at commit a1b2c3d.
<!-- usa:allow-claim -->

## Counts

GOOD 21, FAIL 4, WRONG 5, MISSING 45, NEEDS REVIEW 27, overall 62.4 out of 100.
<!-- usa:allow-claim -->

Severities blocking the gate: CRITICAL 2, HIGH 0; non-blocking: MEDIUM 7, LOW 17,
FUTURE 29. <!-- usa:allow-claim -->

## Delta

Score plus 4.1 points versus baseline e4f5g6h; 2 CRITICAL closed, 1 MEDIUM opened,
queue down from 31 to 27. <!-- usa:allow-claim -->

## Links

- Full evidence companion: https://github.com/Er-Sajan-PLG/universal-software-auditor
- Assurance companion: https://github.com/Er-Sajan-PLG/universal-software-auditor
- Sprint companion: https://github.com/Er-Sajan-PLG/universal-software-auditor

## When to pick this format

Pick the minimal view when the reader is a pipeline or a hurried human: verdict,
counts, delta, links, done. Everything else is one click away.
