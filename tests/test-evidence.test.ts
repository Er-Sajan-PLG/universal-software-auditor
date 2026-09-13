import { describe, it, expect } from 'vitest';
import {
  classifyTestFile,
  inventoryTests,
  assertionSignals,
  pyramidAssessment,
  freshnessCheck,
  TOP_HEAVY_SHARE,
  MS_PER_DAY,
  type TestLevel,
} from '../src/engine/test-evidence.js';

describe('classifyTestFile', () => {
  const cases: Array<[string, TestLevel]> = [
    // unit defaults
    ['src/__tests__/foo.ts', 'unit'],
    ['src/foo.unit.ts', 'unit'],
    ['src/foo.spec.ts', 'unit'],
    ['tests/test_foo.py', 'unit'],
    // integration defaults
    ['tests/integration/api.test.ts', 'integration'],
    ['tests/contract/orders.spec.ts', 'integration'],
    ['pact/consumer-orders.ts', 'integration'],
    // system defaults
    ['tests/system/login.test.ts', 'system'],
    ['tests/acceptance/checkout.ts', 'system'],
    // e2e defaults
    ['cypress/e2e/login.cy.ts', 'e2e'],
    ['tests/end-to-end/flow.ts', 'e2e'],
    ['src/app.e2e.ts', 'e2e'],
    // unknowns
    ['src/index.ts', 'unknown'],
    ['src/utils/helpers.ts', 'unknown'],
    ['README.md', 'unknown'],
  ];
  for (const [path, level] of cases) {
    it(`classifies ${path} as ${level}`, () => {
      expect(classifyTestFile(path)).toBe(level);
    });
  }

  it('prefers e2e over unit on ambiguous paths (documented tie-break)', () => {
    expect(classifyTestFile('e2e/login.spec.ts')).toBe('e2e');
  });

  it('custom patterns override the defaults per level', () => {
    expect(classifyTestFile('src/__tests__/foo.ts', { unit: ['*.custom.*'] })).toBe('unknown');
    expect(classifyTestFile('src/foo.custom.ts', { unit: ['*.custom.*'] })).toBe('unit');
    // unspecified levels keep their defaults
    expect(classifyTestFile('cypress/e2e/login.cy.ts', { unit: ['*.custom.*'] })).toBe('e2e');
  });
});

describe('inventoryTests', () => {
  it('counts per level and sums to the input length', () => {
    const files = [
      'src/a.spec.ts',
      'src/b.unit.ts',
      'tests/integration/api.ts',
      'tests/system/x.ts',
      'cypress/e2e/y.ts',
      'src/index.ts',
    ];
    expect(inventoryTests(files)).toEqual({
      unit: 2,
      integration: 1,
      system: 1,
      e2e: 1,
      unknown: 1,
    });
  });

  it('returns all-zero counts for empty input', () => {
    expect(inventoryTests([])).toEqual({
      unit: 0,
      integration: 0,
      system: 0,
      e2e: 0,
      unknown: 0,
    });
  });

  it('honours custom patterns', () => {
    expect(inventoryTests(['src/a.spec.ts'], { unit: ['*.custom.*'] })).toEqual({
      unit: 0,
      integration: 0,
      system: 0,
      e2e: 0,
      unknown: 1,
    });
  });
});

describe('assertionSignals', () => {
  it('counts each signal class on crafted content', () => {
    const content = [
      "expect(fn).toThrow('x');",
      'assert.throws(fn);',
      'await expect(p).rejects.toBe(1);',
      'await assert.rejects(p);',
      "jest.mock('./x');",
      "vi.mock('./y');",
      'sinon.stub();',
      'fn.mockReturnValue(1);',
      'fn.mockResolvedValue(2);',
      'const m = new Mock();',
      'describe.only("a", () => {});',
      'it.only("b", () => {});',
      'test.only("c", () => {});',
      'fit("d", () => {});',
      'fdescribe("e", () => {});',
      'describe.skip("f", () => {});',
      'it.skip("g", () => {});',
      'test.skip("h", () => {});',
      'xit("i", () => {});',
      'xdescribe("j", () => {});',
    ].join('\n');
    expect(assertionSignals(content)).toEqual({
      failureAssertions: 4,
      mockUsages: 6,
      focusedMarkers: 5,
      skippedMarkers: 5,
    });
  });

  it('returns zeros for empty content', () => {
    expect(assertionSignals('')).toEqual({
      failureAssertions: 0,
      mockUsages: 0,
      focusedMarkers: 0,
      skippedMarkers: 0,
    });
  });

  it('returns zeros when no signal is present', () => {
    expect(assertionSignals('const x = 1;\nexport default x;\n')).toEqual({
      failureAssertions: 0,
      mockUsages: 0,
      focusedMarkers: 0,
      skippedMarkers: 0,
    });
  });
});

describe('pyramidAssessment', () => {
  it('labels an empty inventory untested', () => {
    expect(pyramidAssessment({ unit: 0, integration: 0, system: 0, e2e: 0, unknown: 0 })).toEqual({
      shape: 'untested',
      flag: 'untested',
    });
  });

  it('labels system+e2e above TOP_HEAVY_SHARE top-heavy', () => {
    expect(TOP_HEAVY_SHARE).toBe(0.3);
    expect(pyramidAssessment({ unit: 5, integration: 1, system: 2, e2e: 1, unknown: 0 })).toEqual({
      shape: 'top-heavy',
      flag: 'top-heavy',
    });
  });

  it('does not flag exactly TOP_HEAVY_SHARE (strictly-greater boundary)', () => {
    // top share = 3/10 = exactly 0.3 → not top-heavy; middle exists → balanced
    expect(pyramidAssessment({ unit: 6, integration: 1, system: 2, e2e: 1, unknown: 0 })).toEqual({
      shape: 'balanced',
    });
  });

  it('labels unit-only suites no-middle', () => {
    expect(pyramidAssessment({ unit: 5, integration: 0, system: 0, e2e: 0, unknown: 0 })).toEqual({
      shape: 'no-middle',
      flag: 'no-middle',
    });
  });

  it('labels a proportionate inventory balanced with no flag', () => {
    expect(pyramidAssessment({ unit: 7, integration: 2, system: 0, e2e: 1, unknown: 0 })).toEqual({
      shape: 'balanced',
    });
  });

  it('counts unknown files toward the total but toward no level', () => {
    // top share = 1/10 dilutes below the threshold; unit>0, no integration
    expect(pyramidAssessment({ unit: 1, integration: 0, system: 0, e2e: 1, unknown: 8 })).toEqual({
      shape: 'no-middle',
      flag: 'no-middle',
    });
  });
});

describe('freshnessCheck', () => {
  it('marks an artifact predating HEAD stale with a negative age', () => {
    expect(freshnessCheck(0, MS_PER_DAY)).toEqual({ stale: true, ageDays: -1 });
  });

  it('marks simultaneous timestamps fresh with zero age', () => {
    expect(freshnessCheck(1000, 1000)).toEqual({ stale: false, ageDays: 0 });
  });

  it('marks a newer artifact fresh with a positive age', () => {
    expect(freshnessCheck(2 * MS_PER_DAY, MS_PER_DAY)).toEqual({
      stale: false,
      ageDays: 1,
    });
  });

  it('fails closed on non-finite time paradoxes', () => {
    const nan = freshnessCheck(NaN, Date.now());
    expect(nan.stale).toBe(true);
    expect(nan.ageDays).toBeNaN();
    const inf = freshnessCheck(Infinity, 0);
    expect(inf.stale).toBe(true);
    expect(inf.ageDays).toBeNaN();
  });
});
