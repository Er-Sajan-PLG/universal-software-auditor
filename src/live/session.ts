/**
 * Live session state machine — pure reducer plus deterministic rendering.
 *
 * The reducer never throws on user text: unknown input keeps the phase and
 * appends a help line. Phase movement happens only on explicit commands
 * (`foundation`, `audit`, `next`, `done`). Rendering carries no timestamps.
 */

import type { SessionPhase, SessionState, TranscriptEntry } from './types.js';

/** Commands the reducer understands (matched case-insensitively, trimmed). */
export const LIVE_COMMANDS = ['foundation', 'audit', 'next', 'done'] as const;

/** One-step walk for `next`, from every non-terminal phase. */
const NEXT_PHASE: Record<Exclude<SessionPhase, 'done'>, SessionPhase> = {
  idle: 'foundation',
  foundation: 'audit',
  audit: 'triage',
  triage: 'report',
  report: 'done',
};

export const LIVE_HELP =
  'Commands: foundation | audit | next | done — ' +
  'any other text is recorded and the session stays where it is.';

/** Fresh session: idle, silent, no facts. */
export function initialSession(): SessionState {
  return { phase: 'idle', transcript: [], facts: [] };
}

function toolEntry(phase: SessionPhase, text: string): TranscriptEntry {
  return { phase, kind: 'tool', text };
}

function userEntry(phase: SessionPhase, text: string): TranscriptEntry {
  return { phase, kind: 'user', text };
}

function move(state: SessionState, phase: SessionPhase, note: string): SessionState {
  return {
    phase,
    transcript: [...state.transcript, toolEntry(state.phase, note)],
    facts: [...state.facts],
  };
}

/**
 * Advances the session on one line of user input. Pure: returns a new state,
 * never mutates, never throws — even non-string input degrades to a help
 * line in the current phase.
 */
export function advance(state: SessionState, input: unknown): SessionState {
  try {
    const raw = typeof input === 'string' ? input : String(input ?? '');
    const cmd = raw.trim().toLowerCase();
    const seen: SessionState = {
      phase: state.phase,
      transcript: [...state.transcript, userEntry(state.phase, raw)],
      facts: [...state.facts],
    };
    if (cmd === 'done') return move(seen, 'done', 'Session complete.');
    if (cmd === 'foundation') return move(seen, 'foundation', 'Entering foundation.');
    if (cmd === 'audit') return move(seen, 'audit', 'Entering audit.');
    if (cmd === 'next') {
      const next = NEXT_PHASE[seen.phase as Exclude<SessionPhase, 'done'>];
      if (next === undefined) return move(seen, 'done', 'Session complete.');
      return move(seen, next, `Entering ${next}.`);
    }
    return {
      phase: seen.phase,
      transcript: [...seen.transcript, toolEntry(seen.phase, LIVE_HELP)],
      facts: seen.facts,
    };
  } catch {
    return {
      phase: state.phase,
      transcript: [...state.transcript, toolEntry(state.phase, LIVE_HELP)],
      facts: [...state.facts],
    };
  }
}

/**
 * Renders the transcript as Markdown. Deterministic: phase names, kinds, and
 * texts only — no timestamps, no dates, no durations.
 */
export function renderTranscript(state: SessionState): string {
  const out: string[] = [];
  out.push('# Live session transcript');
  out.push('');
  out.push(`Phase: ${state.phase}`);
  out.push(`Facts: ${state.facts.length > 0 ? state.facts.join(', ') : '(none)'}`);
  out.push('');
  out.push('## Transcript');
  out.push('');
  if (state.transcript.length === 0) out.push('(empty)');
  for (const entry of state.transcript) {
    out.push(`### ${entry.phase} · ${entry.kind}`);
    out.push('');
    out.push(entry.text === '' ? '(empty)' : entry.text);
    out.push('');
  }
  return out.join('\n');
}
