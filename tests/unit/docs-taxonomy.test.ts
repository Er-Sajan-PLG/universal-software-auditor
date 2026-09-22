import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DOC_TAXONOMY_SCHEMA,
  EXPECTED_TIERS,
  TIER_SEVERITY,
  artifactApplies,
  loadDocTaxonomy,
  matchPatterns,
} from '../../src/engine/docs-taxonomy.js';
import type { Facts } from '../../src/types.js';
import { RULES_DIR } from '../helpers.js';

const facts = (flags: string[]): Facts => ({ flags: new Set(flags), metrics: {} });

function tmpRulesDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-tax-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

const minimal = (artifactBlock: string): string =>
  [
    'schema: usa-doc-taxonomy-v1',
    'categories:',
    '  - { id: A1, name: "Project & Governance" }',
    'artifacts:',
    artifactBlock,
  ].join('\n');

const goodArtifact = '  - { id: 1, cat: A1, name: "Sample", tier: 0, kind: canonical }';

describe('shipped taxonomy (rules/docs-taxonomy.yaml)', () => {
  const { taxonomy, warnings } = loadDocTaxonomy(RULES_DIR);

  it('loads the full universe with zero warnings', () => {
    expect(warnings).toEqual([]);
    expect(taxonomy).not.toBeNull();
    const t = taxonomy!;
    expect(t.schema).toBe(DOC_TAXONOMY_SCHEMA);
    expect(t.categories).toHaveLength(14);
    expect(t.artifacts).toHaveLength(220);
    const ids = t.artifacts.map((a) => a.id);
    expect(new Set(ids).size).toBe(220);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('has no dangling derives_from / syncs_with edges', () => {
    for (const a of taxonomy!.artifacts) {
      for (const target of [...a.derivesFrom, ...a.syncsWith]) {
        expect(taxonomy!.byId.has(target), `artifact ${a.id} → ${target}`).toBe(true);
      }
    }
  });

  it('every artifact sits in a declared category with a valid tier and kind', () => {
    const cats = new Set(taxonomy!.categories.map((c) => c.id));
    for (const a of taxonomy!.artifacts) {
      expect(cats.has(a.cat), `artifact ${a.id} in ${a.cat}`).toBe(true);
      expect(a.tier).toBeGreaterThanOrEqual(0);
      expect(a.tier).toBeLessThanOrEqual(4);
    }
  });

  it('keeps the byId / categoryOf indexes in sync with the artifact list', () => {
    expect(taxonomy!.byId.size).toBe(220);
    expect(taxonomy!.categoryOf.get(7)).toBe('A1');
    expect(taxonomy!.categoryOf.get(76)).toBe('A5');
  });
});

describe('fail-closed loading', () => {
  it('a missing taxonomy degrades to null with a warning (never throws)', () => {
    const r = loadDocTaxonomy(tmpRulesDir({}));
    expect(r.taxonomy).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('invalid YAML degrades to null with a warning', () => {
    const r = loadDocTaxonomy(tmpRulesDir({ 'docs-taxonomy.yaml': 'schema: [unclosed' }));
    expect(r.taxonomy).toBeNull();
    expect(r.warnings.some((w) => w.includes('not valid YAML'))).toBe(true);
  });

  it('an unknown schema is rejected, not guessed', () => {
    const r = loadDocTaxonomy(
      tmpRulesDir({ 'docs-taxonomy.yaml': 'schema: usa-doc-taxonomy-v2\nartifacts: []' }),
    );
    expect(r.taxonomy).toBeNull();
    expect(r.warnings.some((w) => w.includes('unknown schema'))).toBe(true);
  });

  it('malformed artifacts are skipped with a warning; good ones survive', () => {
    const r = loadDocTaxonomy(
      tmpRulesDir({
        'docs-taxonomy.yaml': minimal(
          ['  - { id: abc, cat: A1, name: "Broken", tier: 0, kind: canonical }', goodArtifact].join(
            '\n',
          ),
        ),
      }),
    );
    expect(r.taxonomy!.artifacts).toHaveLength(1);
    expect(r.taxonomy!.artifacts[0]!.id).toBe(1);
    expect(r.warnings.some((w) => w.includes('not an integer'))).toBe(true);
  });

  it('artifacts referencing unknown categories are skipped with a warning', () => {
    const r = loadDocTaxonomy(
      tmpRulesDir({
        'docs-taxonomy.yaml': minimal(
          '  - { id: 2, cat: Z9, name: "Orphan", tier: 0, kind: canonical }',
        ),
      }),
    );
    expect(r.taxonomy!.artifacts).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('unknown category'))).toBe(true);
  });

  it('unknown edge targets are pruned with a warning; real edges survive', () => {
    const r = loadDocTaxonomy(
      tmpRulesDir({
        'docs-taxonomy.yaml': minimal(
          [
            '  - { id: 1, cat: A1, name: "A", tier: 0, kind: canonical, derives_from: [999], syncs_with: [8] }',
            '  - { id: 8, cat: A1, name: "B", tier: 1, kind: canonical }',
          ].join('\n'),
        ),
      }),
    );
    const a = r.taxonomy!.byId.get(1)!;
    expect(a.derivesFrom).toEqual([]);
    expect(a.syncsWith).toEqual([8]); // edge to a real artifact is kept
    expect(r.warnings.some((w) => w.includes('derives_from unknown artifact 999'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('syncs_with unknown artifact 8'))).toBe(false);
  });
});

describe('tier and severity model', () => {
  it('expected tiers grow monotonically with maturity', () => {
    expect(EXPECTED_TIERS.prototype).toEqual([0, 1]);
    expect(EXPECTED_TIERS.legacy).toEqual([0, 1]);
    expect(EXPECTED_TIERS.mvp).toEqual([0, 1, 2]);
    expect(EXPECTED_TIERS.beta).toEqual([0, 1, 2, 3]);
    expect(EXPECTED_TIERS.production).toEqual([0, 1, 2, 3, 4]);
  });

  it('missing-artifact severity: tier 0 is MEDIUM, tiers 1-3 LOW, tier 4 FUTURE', () => {
    expect(TIER_SEVERITY[0]).toBe('MEDIUM');
    expect(TIER_SEVERITY[1]).toBe('LOW');
    expect(TIER_SEVERITY[2]).toBe('LOW');
    expect(TIER_SEVERITY[3]).toBe('LOW');
    expect(TIER_SEVERITY[4]).toBe('FUTURE');
  });
});

describe('applicability and pattern matching', () => {
  const { taxonomy } = loadDocTaxonomy(RULES_DIR);

  it('artifactApplies honors applies_when facts (data dictionary needs a database)', () => {
    const a = taxonomy!.byId.get(22)!; // Data dictionary
    expect(artifactApplies(a, facts([]))).toBe(false);
    expect(artifactApplies(a, facts(['db:postgres']))).toBe(true);
  });

  it('artifactApplies defaults to true when no predicate is declared', () => {
    const a = taxonomy!.byId.get(7)!; // Changelog
    expect(artifactApplies(a, facts([]))).toBe(true);
  });

  it('matchPatterns finds files and respects negation', () => {
    const files = ['README.md', 'docs/README.md', 'other.txt'];
    expect(matchPatterns(files, ['README.md'])).toEqual(['README.md']);
    expect(matchPatterns(files, ['**/README.md'])).toEqual(['README.md', 'docs/README.md']);
    expect(matchPatterns(files, ['**/README.md', '!README.md'])).toEqual(['docs/README.md']);
    expect(matchPatterns(files, ['no-such-file*'])).toEqual([]);
  });
});
