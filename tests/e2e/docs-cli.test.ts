import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { main } from '../../src/cli.js';
import { makeProject } from '../helpers.js';
import { DEFAULT_TAXONOMY_RULES } from '../integration/docs-audit-fixture.js';

const tmpRoots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (tmpRoots.length) fs.rmSync(tmpRoots.pop()!, { recursive: true, force: true });
});

function fixtureRoot(): string {
  const p = makeProject(DEFAULT_TAXONOMY_RULES);
  tmpRoots.push(p.root);
  return p.root;
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

describe('usa docs (CLI)', () => {
  it('--help lists the three subcommands without touching the filesystem', () => {
    const r = run(['docs', '--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('usa docs audit');
    expect(r.out).toContain('usa docs impact');
    expect(r.out).toContain('usa docs coverage');
  });

  it('audit writes a markdown report with the full section set', () => {
    const root = fixtureRoot();
    const out = path.join(root, 'DOC-AUDIT.md');
    const r = run(['docs', 'audit', root, '--out', out]);
    expect(r.code).toBe(0);
    const md = fs.readFileSync(out, 'utf8');
    expect(md).toMatch(/^# Documentation audit/);
    expect(md).toContain('## Verification report');
    expect(md).toContain('## Tier coverage');
    expect(md).toContain('## Invariants');
    expect(md).toContain('## Open findings');
    expect(md).toContain('DOCU-INV-ROUTES');
    expect(r.out).toContain(`report → ${out}`);
  });

  it('audit is deterministic: two runs write identical bytes', () => {
    const root = fixtureRoot();
    const a = path.join(root, 'A.md');
    const b = path.join(root, 'B.md');
    expect(run(['docs', 'audit', root, '--out', a, '--quiet'])).toMatchObject({ code: 0 });
    expect(run(['docs', 'audit', root, '--out', b, '--quiet'])).toMatchObject({ code: 0 });
    expect(fs.readFileSync(a, 'utf8')).toBe(fs.readFileSync(b, 'utf8'));
  });

  it('audit --format json writes machine-readable schema usa-doc-audit-v1', () => {
    const root = fixtureRoot();
    const out = path.join(root, 'DOC-AUDIT.json');
    const r = run(['docs', 'audit', root, '--out', out, '--format', 'json']);
    expect(r.code).toBe(0);
    const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(doc.schema).toBe('usa-doc-audit-v1');
    expect(doc.taxonomy.artifacts).toBe(220);
    expect(doc.taxonomy.categories).toBe(14);
    expect(doc.invariants.some((i: { id: string }) => i.id === 'DOCU-INV-ROUTES')).toBe(true);
  });

  it('audit --fail-on mirrors the gate: medium fails, none passes', () => {
    const root = fixtureRoot();
    const out = path.join(root, 'X.md');
    expect(
      run(['docs', 'audit', root, '--out', out, '--fail-on', 'none', '--quiet']),
    ).toMatchObject({ code: 0 });
    expect(
      run(['docs', 'audit', root, '--out', out, '--fail-on', 'medium', '--quiet']),
    ).toMatchObject({ code: 1 });
    expect(
      run(['docs', 'audit', root, '--out', out, '--fail-on', 'critical', '--quiet']),
    ).toMatchObject({ code: 0 });
  });

  it('audit rejects an unknown profile with usage error 2', () => {
    const root = fixtureRoot();
    const r = run(['docs', 'audit', root, '--profile', 'bogus', '--out', path.join(root, 'X.md')]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/profile/i);
  });

  it('coverage reports the full taxonomy: 14 categories, 220 artifacts', () => {
    const root = fixtureRoot();
    const r = run(['docs', 'coverage', root, '--format', 'json']);
    expect(r.code).toBe(0);
    const doc = JSON.parse(r.out);
    expect(doc.schema).toBe('usa-doc-coverage-v1');
    expect(doc.categories).toHaveLength(14);
    expect(doc.totals.artifacts).toBe(220);
    expect(doc.totals.applicable + doc.totals.notApplicable).toBe(220);
  });

  it('impact reports affected artifacts for a changed file (cross-category marked)', () => {
    const root = fixtureRoot();
    const r = run(['docs', 'impact', root, '--changed', 'openapi.yaml', '--format', 'json']);
    expect(r.code).toBe(0);
    const doc = JSON.parse(r.out);
    expect(doc.schema).toBe('usa-doc-impact-v1');
    const ids = doc.affected.map((e: { id: number }) => e.id);
    expect(ids).toContain(82); // A5 API changelog
    expect(ids).toContain(7); // A1 Changelog (any-source)
    expect(doc.affected.find((e: { id: number }) => e.id === 82).crossCategory).toBe(true);
    expect(doc.affected.find((e: { id: number }) => e.id === 8)).toBeTruthy(); // transitive
  });

  it('impact errors clearly when no changes are given', () => {
    const root = fixtureRoot();
    const r = run(['docs', 'impact', root]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/--changed|--describe/i);
  });

  it('--describe explains what a file feeds', () => {
    const root = fixtureRoot();
    const r = run(['docs', 'impact', root, '--describe', 'openapi.yaml', '--format', 'json']);
    expect(r.code).toBe(0);
    const doc = JSON.parse(r.out);
    expect(doc.schema).toBe('usa-doc-describe-v1');
    expect(doc.file).toBe('openapi.yaml');
    expect(doc.invalidates.length).toBeGreaterThan(0); // a change to it invalidates API docs
    expect(doc.invalidates).toContain(82); // A5 API changelog
  });
});
