# 34. Live sessions: deterministic state machine, stubbed intelligence

- **Date:** 2026-09-14
- **Status:** Accepted

## Context

An audit that only runs batch leaves the interesting work — the interview,
the triage walkthrough, the "what does this mean?" — scattered across chat
transcripts nobody kept. The live phase (ADR-0030) needs a session: one
command, phase by phase, with a transcript artifact at the end. The naive
design awaits the model between steps and dies without a key; a session that
cannot run offline is a second tool wearing USA's name.

## Decision

**`usa live` is a deterministic state machine first, a model client second.**

- `src/live/session.ts` is pure: `advance(state, input)` moves
  idle → foundation → audit → triage → report → done on explicit commands;
  unknown input stays put with a help line — never throws on user text, never
  mutates. `renderTranscript` emits markdown with no timestamps, so
  transcripts are deterministic and diffable.
- `src/live/runner.ts` drives the phases reusing existing machinery
  (interview builders, `runAudit`, `renderMarkdown`) — composition, not
  re-implementation. Model turns go through an injected `ChatFn` defaulting
  to the agent layer; without a configured provider each turn prints a loud
  skip and appends a `tool` line instead of a `model` line. Conversation
  lost, correctness kept, exit 0.
- The CLI entrypoint already distinguished sync from async results, so the
  widened `main` return needed no entrypoint change — only the type.

## Rationale

1. **Testability is the feature.** Pure reducer + injected chat means the
   whole session is unit-testable with zero network; a test attempting egress
   fails by construction (the stub throws on unexpected calls).
2. **Deterministic-only is a mode, not an error.** No key, no network, throwing
   stub — all degrade to the same loud, complete run. The session never needs
   intelligence to finish; intelligence only makes it conversational.
3. **Transcript over memory.** The session's value outlives the run as a
   markdown artifact: decisions recorded with phase tags, re-auditable later.

## Consequences

**Good:** `usa live` works today with no provider configured; providers plug
in without touching the state machine; transcripts give agents and humans a
shared, reviewable record.

**Bad:** the session is deliberately linear (no branching, no backtracking
beyond re-running) — real conversations wander, and wandering is out of scope
until someone proves the linear form insufficient.

**Neutral:** triage walks at most 50 UNKNOWN findings per session; beyond
that the queue, not the session, is the tool. Model turns are tagged
`[phase]` so prompts stay auditable in the transcript.
