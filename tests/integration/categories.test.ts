import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRulePacks } from '../../src/engine/loader.js';
import { DEFAULT_SECTIONS } from '../../src/engine/sections.js';
import {
  CATEGORY_IDS,
  categoryCoverage,
  loadCategories,
  type CategoryDef,
  type RulePack,
} from '../../src/engine/categories.js';

const RULES = path.resolve(process.cwd(), 'rules');

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tempRulesDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-categories-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return dir;
}

function rulePack(id: string, ruleIds: string[]): RulePack {
  return {
    id,
    title: id,
    rules: ruleIds.map((ruleId) => ({
      id: ruleId,
      title: ruleId,
      section: 'S0',
      severity: 'MEDIUM' as const,
      ruleClass: 'correctness' as const,
      check: { kind: 'manual' as const },
    })),
  };
}

describe('category registry', () => {
  it('loads exactly the frozen ten ids with no warnings', () => {
    const { categories, warnings } = loadCategories(RULES);
    expect(warnings).toEqual([]);
    expect(categories.map((c) => c.id).sort()).toEqual([...CATEGORY_IDS].sort());
  });

  it('every sections[] entry exists in sections.ts', () => {
    const { categories } = loadCategories(RULES);
    const known = new Set(DEFAULT_SECTIONS.map((s) => s.id));
    for (const c of categories) {
      for (const s of c.sections) {
        expect(known.has(s), `category "${c.id}" maps unknown section "${s}"`).toBe(true);
      }
    }
  });

  it('every rulePrefixes[] matches a real rule, or the category is labeled aspirational', () => {
    const { categories } = loadCategories(RULES);
    const { packs } = loadRulePacks(RULES);
    const ruleIds = packs.flatMap((p) => p.rules.map((r) => r.id));
    expect(ruleIds.length).toBeGreaterThan(0);
    for (const c of categories) {
      const matched = c.rulePrefixes.filter((p) => ruleIds.some((id) => id.startsWith(p)));
      if (matched.length === 0) {
        // Aspirational-but-empty is valid only when labeled as such.
        expect(
          c.description.includes('PROPOSED'),
          `category "${c.id}" maps no rule but is not labeled PROPOSED`,
        ).toBe(true);
      } else {
        expect(
          c.description.includes('IMPLEMENTED'),
          `category "${c.id}" maps rules but is not labeled IMPLEMENTED`,
        ).toBe(true);
      }
    }
  });

  it('labels five categories implemented and five proposed', () => {
    const { categories } = loadCategories(RULES);
    const implemented = categories.filter((c) => c.description.includes('IMPLEMENTED'));
    const proposed = categories.filter((c) => c.description.includes('PROPOSED'));
    expect(implemented.map((c) => c.id).sort()).toEqual(
      ['architecture', 'foundational', 'security', 'standards', 'technical-sota'].sort(),
    );
    expect(proposed.map((c) => c.id).sort()).toEqual(
      ['communication', 'networking', 'protocol', 'ux', 'vision'].sort(),
    );
  });
});

describe('categoryCoverage derivation', () => {
  const defs: CategoryDef[] = [
    {
      id: 'security',
      name: 'Security',
      description: 'IMPLEMENTED',
      sections: ['S2'],
      rulePrefixes: ['SEC-'],
    },
    { id: 'vision', name: 'Vision', description: 'PROPOSED', sections: [], rulePrefixes: [] },
  ];

  it('counts rules by prefix across packs', () => {
    const packs = [rulePack('a', ['SEC-001', 'SEC-002', 'REPO-001']), rulePack('b', ['SEC-003'])];
    const rows = categoryCoverage(packs, defs);
    expect(rows.find((r) => r.id === 'security')).toEqual({
      id: 'security',
      name: 'Security',
      ruleCount: 3,
      sections: ['S2'],
    });
  });

  it('reports zero for aspirational categories without padding', () => {
    const rows = categoryCoverage([rulePack('a', ['SEC-001'])], defs);
    expect(rows.find((r) => r.id === 'vision')).toEqual({
      id: 'vision',
      name: 'Vision',
      ruleCount: 0,
      sections: [],
    });
  });

  it('ignores rules no category claims', () => {
    const rows = categoryCoverage([rulePack('a', ['ZZZ-999'])], defs);
    expect(rows.every((r) => r.ruleCount === 0)).toBe(true);
  });
});

describe('loadCategories fail-closed warnings', () => {
  it('warns on a missing registry', () => {
    const { categories, warnings } = loadCategories(tempRulesDir({}));
    expect(categories).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('warns and skips on malformed YAML', () => {
    const dir = tempRulesDir({ 'categories.yaml': 'schema: [unclosed\n  - :\n' });
    const { categories, warnings } = loadCategories(dir);
    expect(categories).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('warns and skips on a wrong schema', () => {
    const dir = tempRulesDir({ 'categories.yaml': 'schema: something-else\ncategories: []\n' });
    const { categories, warnings } = loadCategories(dir);
    expect(categories).toEqual([]);
    expect(warnings.some((w) => w.includes('schema'))).toBe(true);
  });

  it('skips entries without an honesty label, unknown ids, and duplicates', () => {
    const dir = tempRulesDir({
      'categories.yaml': [
        'schema: usa-categories-v1',
        'categories:',
        '  - id: security',
        '    name: Security',
        '    description: Status PROPOSED placeholder with no rules.',
        '    sections: []',
        '    rulePrefixes: []',
        '  - id: networking',
        '    name: Networking',
        '    description: Covers the wires and waves, eventually.',
        '    sections: []',
        '    rulePrefixes: []',
        '  - id: made-up',
        '    name: Made Up',
        '    description: Status PROPOSED but not a frozen id.',
        '    sections: []',
        '    rulePrefixes: []',
        '  - id: security',
        '    name: Security Again',
        '    description: Status IMPLEMENTED duplicate.',
        '    sections: []',
        '    rulePrefixes: []',
        '',
      ].join('\n'),
    });
    const { categories, warnings } = loadCategories(dir);
    // networking (no IMPLEMENTED/PROPOSED label), made-up (unknown id), and
    // the duplicate security are all skipped; only the first security loads.
    expect(categories.map((c) => c.id)).toEqual(['security']);
    expect(warnings.some((w) => w.includes('"networking"'))).toBe(true);
    expect(warnings.some((w) => w.includes('"made-up"'))).toBe(true);
    expect(warnings.some((w) => w.includes('duplicate'))).toBe(true);
  });
});
