import { describe, it, expect, afterEach } from 'vitest';
import { auditAt, makeProject, RULES_DIR } from '../helpers.js';
import {
  loadDocAuditContext,
  runDocAudit,
  type DocAuditResult,
} from '../../src/engine/docs-audit.js';
import { analyzeImpact } from '../../src/engine/docs-impact.js';
import { evaluateGateForFindings } from '../../src/engine/gate.js';
import { DEFAULT_TAXONOMY_RULES } from './docs-audit-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** The shared fixture (see docs-audit-fixture.ts): a small Express app. */
function fixture() {
  const p = makeProject(DEFAULT_TAXONOMY_RULES);
  cleanups.push(p.cleanup);
  return p.root;
}

function docAudit(
  root: string,
  over: Partial<Parameters<typeof runDocAudit>[0]> = {},
): DocAuditResult {
  const { context, taxonomy, warnings } = loadDocAuditContext(root, RULES_DIR);
  expect(warnings).toEqual([]);
  expect(context).not.toBeNull();
  expect(taxonomy).not.toBeNull();
  return runDocAudit({
    project: context!.project,
    facts: context!.facts,
    taxonomy: taxonomy!,
    maturity: 'mvp',
    usaVersion: 'test',
    target: root,
    ...over,
  });
}

describe('documentation universe inventory (AC-6/15)', () => {
  it('detects present artifacts and flags missing expected ones by tier', () => {
    const root = fixture();
    const r = docAudit(root);

    const readme = r.inventory
      .find((c) => c.id === 'A4')!
      .entries.find((e) => e.artifact.id === 61)!;
    expect(readme.status).toBe('PRESENT');

    const changelog = r.inventory
      .find((c) => c.id === 'A1')!
      .entries.find((e) => e.artifact.id === 7)!;
    expect(changelog.status).toBe('MISSING');
    expect(changelog.expected).toBe(true); // tier 0, expected at mvp

    // tier 2 artifacts are also expected at mvp
    const apiRef = r.inventory
      .find((c) => c.id === 'A5')!
      .entries.find((e) => e.artifact.id === 76)!;
    expect(apiRef.expected).toBe(true);

    // totals add up across the full 220-artifact universe
    const t = r.totals;
    expect(t.artifacts).toBe(220);
    expect(t.applicable + t.notApplicable).toBe(220);
    expect(t.present + t.missing + t.manual).toBe(t.applicable);
    expect(t.missing).toBeGreaterThan(0);
  });

  it('expected tiers shrink for younger projects (tier-2 artifacts are not expected at prototype)', () => {
    const root = fixture();
    const r = docAudit(root, { maturity: 'prototype' });
    expect(r.expectedTiers).toEqual([0, 1]);
    const apiRef = r.inventory
      .find((c) => c.id === 'A5')!
      .entries.find((e) => e.artifact.id === 76)!;
    expect(apiRef.expected).toBe(false);
  });
});

describe('determinism and idempotency (AC-2/3)', () => {
  it('two identical runs produce byte-identical results and findings order', () => {
    const root = fixture();
    const a = JSON.stringify(docAudit(root));
    const b = JSON.stringify(docAudit(root));
    expect(a).toBe(b);
  });

  it('impact analysis is deterministic across runs', () => {
    const root = fixture();
    const a = JSON.stringify(docAudit(root, { changedFiles: ['openapi.yaml'] }).impact);
    const b = JSON.stringify(docAudit(root, { changedFiles: ['openapi.yaml'] }).impact);
    expect(a).toBe(b);
  });
});

describe('impact analysis (AC-4, prefer false positives)', () => {
  it('an openapi.yaml change hits the API changelog and propagates to A1 docs cross-category', () => {
    const root = fixture();
    const { context, taxonomy } = loadDocAuditContext(root, RULES_DIR);
    const imp = analyzeImpact(taxonomy!, context!.facts, ['openapi.yaml']);

    const byId = new Map(imp.affected.map((e) => [e.artifact.id, e]));
    expect(byId.has(82)).toBe(true); // A5 API changelog: **/openapi.* source
    expect(byId.has(7)).toBe(true); // A1 Changelog: any-source direct hit
    // #7 (A1) is a direct hit; #82 (A5) derives_from #7, so the A5→A1
    // dependency edge flags the arrival side as cross-category (AC-4).
    expect(byId.get(82)!.crossCategory).toBe(true);
    // transitive: #7 syncs_with #8 (release notes)
    expect(byId.has(8)).toBe(true);
    expect(imp.edgesTraversed).toBeGreaterThan(0);
    expect(imp.noImpact).toEqual([]);
  });

  it('conservative: even an unrecognized file invalidates the any-source core (never "no impact")', () => {
    const root = fixture();
    const { context, taxonomy } = loadDocAuditContext(root, RULES_DIR);
    const imp = analyzeImpact(taxonomy!, context!.facts, ['weird-thing.xyz']);
    // prefer false positives (AC-11): a change to an unknown file still hits
    // the changelog/release-notes core, and nothing falls through silently.
    expect(imp.noImpact).toEqual([]);
    const ids = new Set(imp.affected.map((e) => e.artifact.id));
    expect(ids.has(7)).toBe(true);
    expect(ids.has(8)).toBe(true);
  });

  it('conservative detection: any-source artifacts always absorb a change', () => {
    const root = fixture();
    const { context, taxonomy } = loadDocAuditContext(root, RULES_DIR);
    const imp = analyzeImpact(taxonomy!, context!.facts, ['src/app.js']);
    const ids = new Set(imp.affected.map((e) => e.artifact.id));
    expect(ids.has(7)).toBe(true); // Changelog (any-source)
    expect(ids.has(8)).toBe(true); // Release notes (any-source)
  });
});

describe('invariants: machine-generated facts vs docs (AC-1/5/7)', () => {
  it('undocumented HTTP routes fail DOCU-INV-ROUTES with expected/actual detail', () => {
    const root = fixture();
    const r = docAudit(root);
    const routes = r.invariants.find((i) => i.id === 'DOCU-INV-ROUTES')!;
    expect(routes).toBeDefined();
    expect(routes.status).toBe('FAIL');
    // the fixture defines GET /health (documented) and POST /users (not)
    expect(routes.detail).toContain('1 of 2');
    expect(routes.detail).toContain('/users');
    expect(routes.locations.length).toBeGreaterThan(0);
  });

  it('undocumented env vars fail DOCU-INV-ENV (regression: groupsOf looped forever without /g)', () => {
    const root = fixture();
    const r = docAudit(root);
    const env = r.invariants.find((i) => i.id === 'DOCU-INV-ENV')!;
    expect(env).toBeDefined();
    expect(env.status).toBe('FAIL');
    expect(env.detail).toContain('USER_LIMIT');
    expect(env.locations.some((l) => l.file.includes('app.js'))).toBe(true);
  });

  it('failing invariants become findings with actionable remediation (AC-10)', () => {
    const root = fixture();
    const r = docAudit(root);
    const f = r.findings.find((x) => x.ruleId === 'DOCU-INV-ROUTES')!;
    expect(f).toBeDefined();
    expect(f.severity).toBe('LOW');
    expect(f.status).toBe('FAIL');
    expect(f.ruleClass).toBe('documentation');
    expect(f.section).toBe('S12');
    expect(f.remediation).toMatch(/usa docs audit/);
    expect(f.locations.length).toBeGreaterThan(0);
  });
});

describe('gate parity (AC-8/9): --fail-on is the CI check', () => {
  it('standalone findings obey the same severity gate as the main audit', () => {
    const root = fixture();
    const r = docAudit(root);
    const medium = r.findings.filter((f) => f.severity === 'MEDIUM');
    expect(medium.length).toBeGreaterThan(0); // missing tier-0 Changelog
    expect(evaluateGateForFindings(r.findings, 'none', true)).toBe(0);
    expect(evaluateGateForFindings(r.findings, 'critical', true)).toBe(0);
    expect(evaluateGateForFindings(r.findings, 'medium', true)).toBe(1);
    expect(evaluateGateForFindings(r.findings, 'low', true)).toBe(1);
    expect(evaluateGateForFindings(r.findings, 'bogus', true)).toBe(2);
  });
});

describe('main audit injection (AC-8: check == CI)', () => {
  it('without the flag the main audit is unchanged; with it, DOCU findings appear', () => {
    const root = fixture();
    const plain = auditAt(root);
    const withDocs = auditAt(root, { docsUniverse: true });
    const docu = (r: ReturnType<typeof auditAt>) =>
      r.report.findings.filter(
        (f) => f.ruleClass === 'documentation' && f.ruleId.startsWith('DOCU'),
      );
    expect(docu(plain)).toEqual([]);
    expect(docu(withDocs).length).toBeGreaterThan(0);
    // stable across runs (idempotent)
    expect(JSON.stringify(docu(withDocs))).toBe(
      JSON.stringify(docu(auditAt(root, { docsUniverse: true }))),
    );
  });

  it('the .usa.yaml docs.universe setting enables the same injection', () => {
    const root = fixture();
    const viaConfig = auditAt(root, { config: { version: 1, docs: { universe: true } } });
    const docu = viaConfig.report.findings.filter(
      (f) => f.ruleClass === 'documentation' && f.ruleId.startsWith('DOCU'),
    );
    expect(docu.length).toBeGreaterThan(0);
  });
});
