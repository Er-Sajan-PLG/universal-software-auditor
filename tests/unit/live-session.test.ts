import { describe, it, expect } from 'vitest';
import { advance, initialSession, renderTranscript, LIVE_HELP } from '../../src/live/session.js';
import type { SessionState } from '../../src/live/types.js';

function walk(inputs: string[]): SessionState {
  let state = initialSession();
  for (const input of inputs) state = advance(state, input);
  return state;
}

describe('live session reducer', () => {
  it('starts idle with an empty transcript and no facts', () => {
    const state = initialSession();
    expect(state.phase).toBe('idle');
    expect(state.transcript).toEqual([]);
    expect(state.facts).toEqual([]);
  });

  it('walks idle → foundation → audit → triage → report → done on next', () => {
    const state = walk(['next', 'next', 'next', 'next', 'next']);
    expect(state.phase).toBe('done');
  });

  it('jumps on explicit commands foundation/audit/done', () => {
    expect(walk(['foundation']).phase).toBe('foundation');
    expect(walk(['audit']).phase).toBe('audit');
    expect(walk(['foundation', 'audit']).phase).toBe('audit');
    expect(walk(['audit', 'done']).phase).toBe('done');
    expect(walk(['done']).phase).toBe('done');
  });

  it('matches commands case-insensitively with surrounding whitespace', () => {
    expect(walk(['  AUDIT  ']).phase).toBe('audit');
    expect(walk(['Foundation']).phase).toBe('foundation');
    expect(walk([' Done ']).phase).toBe('done');
  });

  it('unknown input stays in phase and appends a help line', () => {
    const before = walk(['audit']);
    const after = advance(before, 'tell me everything about my code');
    expect(after.phase).toBe('audit');
    const kinds = after.transcript.map((e) => e.kind);
    expect(kinds).toContain('user');
    const help = after.transcript[after.transcript.length - 1];
    expect(help?.kind).toBe('tool');
    expect(help?.text).toContain('foundation');
    expect(after.transcript.length).toBe(before.transcript.length + 2);
  });

  it('empty and blank input stays put with help text', () => {
    for (const input of ['', '   ', '\n\t ']) {
      const after = advance(initialSession(), input);
      expect(after.phase).toBe('idle');
      expect(after.transcript[after.transcript.length - 1]?.text).toBe(LIVE_HELP);
    }
  });

  it('never throws on user text, however hostile', () => {
    const hostile = ['\0', 'x'.repeat(100_000), 'done\ndone', 'NEXT\u2028next', '☃️'];
    for (const input of hostile) {
      expect(() => advance(initialSession(), input)).not.toThrow();
    }
    expect(() => advance(initialSession(), undefined)).not.toThrow();
    expect(() => advance(initialSession(), null)).not.toThrow();
  });

  it('never mutates the incoming state', () => {
    const before = walk(['audit']);
    const frozen = JSON.parse(JSON.stringify(before)) as SessionState;
    advance(before, 'next');
    expect(before).toEqual(frozen);
  });
});

describe('renderTranscript', () => {
  it('renders header, phase, facts, and every entry deterministically', () => {
    const a = renderTranscript(walk(['audit', 'hello there', 'next']));
    const b = renderTranscript(walk(['audit', 'hello there', 'next']));
    expect(a).toBe(b);
    expect(a).toContain('# Live session transcript');
    expect(a).toContain('Phase: triage');
    expect(a).toContain('## Transcript');
    expect(a).toContain('### audit · user');
    expect(a).toContain('hello there');
    expect(a).toContain('### audit · tool');
  });

  it('renders an empty session without failing', () => {
    const md = renderTranscript(initialSession());
    expect(md).toContain('Phase: idle');
    expect(md).toContain('(empty)');
  });

  it('carries no timestamps, dates, or durations', () => {
    const md = renderTranscript(walk(['foundation', 'next', 'audit', 'done']));
    expect(md).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(md).not.toMatch(/T\d{2}:\d{2}/);
    expect(md).not.toMatch(/\d+ms/);
  });
});
