import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main, isEntryPoint } from '../src/cli.js';

const { mockedListModels } = vi.hoisted(() => ({ mockedListModels: vi.fn() }));

// Network is stubbed at the agent boundary: `usa models` tests never touch
// real endpoints. Every other import keeps its real implementation, so the
// existing suites exercise the genuine CLI paths.
vi.mock('../src/agent/providers.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/agent/providers.js')>();
  return { ...mod, listModels: mockedListModels };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function run(argv: string[]): { code: number; out: string; err: string } {
  const logs: string[] = [];
  const errs: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errs.push(a.join(' '));
  });
  const code = main(argv);
  return { code, out: logs.join('\n'), err: errs.join('\n') };
}

describe('global flags', () => {
  // Regression: the arg parser files `--help` under flags (never `_`), so
  // the old dispatch fell through to the default `audit` command and
  // audited the tree instead of printing help.
  it('--help prints usage and does not audit', () => {
    const r = run(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('usa audit [path]');
  });

  it('--version prints the version and does not audit', () => {
    const r = run(['--version']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/usa \d+\.\d+\.\d+/);
  });

  it('positional help/version still work', () => {
    expect(run(['help']).code).toBe(0);
    expect(run(['version']).out).toMatch(/usa \d+\.\d+\.\d+/);
    expect(run(['-h']).code).toBe(0);
  });

  it('a subcommand flag help wins over top-level help (live)', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
    // cmdLive is async (the LLM transport is), so main() returns a Promise here.
    const code = await main(['live', '--help']);
    const out = logs.join('\n');
    expect(code).toBe(0);
    expect(out).toContain('usa live [path]');
    expect(out).not.toContain('usa audit [path]');
  });

  it('unknown commands still exit 2', () => {
    const r = run(['frobnicate']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown command');
  });

  it('rejects non-positive --max-files/--max-bytes', () => {
    const badFiles = run(['audit', '.', '--max-files', 'abc']);
    expect(badFiles.code).toBe(2);
    expect(badFiles.err).toContain('--max-files must be a positive number');
    const badBytes = run(['audit', '.', '--max-bytes', '0']);
    expect(badBytes.code).toBe(2);
    expect(badBytes.err).toContain('--max-bytes must be a positive number');
  });

  it('rejects an unknown --format', () => {
    const r = run(['audit', '.', '--format', 'xml']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--format must be one of md|json|sarif');
  });

  describe('report format selection', () => {
    it('infers json and sarif from the --out extension, md otherwise', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-format-'));
      try {
        const cases: [string, (raw: string) => void][] = [
          ['out.json', (raw) => expect(JSON.parse(raw).schema).toBe('usa-report-json-v1')],
          ['out.sarif', (raw) => expect(JSON.parse(raw).version).toBe('2.1.0')],
          ['out.md', (raw) => expect(raw).toContain('# ')],
        ];
        for (const [name, check] of cases) {
          const out = path.join(dir, name);
          const r = run(['audit', '.', '--out', out, '--quiet']);
          expect(r.code, `${name} exited ${r.code}: ${r.err}`).toBe(0);
          check(fs.readFileSync(out, 'utf8'));
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('--format overrides the --out extension', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-format-'));
      try {
        const out = path.join(dir, 'named-like-markdown.md');
        const r = run(['audit', '.', '--out', out, '--format', 'json', '--quiet']);
        expect(r.code).toBe(0);
        expect(JSON.parse(fs.readFileSync(out, 'utf8')).schema).toBe('usa-report-json-v1');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('entry-point guard (npm bin symlink regression)', () => {
    // Regression: npm installs the `usa` bin as a symlink to dist/cli.js.
    // process.argv[1] is then the symlink path while import.meta.url is the
    // real path, so a naive `file://${argv[1]}` comparison never matches and
    // the installed CLI exited 0 without doing anything.
    it('recognises the entry point through a symlink', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-bin-'));
      try {
        const real = path.join(dir, 'cli.js');
        fs.writeFileSync(real, '// stub\n');
        const link = path.join(dir, 'usa');
        fs.symlinkSync(real, link);
        const thisUrl = pathToFileURL(real).href;

        expect(isEntryPoint(link, thisUrl)).toBe(true);
        expect(isEntryPoint(real, thisUrl)).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects a different file, a missing file, and an undefined argv', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-bin-'));
      try {
        const real = path.join(dir, 'cli.js');
        fs.writeFileSync(real, '// stub\n');
        const other = path.join(dir, 'other.js');
        fs.writeFileSync(other, '// other\n');
        const thisUrl = pathToFileURL(real).href;

        expect(isEntryPoint(other, thisUrl)).toBe(false);
        expect(isEntryPoint(path.join(dir, 'missing.js'), thisUrl)).toBe(false);
        expect(isEntryPoint(undefined, thisUrl)).toBe(false);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

describe('usa live triage limit', () => {
  it('rejects a non-positive triage limit without running a session', async () => {
    const logs: string[] = [];
    const errs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errs.push(a.join(' '));
    });
    const code = await main(['live', '.', '--triage-limit', 'abc']);
    expect(code).toBe(2);
    expect(errs.join('\n')).toContain('--triage-limit must be a positive number');
    expect(logs.join('\n')).not.toContain('Live session complete.');
  });
});

describe('usa models', () => {
  const KEY = 'OPENAI_API_KEY';
  let saved: string | undefined;

  function setKey(): void {
    saved = process.env[KEY];
    process.env[KEY] = 'test-key-never-sent';
  }

  function restoreKey(): void {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  }

  it('prints one advertised model per line', async () => {
    setKey();
    mockedListModels.mockResolvedValue([{ name: 'm-one' }, { name: 'm-two' }]);
    try {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        logs.push(a.join(' '));
      });
      const code = await main(['models', '--provider', 'openai']);
      expect(code).toBe(0);
      expect(logs).toEqual(['m-one', 'm-two']);
      expect(mockedListModels).toHaveBeenCalledWith('openai');
    } finally {
      restoreKey();
    }
  });

  it('needs a provider and fails closed without one', async () => {
    const savedProvider = process.env['USA_PROVIDER'];
    const savedLive = process.env['USA_LIVE_PROVIDER'];
    delete process.env['USA_PROVIDER'];
    delete process.env['USA_LIVE_PROVIDER'];
    try {
      const errs: string[] = [];
      vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
        errs.push(a.join(' '));
      });
      const code = await main(['models']);
      expect(code).toBe(2);
      expect(errs.join('\n')).toContain('Usage: usa models');
    } finally {
      if (savedProvider !== undefined) process.env['USA_PROVIDER'] = savedProvider;
      if (savedLive !== undefined) process.env['USA_LIVE_PROVIDER'] = savedLive;
    }
  });
});
