import { describe, it, expect, afterEach } from 'vitest';
import { makeProject, projectAt } from '../helpers.js';
import { evaluateRule, type EvalContext } from '../../src/engine/evaluate.js';
import { buildSuppressionIndex } from '../../src/engine/suppression.js';
import type { Check, Facts, Rule } from '../../src/types.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

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

function anyRule(checks: Check[]): Rule {
  return {
    id: 'TEST-000',
    title: 'probe',
    section: 'S1',
    severity: 'LOW',
    ruleClass: 'correctness',
    check: { kind: 'any_of', checks },
  };
}

/**
 * The any_of combiner (new with the FND-009 pyproject fix): first PASS
 * wins, otherwise worst outcome. Each branch is a real check kind, so a
 * combiner bug cannot hide behind kind-level tests.
 */
describe('any_of combiner', () => {
  it('passes when the second branch matches', () => {
    const { root, cleanup } = makeProject({ 'pyproject.toml': '[tool.coverage.run]\n' });
    cleanups.push(cleanup);
    const f = evaluateRule(
      anyRule([
        { kind: 'any_file', patterns: ['codecov.yml'] },
        { kind: 'grep_present', pattern: '\\[tool\\.coverage', include: ['pyproject.toml'] },
      ]),
      ctxFor(root),
    );
    expect(f.status).toBe('PASS');
  });

  it('goes missing when no branch matches', () => {
    const { root, cleanup } = makeProject({ 'README.md': '# App\n' });
    cleanups.push(cleanup);
    const f = evaluateRule(
      anyRule([
        { kind: 'any_file', patterns: ['codecov.yml'] },
        { kind: 'grep_present', pattern: '\\[tool\\.coverage', include: ['pyproject.toml'] },
      ]),
      ctxFor(root),
    );
    expect(f.status).toBe('MISSING');
  });

  it('prefers FAIL over MISSING across branches', () => {
    const { root, cleanup } = makeProject({ '.env': 'API_KEY=x\n' });
    cleanups.push(cleanup);
    const f = evaluateRule(
      anyRule([
        { kind: 'any_file', patterns: ['codecov.yml'] },
        { kind: 'grep_absent', pattern: 'API_KEY', include: ['.env'] },
      ]),
      ctxFor(root),
    );
    expect(f.status).toBe('FAIL');
  });
});
