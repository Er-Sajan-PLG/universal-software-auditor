import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main, isEntryPoint } from '../../src/cli.js';

const { mockedListModels } = vi.hoisted(() => ({ mockedListModels: vi.fn() }));

// Network is stubbed at the agent boundary: `usa models` tests never touch
// real endpoints. Every other import keeps its real implementation, so the
// existing suites exercise the genuine CLI paths.
vi.mock('../../src/agent/providers.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/agent/providers.js')>();
  return { ...mod, listModels: mockedListModels };
});

const tmpRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (tmpRoots.length) fs.rmSync(tmpRoots.pop()!, { recursive: true, force: true });
});

/** Scratch dir, removed after each test. */
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-dry-'));
  tmpRoots.push(dir);
  return dir;
}

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

  it('rules warns on stderr when --format is passed and still prints human output', () => {
    const r = run(['rules', '--format', 'json']);
    expect(r.code).toBe(0);
    expect(r.err).toContain('rules has no --format; ignoring');
    expect(r.out).toContain('rule(s) across');
  });

  describe('report format selection', () => {
    it('infers json and sarif from the --out extension, md otherwise', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-format-'));
      try {
        const cases: [string, (raw: string) => void][] = [
          ['out.json', (raw) => expect(JSON.parse(raw).schema).toBe('usa-report-json-v1')],
          ['out.sarif', (raw) => expect(JSON.parse(raw).version).toBe('2.1.0')],
          ['out.md', (raw) => expect(raw).toContain('# ')],
          ['out.html', (raw) => expect(raw).toContain('<!DOCTYPE html>')],
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

    it('ships a node shebang: symlink installs exec the file directly', () => {
      // Regression (god-file split): src/cli.ts lost its `#!/usr/bin/env
      // node` first line, so symlink installs fell through to the shell —
      // bash ran the imports through ImageMagick and the COMMANDS map as
      // commands. The entry point must always be directly executable.
      const first = fs.readFileSync(path.join('src', 'cli.ts'), 'utf8').split('\n')[0];
      expect(first).toBe('#!/usr/bin/env node');
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

describe('--dry-run (CLI-003)', () => {
  it('audit previews the report path and writes nothing', () => {
    const dir = tmpDir();
    const out = path.join(dir, 'AUDIT.md');
    const r = run(['audit', dir, '--out', out, '--dry-run']);
    expect(r.code).toBe(0);
    expect(fs.existsSync(out)).toBe(false);
    expect(r.out).toContain(`dry-run: would write ${out}`);
  });

  it('diff previews and skips the comparison', () => {
    const dir = tmpDir();
    const a = path.join(dir, 'a.md');
    const b = path.join(dir, 'b.md');
    const out = path.join(dir, 'DIFF.md');
    fs.writeFileSync(a, '# a\n', 'utf8');
    fs.writeFileSync(b, '# b\n', 'utf8');
    const r = run(['diff', a, b, '--out', out, '--dry-run']);
    expect(r.code).toBe(0);
    expect(fs.existsSync(out)).toBe(false);
    expect(r.out).toContain(`dry-run: would write ${out}`);
  });

  it('learn previews without mining the report', () => {
    const dir = tmpDir();
    const report = path.join(dir, 'r.md');
    const out = path.join(dir, 's.yaml');
    fs.writeFileSync(report, '# report\n', 'utf8');
    const r = run(['learn', report, '--out', out, '--dry-run']);
    expect(r.code).toBe(0);
    expect(fs.existsSync(out)).toBe(false);
    expect(r.out).toContain(`dry-run: would write ${out}`);
  });

  it('bootstrap previews without running detection', () => {
    const dir = tmpDir();
    const out = path.join(dir, 'packs');
    const r = run(['bootstrap', dir, '--out', out, '--dry-run']);
    expect(r.code).toBe(0);
    expect(fs.existsSync(out)).toBe(false);
    expect(r.out).toContain(`dry-run: would write ${out}`);
  });

  it('evolve previews without cycling or creating the store', () => {
    const dir = tmpDir();
    const store = path.join(dir, 'store');
    const r = run(['evolve', dir, '--store', store, '--dry-run']);
    expect(r.code).toBe(0);
    expect(fs.existsSync(store)).toBe(false);
    expect(r.out).toContain('dry-run: would write');
  });

  it('init previews the scaffold without creating anything', () => {
    const dir = tmpDir();
    const target = path.join(dir, 'proj');
    const r = run(['init', target, '--dry-run']);
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(target, '.usa.yaml'))).toBe(false);
    expect(r.out).toContain('.usa.yaml');
  });

  it('foundation init previews without prompting or writing', () => {
    const dir = tmpDir();
    const r = run(['foundation', 'init', '--dir', dir, '--dry-run']);
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(dir, '.usa', 'foundation.yaml'))).toBe(false);
    expect(r.out).toContain('dry-run: would write');
  });

  it('live previews the transcript without provider calls or prompting', async () => {
    const dir = tmpDir();
    const transcript = path.join(dir, 'SESSION.md');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
    const code = await main(['live', dir, '--transcript', transcript, '--dry-run']);
    expect(code).toBe(0);
    expect(fs.existsSync(transcript)).toBe(false);
    expect(logs.join('\n')).toContain(`dry-run: would write ${transcript}`);
  });

  it('live without a transcript says nothing would be written', async () => {
    const dir = tmpDir();
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
    const code = await main(['live', dir, '--dry-run']);
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('dry-run: nothing would be written');
  });
});

describe('usa rules --facets', () => {
  it('reports ownership, review, and cost coverage without fixed counts', () => {
    const r = run(['rules', '--facets']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Facet coverage across');
    expect(r.out).toMatch(/\d+ rules/);
    expect(r.out).toContain('owner:');
    expect(r.out).toContain('cost:');
  });
});
