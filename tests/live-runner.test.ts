import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLiveSession, DETERMINISTIC_SKIP_PREFIX } from '../src/live/runner.js';
import type { ChatFn } from '../src/live/types.js';
import type { ChatRequest, ChatResult } from '../src/agent/types.js';

// No egress by construction: any fetch attempt throws, so a test that
// reaches the network fails instead of hanging or leaking.
const fetchSpy = vi.fn(() => {
  throw new Error('network egress forbidden in live tests');
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy);
  fetchSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeScratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-live-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# scratch\n');
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'scratch', version: '0.0.0' }),
  );
  return dir;
}

function makeHarness(script: (prompt: string) => string | null = () => '') {
  const prompts: string[] = [];
  const lines: string[] = [];
  return {
    prompts,
    lines,
    ask: async (prompt: string): Promise<string | null> => {
      prompts.push(prompt);
      return script(prompt);
    },
    print: (line: string): void => {
      lines.push(line);
    },
  };
}

/**
 * Stub-only LLM: accepts exactly the runner's contract (system + user
 * message with a `[phase]` user turn) and throws on anything unexpected —
 * an egress-shaped or malformed call fails the test, never the network.
 */
function strictStub(calls: ChatRequest[]): ChatFn {
  return async (req: ChatRequest): Promise<ChatResult> => {
    if (req.messages.length !== 2) throw new Error(`unexpected chat call shape`);
    const sys = req.messages[0];
    const user = req.messages[1];
    if (sys?.role !== 'system' || user?.role !== 'user') {
      throw new Error('unexpected chat roles');
    }
    if (!user.content.startsWith('[')) {
      throw new Error(`unexpected chat content: ${user.content.slice(0, 60)}`);
    }
    calls.push(req);
    return { text: `stubbed reply #${calls.length}`, model: req.model };
  };
}

describe('runLiveSession with a stub ChatFn', () => {
  it('drives all phases, calls the stub with expected messages, writes the transcript', async () => {
    const dir = makeScratch();
    const transcriptPath = path.join(dir, 'TRANSCRIPT.md');
    try {
      const h = makeHarness();
      const calls: ChatRequest[] = [];
      const code = await runLiveSession({
        dir,
        ask: h.ask,
        print: h.print,
        chat: strictStub(calls),
        transcriptPath,
      });
      expect(code).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();

      // One model turn per phase, in walking order, each carrying its tag.
      expect(calls.length).toBe(4);
      const tags = calls.map((c) => c.messages[1]?.content);
      expect(tags[0]).toMatch(/^\[foundation\]/);
      expect(tags[1]).toMatch(/^\[audit\]/);
      expect(tags[2]).toMatch(/^\[triage\]/);
      expect(tags[3]).toMatch(/^\[report\]/);
      for (const c of calls) {
        expect(c.messages[0]?.role).toBe('system');
        expect(c.messages[0]?.content.length).toBeGreaterThan(0);
      }

      expect(h.lines.join('\n')).toContain('Live session complete.');
      const transcript = fs.readFileSync(transcriptPath, 'utf8');
      expect(transcript).toContain('# Live session transcript');
      expect(transcript).toContain('Phase: done');
      expect(transcript).toContain('stubbed reply');
      expect(transcript).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records triage evidence answers as file:line decisions', async () => {
    const dir = makeScratch();
    const transcriptPath = path.join(dir, 'T.md');
    try {
      const h = makeHarness((prompt) => (prompt.includes('Evidence for') ? 'src/app.ts:42' : ''));
      const calls: ChatRequest[] = [];
      const code = await runLiveSession({
        dir,
        ask: h.ask,
        print: h.print,
        chat: strictStub(calls),
        transcriptPath,
      });
      expect(code).toBe(0);
      const transcript = fs.readFileSync(transcriptPath, 'utf8');
      expect(transcript).toContain('decision');
      expect(transcript).toContain('src/app.ts:42');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runLiveSession deterministic-only mode', () => {
  it('skips model turns loudly with chat undefined and still completes', async () => {
    const dir = makeScratch();
    const transcriptPath = path.join(dir, 'T.md');
    try {
      const h = makeHarness();
      const code = await runLiveSession({ dir, ask: h.ask, print: h.print, transcriptPath });
      expect(code).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      const skips = h.lines.filter((l) => l.includes(DETERMINISTIC_SKIP_PREFIX));
      expect(skips.length).toBe(4);
      expect(h.lines.join('\n')).toContain('Live session complete.');
      expect(fs.readFileSync(transcriptPath, 'utf8')).toContain('Phase: done');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a throwing chat degrades loudly and still completes', async () => {
    const dir = makeScratch();
    try {
      const h = makeHarness();
      const failing: ChatFn = async () => {
        throw new Error('boom (simulated outage)');
      };
      const code = await runLiveSession({ dir, ask: h.ask, print: h.print, chat: failing });
      expect(code).toBe(0);
      expect(h.lines.join('\n')).toContain('LLM unavailable');
      expect(h.lines.join('\n')).toContain('Live session complete.');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runLiveSession exit codes', () => {
  it('returns 2 on a missing target directory', async () => {
    const h = makeHarness();
    const code = await runLiveSession({
      dir: path.join(os.tmpdir(), 'usa-live-does-not-exist-xyz'),
      ask: h.ask,
      print: h.print,
    });
    expect(code).toBe(2);
    expect(h.lines.join('\n')).toContain('not found or not a directory');
  });
});

describe('triage limit', () => {
  it('walks at most triageLimit findings and names the limit when queue remains', async () => {
    const dir = makeScratch();
    const transcriptPath = path.join(dir, 'T.md');
    try {
      const h = makeHarness((prompt) => (prompt.includes('Evidence for') ? 'src/app.ts:42' : ''));
      const code = await runLiveSession({
        dir,
        ask: h.ask,
        print: h.print,
        transcriptPath,
        triageLimit: 3,
      });
      expect(code).toBe(0);
      expect(h.prompts.filter((p) => p.includes('Evidence for'))).toHaveLength(3);
      expect(fs.readFileSync(transcriptPath, 'utf8')).toContain('left queued (triage limit 3');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an invalid triageLimit falls back instead of crashing', async () => {
    const dir = makeScratch();
    try {
      const h = makeHarness();
      const code = await runLiveSession({ dir, ask: h.ask, print: h.print, triageLimit: 0 });
      expect(code).toBe(0);
      expect(h.lines.join('\n')).toContain('Live session complete.');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints how many files the deterministic index read', async () => {
    const dir = makeScratch();
    try {
      const h = makeHarness();
      await runLiveSession({ dir, ask: h.ask, print: h.print });
      expect(h.lines.join('\n')).toContain('files listed in the project index');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('checkModelAdvertised', () => {
  it('is silent when the model is advertised, warns when absent, quiet when uncheckable', async () => {
    const { checkModelAdvertised } = await import('../src/live/runner.js');
    const listed = async () => [{ name: 'model-a' }, { name: 'model-b' }];
    expect(await checkModelAdvertised('p', 'model-a', listed)).toBeNull();
    expect(await checkModelAdvertised('p', undefined, listed)).toBeNull();
    const missing = await checkModelAdvertised('p', 'model-zzz', listed);
    expect(missing).toContain('model-zzz');
    expect(missing).toContain('404');
    const failing = async (): Promise<never> => {
      throw new Error('offline');
    };
    expect(await checkModelAdvertised('p', 'model-zzz', failing)).toBeNull();
  });
});
