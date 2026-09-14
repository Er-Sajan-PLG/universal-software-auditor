import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { makeProject, projectAt } from './helpers.js';
import { evaluateRule, type EvalContext } from '../src/engine/evaluate.js';
import { buildSuppressionIndex } from '../src/engine/suppression.js';
import type { Facts, Rule } from '../src/types.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** A real git repo on disk, so tracked_* checks see actual tracking state. */
function gitProject(files: Record<string, string>): string {
  const { root, cleanup } = makeProject(files);
  cleanups.push(cleanup);
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
  git(['init', '-q']);
  git(['-c', 'user.name=test', '-c', 'user.email=test@test', 'add', '-A']);
  git(['-c', 'user.name=test', '-c', 'user.email=test@test', 'commit', '-qm', 'test']);
  return root;
}

function ctxFor(root: string): EvalContext {
  return {
    project: projectAt(root),
    facts: { flags: new Set<string>(), metrics: {} } as Facts,
    depth: 'quick',
    allowCommands: false,
    disabled: new Set<string>(),
    suppressions: buildSuppressionIndex(undefined),
  };
}

function secretRule(exclude?: string[]): Rule {
  return {
    id: 'REPO-002-PROBE',
    title: 'probe',
    section: 'S1',
    severity: 'CRITICAL',
    ruleClass: 'security',
    check: { kind: 'tracked_absent', patterns: ['.env', '.env.*'], exclude },
  };
}

describe('tracked_absent exclude', () => {
  it('still fails on a real committed .env', () => {
    const root = gitProject({ '.env': 'API_KEY=live-secret-value\n' });
    const f = evaluateRule(secretRule(), ctxFor(root));
    expect(f.status).toBe('FAIL');
    expect(f.locations.map((l) => l.file)).toContain('.env');
  });

  it('excuses a documented empty template by name', () => {
    const root = gitProject({ '.env.example': 'API_KEY=\n' });
    const f = evaluateRule(
      secretRule(['.env.example', '.env.sample', '.env.template']),
      ctxFor(root),
    );
    expect(f.status).toBe('PASS');
  });

  it('without exclude, the template still fails (exclusion is opt-in per rule)', () => {
    const root = gitProject({ '.env.example': 'API_KEY=\n' });
    const f = evaluateRule(secretRule(), ctxFor(root));
    expect(f.status).toBe('FAIL');
  });

  it('excludes only listed names — other matches still fail', () => {
    const root = gitProject({ '.env.example': 'A=\n', '.env.local': 'B=real\n' });
    const f = evaluateRule(secretRule(['.env.example']), ctxFor(root));
    expect(f.status).toBe('FAIL');
    expect(f.locations.map((l) => l.file)).toEqual(['.env.local']);
  });
});
