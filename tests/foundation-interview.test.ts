import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ASK_ORDER,
  INTERVIEW_QUESTIONS,
  applyInterviewAnswer,
  foundationFromAnswers,
  renderFoundationYaml,
  runFoundationInit,
  runFoundationShow,
  summarizeFoundation,
} from '../src/foundation/interview.js';
import { parseFoundationYamlText, loadFoundationFacts } from '../src/foundation/loader.js';
import { defaultFoundation } from '../src/foundation/types.js';
import { main } from '../src/cli.js';

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-interview-'));
  dirs.push(dir);
  return dir;
}

function silent() {
  const printed: string[] = [];
  const errors: string[] = [];
  return {
    printed,
    errors,
    print: (line: string) => printed.push(line),
    error: (line: string) => errors.push(line),
  };
}

describe('interview builders', () => {
  it('covers every pillar the schema requires', () => {
    const ids = INTERVIEW_QUESTIONS.map((q) => q.id);
    for (const id of [
      'project.name',
      'project.vision',
      'project.intents',
      'stage',
      'pillars.docs.required',
      'pillars.governance.codeOfConduct',
      'pillars.governance.contributing',
      'pillars.governance.securityPolicy',
      'pillars.governance.license',
      'pillars.ai.readable',
      'pillars.ai.writable',
      'pillars.testing.dirs',
      'pillars.testing.minCoverage',
      'pillars.environment.files',
      'pillars.pipelines.local',
      'pillars.pipelines.ci',
      'pillars.standards',
      'pillars.specs',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('builders produce a config that strictly parses (valid schema)', () => {
    const config = foundationFromAnswers(
      {
        'project.name': 'demo',
        'project.vision': 'Audit all the things.',
        'project.intents': 'api, frontend',
        stage: 'beta',
        'pillars.docs.required': 'README.md, docs/ARCHITECTURE.md',
        'pillars.governance.securityPolicy': 'no',
        'pillars.ai.writable': 'yes',
        'pillars.testing.minCoverage': '90',
        'pillars.standards': '',
        'pillars.specs': 'docs/spec.md',
      },
      'demo',
    );
    expect(config.project.intents).toEqual(['api', 'frontend']);
    expect(config.stage).toBe('beta');
    expect(config.pillars.governance.securityPolicy).toBe(false);
    expect(config.pillars.ai.writable).toBe(true);
    expect(config.pillars.testing.minCoverage).toBe(90);
    // Strict re-parse: the builders output must satisfy the loader schema.
    const reparsed = parseFoundationYamlText(renderFoundationYaml(config), 'foundation.yaml');
    expect(reparsed).toEqual(config);
  });

  it('defaults render and strictly re-parse (round-trip)', () => {
    const config = defaultFoundation('sketch');
    const reparsed = parseFoundationYamlText(renderFoundationYaml(config), 'foundation.yaml');
    expect(reparsed).toEqual(config);
  });

  it('empty answers keep the current value; unknown ids and bad values throw', () => {
    const start = defaultFoundation('demo');
    expect(applyInterviewAnswer(start, 'stage', '  ')).toEqual(start);
    expect(() => applyInterviewAnswer(start, 'nope.question', 'x')).toThrow(
      'unknown interview question',
    );
    expect(() => applyInterviewAnswer(start, 'project.intents', 'api, pager')).toThrow('"pager"');
    expect(() => applyInterviewAnswer(start, 'stage', 'moon')).toThrow('moon');
    expect(() => applyInterviewAnswer(start, 'pillars.ai.readable', 'maybe')).toThrow('yes/no');
    expect(() => applyInterviewAnswer(start, 'pillars.testing.minCoverage', 'high')).toThrow(
      '0 to 100',
    );
    expect(() => applyInterviewAnswer(start, 'pillars.testing.minCoverage', '101')).toThrow(
      '0 to 100',
    );
  });

  it('summary prints the effective intent and the exact facts asserted', () => {
    const config = foundationFromAnswers({ 'project.intents': 'CLI, service' }, 'demo');
    const summary = summarizeFoundation(config);
    expect(summary).toContain('# Foundation: demo');
    expect(summary).toContain('intents: cli, service');
    expect(summary).toContain('  intent:cli\n  intent:service');
  });
});

describe('foundation init/show drivers', () => {
  it('--non-interactive writes the defaults file; reruns leave it alone', () => {
    const root = scratch();
    const io = silent();
    expect(runFoundationInit({ dir: root, nonInteractive: true, ...io })).toBe(0);
    const file = path.join(root, '.usa', 'foundation.yaml');
    expect(fs.existsSync(file)).toBe(true);
    const before = fs.readFileSync(file, 'utf8');
    // The written file is a strictly valid intent the loader accepts.
    expect(loadFoundationFacts(root)).toEqual(['intent:library']);
    expect(runFoundationInit({ dir: root, nonInteractive: true, ...io })).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(io.errors.join('\n')).toContain('already exists');
  });

  it('interactive init consumes answers in order and writes valid YAML', () => {
    const root = scratch();
    const io = silent();
    const scripted = ['paid', 'Get paid.', 'api, cli', 'mvp'];
    const code = runFoundationInit({
      dir: root,
      nonInteractive: false,
      ask: () => scripted.shift() ?? null,
      ...io,
    });
    expect(code).toBe(0);
    const facts = loadFoundationFacts(root);
    expect(facts).toEqual(['intent:api', 'intent:cli']);
    const text = fs.readFileSync(path.join(root, '.usa', 'foundation.yaml'), 'utf8');
    expect(text).toContain('Get paid.');
    expect(text).toContain('stage: mvp');
  });

  it('interactive init re-prompts on invalid answers', () => {
    const root = scratch();
    const io = silent();
    const scripted = ['pager', 'api'];
    const code = runFoundationInit({
      dir: root,
      nonInteractive: false,
      ask: (prompt: string) => (prompt.includes('Intents') ? (scripted.shift() ?? null) : null),
      ...io,
    });
    expect(code).toBe(0);
    expect(loadFoundationFacts(root)).toEqual(['intent:api']);
    expect(io.errors.join('\n')).toContain('pager');
  });

  it('show prints intent + facts; missing file exits 1; broken file exits 2', () => {
    const root = scratch();
    const io = silent();
    expect(runFoundationShow({ dir: root, ...io })).toBe(1);
    expect(io.errors.join('\n')).toContain('no foundation file');

    runFoundationInit({ dir: root, nonInteractive: true, print: () => {}, error: () => {} });
    const io2 = silent();
    expect(runFoundationShow({ dir: root, ...io2 })).toBe(0);
    expect(io2.printed.join('\n')).toContain('intent:library');

    fs.writeFileSync(path.join(root, '.usa', 'foundation.yaml'), 'version: [broken\n', 'utf8');
    const io3 = silent();
    expect(runFoundationShow({ dir: root, ...io3 })).toBe(2);
    expect(io3.errors.join('\n')).toContain('foundation.yaml');
  });
});

describe('foundation CLI wiring', () => {
  function run(argv: string[]): { code: number; out: string; err: string } {
    const logs: string[] = [];
    const errs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => errs.push(a.join(' ')));
    const code = main(argv);
    return { code, out: logs.join('\n'), err: errs.join('\n') };
  }

  it('init --non-interactive + show work through the CLI with --dir', () => {
    const root = scratch();
    const init = run(['foundation', 'init', '--dir', root, '--non-interactive']);
    expect(init.code).toBe(0);
    expect(fs.existsSync(path.join(root, '.usa', 'foundation.yaml'))).toBe(true);
    const show = run(['foundation', 'show', '--dir', root]);
    expect(show.code).toBe(0);
    expect(show.out).toContain('intent:library');
  });

  it('init accepts a positional path and show defaults to cwd-relative dirs', () => {
    const root = scratch();
    expect(run(['foundation', 'init', root, '--non-interactive']).code).toBe(0);
    expect(run(['foundation', 'show', root]).code).toBe(0);
  });

  it('unknown subcommands exit 2 with usage', () => {
    const r = run(['foundation', 'frobnicate']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Usage: usa foundation');
  });

  it('top-level help advertises foundation', () => {
    const r = run(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('usa foundation init [path]');
    expect(r.out).toContain('usa foundation show [path]');
    expect(r.out).toContain('--non-interactive');
  });
});

describe('forgiving answers', () => {
  it('multi-select splits on comma, semicolon, pipe, and newline', () => {
    const start = defaultFoundation('demo');
    expect(applyInterviewAnswer(start, 'project.intents', 'api;cli').project.intents).toEqual([
      'api',
      'cli',
    ]);
    expect(applyInterviewAnswer(start, 'project.intents', 'api|cli').project.intents).toEqual([
      'api',
      'cli',
    ]);
    expect(applyInterviewAnswer(start, 'project.intents', 'api\ncli').project.intents).toEqual([
      'api',
      'cli',
    ]);
  });

  it('"all" (any case) selects every option', () => {
    const start = defaultFoundation('demo');
    const lowered = applyInterviewAnswer(start, 'project.intents', 'all').project.intents;
    expect(lowered).toEqual(
      INTERVIEW_QUESTIONS.find((q) => q.id === 'project.intents')?.options ?? [],
    );
    expect(applyInterviewAnswer(start, 'project.intents', 'ALL').project.intents).toEqual(lowered);
  });

  it('select accepts case-insensitive answers but still rejects unknown ones', () => {
    const start = defaultFoundation('demo');
    expect(applyInterviewAnswer(start, 'stage', 'Beta').stage).toBe('beta');
    expect(() => applyInterviewAnswer(start, 'stage', 'moon')).toThrow('moon');
    expect(() => applyInterviewAnswer(start, 'project.intents', 'api, pager')).toThrow('"pager"');
  });

  it('ASK_ORDER names the four human questions and nothing else', () => {
    expect([...ASK_ORDER]).toEqual(['project.name', 'project.vision', 'project.intents', 'stage']);
    for (const id of ASK_ORDER) {
      expect(INTERVIEW_QUESTIONS.some((q) => q.id === id)).toBe(true);
    }
  });
});
