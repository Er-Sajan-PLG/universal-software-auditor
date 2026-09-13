# 29. Foundation readiness: declared intent, deterministic verification

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

The roadmap is graduated, but every real audit starts one step earlier than
any rule: _what is this project trying to be, and is its setup ready for
that?_ New repos drown in "is this done yet?" — docs, governance, guidelines,
AI-readability, testing, environment, pipelines, standards, specs — and mature
repos drift from the vision that justified them. Nobody had written down what
"ready" means for _this_ project, so nobody could check it.

The tempting design is an LLM judge: feed the repo to a model, ask "is the
foundation ready?" That crosses the spine's oldest line (ADR-0013: no LLM in
the deterministic core) and produces the exact failure the judgement queue
exists to contain — confident invention without evidence. A model may opine;
only the engine may verify.

## Decision

**Intent is declared by humans, verified deterministically, judged by agents —
three roles, three places, never mixed.**

**1. `.usa/foundation.yaml` records the interview.** `usa foundation init`
asks vision, intents, stage target, and per-pillar promises (docs, governance,
ai-readiness, testing, environment, pipelines, standards) and writes a
commented, hand-editable file — or `--non-interactive` writes defaults for
CI/sketching. An agent may conduct the same interview conversationally and
write the same file (see the agent-integration playbook); the file is the
contract either way. It lives beside `.usa.yaml`, not inside it: audit
configuration says how USA runs, the foundation file says what the project is.

**2. Intents become facts; rules do the checking.** The loader turns
`intents[]` into `intent:<value>` flags before pack selection, so intent-gated
rules (FND-014 on `intent:api`) apply exactly where promised. A broken intent
file warns loudly and asserts nothing — an audit must never run half an
intent, but it must still run. The `core/foundation.yaml` pack (FND-001–014)
checks the checkable shadow of intent with existing deterministic kinds:
presence of docs/governance/AI-instructions/tests/env/pipelines/specs. Every
rule carries a `pillar:<id>` tag, copied onto its finding.

**3. The report grades per pillar; agents judge alignment.** A Foundation
Readiness section groups FND findings by pillar tag (READY/PARTIAL/MISSING).
Whether the setup serves the _vision_ — the part no grep can settle — stays
where judgement lives: the queue, the agent, the human. RULE 4 applies to
foundations too: never mark ready without evidence.

## Rationale

1. **The spine stays LLM-free.** The interview is a deterministic
   questionnaire; the only intelligence in the loop is the human who answers
   and the agent who reviews — both outside `src/engine`.
2. **Intent is data, so it composes.** Facts flow through the existing
   predicate machinery (`applies_when` on `intent:api`); no evaluator changes
   were needed, only a loader and forty lines of audit wiring.
3. **Pillar tags are cheap provenance.** Copying `rule.tags` onto findings
   costs one field and gives the report, JSON consumers, and future gates a
   stable grouping key.

## Consequences

**Good:** "is the setup ready?" becomes an audit artifact instead of a
recurring meeting; new repos get a concrete definition of done, mature repos
get drift detection against their own promises; `usa foundation init` gives
agents a structured way to ask about vision without inventing answers.

**Bad:** fourteen universal rules fire on every project without a foundation
file (by design — an undeclared setup reads as MISSING), which lowers day-one
scores until `init` runs; the new-code gate (ADR-0024) is the recommended
rollout. Interview answers are self-reported promises, trusted like
suppression reasons — same trust boundary.

**Neutral:** pillar grades derive from finding counts, not weights — a pillar
with one rule counts the same as one with five. Vision text is never scored,
only displayed; scoring prose would be the LLM-judge failure wearing a number.
