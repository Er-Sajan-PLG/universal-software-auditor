import { describe, it, expect, afterEach } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { makeProject, auditAt } from '../helpers.js';
import { renderJson } from '../../src/report/json.js';
import { renderSarif } from '../../src/report/sarif.js';
import { renderMarkdown, parseTrailer } from '../../src/report/markdown.js';

/**
 * Consumer contracts for machine-readable outputs (TAS-004). Agents and
 * tooling parse these shapes, so any accidental change must fail loudly
 * here instead of silently breaking downstream. All three documents are
 * generated from one real audit — the contracts assert the shapes agree
 * with each other, not just with themselves.
 */
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function realReport() {
  const { root, cleanup } = makeProject({
    'package.json': JSON.stringify({ name: 'shapes', version: '0.0.1' }),
    'index.js': 'const apiKey = "AKIAIOSFODNN7EXAMPLE";\n',
  });
  cleanups.push(cleanup);
  return auditAt(root);
}

const STATUSES = [
  'PASS',
  'FAIL',
  'WRONG',
  'MISSING',
  'UNKNOWN',
  'SKIPPED',
  'DEPRECATED',
  'EXPERIMENTAL',
];
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'FUTURE'];

describe('report shape contracts (TAS-004)', () => {
  it('JSON envelope carries the stable consumer shape', () => {
    const { report } = realReport();
    const doc = JSON.parse(renderJson(report)) as Record<string, unknown>;
    expect(doc['schema']).toBe('usa-report-json-v1');
    expect(typeof doc['generatedAt']).toBe('string');
    expect(typeof doc['usaVersion']).toBe('string');
    const findings = doc['findings'] as Array<Record<string, unknown>>;
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(typeof f['ruleId']).toBe('string');
      expect(STATUSES).toContain(f['status']);
      expect(SEVERITIES).toContain(f['severity']);
      expect(typeof f['message']).toBe('string');
      expect(Array.isArray(f['locations'])).toBe(true);
    }
  });

  it('SARIF log is a valid 2.1.0 document with consistent rule indices', () => {
    const { report } = realReport();
    const log = JSON.parse(renderSarif(report)) as {
      version: string;
      runs: Array<{
        tool: { driver: { name: string; version: string; rules: Array<{ id: string }> } };
        results: Array<{
          ruleId: string;
          ruleIndex: number;
          message: { text: string };
          locations: unknown[];
        }>;
      }>;
    };
    expect(log.version).toBe('2.1.0');
    expect(log.runs).toHaveLength(1);
    const driver = log.runs[0]!.tool.driver;
    expect(driver.name.length).toBeGreaterThan(0);
    expect(typeof driver.version).toBe('string');
    const results = log.runs[0]!.results;
    for (const r of results) {
      expect(typeof r.message.text).toBe('string');
      expect(Array.isArray(r.locations)).toBe(true);
      expect(driver.rules[r.ruleIndex]?.id).toBe(r.ruleId);
    }
  });

  it('Markdown trailer parses to the versioned summary shape', () => {
    const { report, profile } = realReport();
    const raw = parseTrailer(renderMarkdown(report, profile));
    expect(raw).not.toBeNull();
    const trailer = parseYaml(raw!) as {
      schema: string;
      overall: number;
      sections: Record<string, unknown>;
      severity_totals: Record<string, number>;
      rules: Record<string, { status: string; severity: string; section: string }>;
    };
    expect(trailer.schema).toBe('usa-report-v1');
    expect(typeof trailer.overall).toBe('number');
    expect(typeof trailer.sections).toBe('object');
    expect(typeof trailer.severity_totals).toBe('object');
    for (const [id, r] of Object.entries(trailer.rules)) {
      expect(id.length).toBeGreaterThan(0);
      expect(STATUSES).toContain(r.status);
      expect(SEVERITIES).toContain(r.severity);
      expect(typeof r.section).toBe('string');
    }
  });

  it('formats agree: every SARIF result exists in the JSON findings', () => {
    const { report } = realReport();
    const jsonIds = new Set(
      (JSON.parse(renderJson(report)) as { findings: Array<{ ruleId: string }> }).findings.map(
        (f) => f.ruleId,
      ),
    );
    const sarifIds = (
      JSON.parse(renderSarif(report)) as { runs: Array<{ results: Array<{ ruleId: string }> }> }
    ).runs[0]!.results.map((r) => r.ruleId);
    expect(sarifIds.length).toBeGreaterThan(0);
    for (const id of sarifIds) expect(jsonIds.has(id)).toBe(true);
  });
});
