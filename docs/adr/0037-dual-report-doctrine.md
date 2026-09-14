# 37. Two reports ship together: raw for machines, narrative for customers

- **Date:** 2026-09-14
- **Status:** Accepted

## Context

ADR-0036 shipped the narrative as a second `--format`, and the canonical
sample flipped to it. Review pushed back, correctly: the checklist sample is
the artifact AI agents, developers, and tooling consume — byte-checked,
section-addressed, machine-trailer embedded. Replacing it with a story removed
the raw substrate from the one file that demonstrates it. Meanwhile the
customer narrative, at its best, says things no renderer can derive (attack
chains with reachability reasoning, SOTA lens tables, effort-weighted phases)
— which is exactly why it must never pretend to be engine output.

## Decision

**Two committed samples, each honest about what it is.**

- `examples/sample-report.md` — the **raw checklist**: engine output, byte-
  checked by `docs:sample`, consumed by agents, developers, and dashboards.
  Deterministic, section-addressed, trailer embedded.
- `examples/sample-report-narrative.md` — the **customer narrative**:
  hand-authored, inspired by seven rounds of review, explicitly **not**
  engine-bounded and **not** byte-checked. Its header says so on the page, so
  no reader mistakes prose for measurement.
- The `--format narrative` renderer stays: it is the deterministic bridge
  between the two (verdict-first projection of the same `AuditReport`),
  tested and reviewed. The hand sample shows where the format goes next;
  the renderer shows what the engine can prove today.

## Rationale

1. **Each consumer keeps its artifact.** Tooling needs byte-stable raw;
   humans need story. One file cannot serve both without lying to one of them.
2. **Honesty is structural.** The narrative sample declares its status in its
   first lines; the raw sample is verified by CI. Neither can drift into the
   other's role silently.
3. **No governance exceptions.** The hand sample passes the same docs gates
   (prettier, links, claims, index) as every other doc — "hand-authored" never
   means "unchecked".

## Consequences

**Good:** `usa audit` keeps one default; docs present both artifacts side by
side; future renderer work has a concrete target that review already approved
in spirit.

**Bad:** two samples can disagree in emphasis (the hand one interprets; the
raw one counts). The headers on both sides state the relationship so the
disagreement reads as designed, not as drift.

**Neutral:** `docs:sample` continues to check exactly one file; the narrative
sample is covered by the standard doc gates like any prose.
