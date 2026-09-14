import { describe, it, expect, afterEach } from 'vitest';
import {
  applySuppressions,
  buildSuppressionIndex,
  describeSuppression,
  unusedSuppressions,
} from '../../src/engine/suppression.js';
import type { Location } from '../../src/types.js';
import { makeProject, auditAt } from '../helpers.js';
import { loadConfig } from '../../src/config.js';

const cleanups: (() => void)[] = [];
const build = (files: Record<string, string>) => {
  const p = makeProject(files);
  cleanups.push(p.cleanup);
  return p.root;
};
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const loc = (file: string, line?: number): Location => ({ file, line });

describe('buildSuppressionIndex / applySuppressions', () => {
  it('a rule-wide waiver excuses every location including a location-less finding', () => {
    const index = buildSuppressionIndex([{ rule: 'R', reason: 'why' }]);
    const outcome = applySuppressions(index, 'R', [loc('a.ts', 1), loc('b.ts', 2)]);
    expect(outcome.suppressedAny).toBe(true);
    expect(outcome.kept).toEqual([]);
    expect(outcome.reasons).toEqual(['why']);

    const bare = applySuppressions(index, 'R', []);
    expect(bare.suppressedAny).toBe(true);
    expect(bare.kept).toEqual([]);
  });

  it('a site waiver excuses only the matching file and keeps the rest', () => {
    const index = buildSuppressionIndex([
      { rule: 'R', reason: 'vendored', file: 'scripts/legacy/**' },
    ]);
    const outcome = applySuppressions(index, 'R', [
      loc('scripts/legacy/old.js', 3),
      loc('src/app.ts', 10),
    ]);
    expect(outcome.suppressedAny).toBe(true);
    expect(outcome.kept).toEqual([loc('src/app.ts', 10)]);
    expect(outcome.reasons).toEqual(['vendored']);
  });

  it('a bare filename matches at any depth', () => {
    const index = buildSuppressionIndex([{ rule: 'R', reason: 'x', file: 'old.js' }]);
    const outcome = applySuppressions(index, 'R', [
      loc('deep/nested/old.js', 1),
      loc('keep.js', 1),
    ]);
    expect(outcome.kept).toEqual([loc('keep.js', 1)]);
  });

  it('a line-scoped waiver only excuses that line', () => {
    const index = buildSuppressionIndex([{ rule: 'R', reason: 'x', file: 'a.ts', line: 5 }]);
    const outcome = applySuppressions(index, 'R', [loc('a.ts', 5), loc('a.ts', 9)]);
    expect(outcome.kept).toEqual([loc('a.ts', 9)]);
  });

  it('a line-scoped waiver does not excuse a location-less finding', () => {
    const index = buildSuppressionIndex([{ rule: 'R', reason: 'x', file: 'a.ts', line: 5 }]);
    expect(applySuppressions(index, 'R', []).suppressedAny).toBe(false);
  });

  it('marks entries used only when they actually fire', () => {
    const index = buildSuppressionIndex([
      { rule: 'R', reason: 'used', file: 'a.ts' },
      { rule: 'R', reason: 'unused', file: 'never.ts' },
    ]);
    applySuppressions(index, 'R', [loc('a.ts', 1)]);
    const unused = unusedSuppressions(index);
    expect(unused.map((s) => s.reason)).toEqual(['unused']);
  });

  it('reports no suppression for an unmentioned rule', () => {
    const index = buildSuppressionIndex([{ rule: 'R', reason: 'x' }]);
    const outcome = applySuppressions(index, 'OTHER', [loc('a.ts', 1)]);
    expect(outcome.suppressedAny).toBe(false);
    expect(outcome.kept).toEqual([loc('a.ts', 1)]);
  });
});

describe('describeSuppression', () => {
  it('labels rule-wide and site-level waivers', () => {
    expect(describeSuppression({ rule: 'R', reason: 'x' })).toBe('R');
    expect(describeSuppression({ rule: 'R', reason: 'x', file: 'a/*.ts' })).toBe('R (a/*.ts)');
    expect(describeSuppression({ rule: 'R', reason: 'x', file: 'a.ts', line: 4 })).toBe(
      'R (a.ts:4)',
    );
  });
});

describe('config parsing', () => {
  it('parses file and line on a suppression', () => {
    const root = build({
      '.usa.yaml': [
        'version: 1',
        'suppressions:',
        '  - rule: SEC-004',
        '    reason: vendored',
        '    file: "scripts/legacy/**"',
        '    line: 42',
      ].join('\n'),
    });
    const config = loadConfig(root);
    expect(config.suppressions).toEqual([
      {
        rule: 'SEC-004',
        reason: 'vendored',
        until: undefined,
        file: 'scripts/legacy/**',
        line: 42,
      },
    ]);
  });

  it('leaves file and line undefined for a rule-wide waiver', () => {
    const root = build({
      '.usa.yaml': ['version: 1', 'suppressions:', '  - rule: PERF-005', '    reason: known'].join(
        '\n',
      ),
    });
    const config = loadConfig(root);
    expect(config.suppressions?.[0]?.file).toBeUndefined();
    expect(config.suppressions?.[0]?.line).toBeUndefined();
  });
});

describe('site-level suppressions (end to end)', () => {
  const offending = {
    'a.ts': 'const api_key = "abcdefghijklmnop";\n',
    'b.ts': 'const password = "zyxwvutsrqponmlk";\n',
  };

  it('suppresses only the named file, keeping the finding active elsewhere', () => {
    const root = build(offending);
    const { report, warnings } = auditAt(root, {
      config: {
        version: 1,
        suppressions: [{ rule: 'SEC-001', reason: 'legacy', file: 'a.ts' }],
      },
    });
    const f = report.findings.find((x) => x.ruleId === 'SEC-001')!;
    // b.ts survives, so the finding is still active — not suppressed.
    expect(f.suppressedReason).toBeUndefined();
    expect(f.locations.map((l) => l.file)).toEqual(['b.ts']);
    expect(warnings.some((w) => w.includes('SEC-001'))).toBe(false);
  });

  it('suppresses the whole finding when every location matches', () => {
    const root = build(offending);
    const { report } = auditAt(root, {
      config: {
        version: 1,
        suppressions: [
          { rule: 'SEC-001', reason: 'legacy', file: 'a.ts' },
          { rule: 'SEC-001', reason: 'legacy', file: 'b.ts' },
        ],
      },
    });
    const f = report.findings.find((x) => x.ruleId === 'SEC-001')!;
    expect(f.suppressedReason).toBe('legacy');
    expect(f.locations).toEqual([]);
  });

  it('warns about a suppression that matched nothing', () => {
    const root = build({ 'a.ts': 'export const x = 1;\n' });
    const { warnings } = auditAt(root, {
      config: {
        version: 1,
        suppressions: [{ rule: 'SEC-001', reason: 'stale', file: 'gone.ts' }],
      },
    });
    expect(warnings.some((w) => w.includes('SEC-001 (gone.ts)') && w.includes('matched no'))).toBe(
      true,
    );
  });

  it('does not warn when a site waiver fires', () => {
    const root = build({ 'a.ts': 'const api_key = "abcdefghijklmnop";\n' });
    const { warnings } = auditAt(root, {
      config: {
        version: 1,
        suppressions: [{ rule: 'SEC-001', reason: 'legacy', file: 'a.ts' }],
      },
    });
    expect(warnings.some((w) => w.includes('matched no'))).toBe(false);
  });
});
