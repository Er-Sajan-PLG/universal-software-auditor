import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  blockingFindings,
  evaluateGate,
  evaluateNewCodeGate,
  newCodeBlocking,
  parseBaselineTrailer,
} from '../../src/engine/gate.js';
import type { TrailerData } from '../../src/engine/diff.js';
import type { AuditReport, Finding, Severity } from '../../src/types.js';

const finding = (severity: Severity, over: Partial<Finding> = {}): Finding => ({
  ruleId: 'X-001',
  title: 'A finding',
  section: 'S2',
  sectionTitle: 'Security',
  severity,
  baseSeverity: severity,
  status: 'MISSING',
  ruleClass: 'security',
  dampened: false,
  message: 'Not detected.',
  locations: [],
  ...over,
});

const report = (findings: Finding[]): AuditReport => ({ findings }) as unknown as AuditReport;

afterEach(() => vi.restoreAllMocks());

describe('quality gate', () => {
  // This is a regression test for an inverted comparison that made
  // `--fail-on critical` block every finding in the report, including FUTURE.
  it('--fail-on critical blocks only CRITICAL findings', () => {
    const r = report([
      finding('CRITICAL'),
      finding('HIGH'),
      finding('MEDIUM'),
      finding('LOW'),
      finding('FUTURE'),
    ]);
    const blocked = blockingFindings(r, 'CRITICAL');
    expect(blocked.map((f) => f.severity)).toEqual(['CRITICAL']);
  });

  it('lowering the threshold blocks more, never fewer', () => {
    const r = report([finding('CRITICAL'), finding('HIGH'), finding('MEDIUM'), finding('LOW')]);
    expect(blockingFindings(r, 'LOW')).toHaveLength(4);
    expect(blockingFindings(r, 'MEDIUM')).toHaveLength(3);
    expect(blockingFindings(r, 'HIGH')).toHaveLength(2);
    expect(blockingFindings(r, 'CRITICAL')).toHaveLength(1);
  });

  it('FUTURE findings are below every other rung', () => {
    const r = report([finding('FUTURE')]);
    expect(blockingFindings(r, 'FUTURE')).toHaveLength(1);
    expect(blockingFindings(r, 'LOW')).toHaveLength(0);
  });

  it('never blocks passing, unverified, or accepted-risk findings', () => {
    const r = report([
      finding('CRITICAL', { status: 'PASS' }),
      finding('CRITICAL', { status: 'UNKNOWN' }),
      finding('CRITICAL', { suppressedReason: 'accepted in ADR-007' }),
      finding('CRITICAL', { status: 'NOT_APPLICABLE' }),
    ]);
    expect(blockingFindings(r, 'CRITICAL')).toHaveLength(0);
  });

  it('an accepted risk is still a finding, just not a blocker', () => {
    const r = report([finding('HIGH', { suppressedReason: 'accepted' })]);
    expect(r.findings).toHaveLength(1);
    expect(blockingFindings(r, 'HIGH')).toHaveLength(0);
  });

  describe('exit codes', () => {
    it('is 0 when nothing meets the threshold', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(evaluateGate(report([finding('LOW')]), 'critical', false)).toBe(0);
      expect(err).not.toHaveBeenCalled();
    });

    it('is 1 and names the findings when the gate trips', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(
        evaluateGate(report([finding('CRITICAL', { ruleId: 'SEC-001' })]), 'critical', false),
      ).toBe(1);
      expect(err.mock.calls.flat().join('\n')).toContain('SEC-001');
    });

    it('is silent under --quiet even when it trips', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(evaluateGate(report([finding('CRITICAL')]), 'critical', true)).toBe(1);
      expect(err).not.toHaveBeenCalled();
    });

    it('is 2 for an unrecognised threshold, not a silent pass', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(evaluateGate(report([]), 'catastrophic', false)).toBe(2);
      expect(err).toHaveBeenCalled();
    });

    it('"none" disables the gate entirely', () => {
      expect(evaluateGate(report([finding('CRITICAL')]), 'none', false)).toBe(0);
    });

    it('is case-insensitive', () => {
      expect(evaluateGate(report([finding('HIGH')]), 'High', true)).toBe(1);
    });
  });
});

describe('new-code gate (--baseline)', () => {
  const baseline = (rules: Record<string, { status: string; severity: string }>): TrailerData => ({
    rules: Object.fromEntries(
      Object.entries(rules).map(([id, r]) => [id, { ...r, section: 'S2' }]),
    ),
  });

  const open = (ruleId: string, severity: Severity = 'HIGH'): Finding =>
    finding(severity, { ruleId, status: 'FAIL' });

  it('fails on a newly-introduced HIGH finding', () => {
    const r = report([open('SEC-001'), open('SEC-999')]);
    const base = baseline({ 'SEC-001': { status: 'FAIL', severity: 'HIGH' } });
    expect(newCodeBlocking(r, base, 'HIGH').map((f) => f.ruleId)).toEqual(['SEC-999']);
    expect(evaluateNewCodeGate(r, base, 'high', true)).toBe(1);
  });

  it('passes legacy-only HIGH findings that were already open', () => {
    const r = report([open('SEC-001'), open('SEC-002')]);
    const base = baseline({
      'SEC-001': { status: 'FAIL', severity: 'HIGH' },
      'SEC-002': { status: 'MISSING', severity: 'HIGH' },
    });
    expect(newCodeBlocking(r, base, 'HIGH')).toHaveLength(0);
    expect(evaluateNewCodeGate(r, base, 'high', true)).toBe(0);
  });

  it('fails on a regressed rule (PASS → open)', () => {
    const r = report([open('SEC-001')]);
    const base = baseline({ 'SEC-001': { status: 'PASS', severity: 'HIGH' } });
    expect(newCodeBlocking(r, base, 'HIGH').map((f) => f.ruleId)).toEqual(['SEC-001']);
    expect(evaluateNewCodeGate(r, base, 'high', true)).toBe(1);
  });

  it('fails on a regression even below the severity threshold', () => {
    const r = report([open('SEC-002', 'MEDIUM')]);
    const base = baseline({ 'SEC-002': { status: 'PASS', severity: 'MEDIUM' } });
    expect(evaluateNewCodeGate(r, base, 'high', true)).toBe(1);
  });

  it('ignores newly-introduced findings below the threshold', () => {
    const r = report([open('DOC-001', 'LOW')]);
    expect(evaluateNewCodeGate(r, baseline({}), 'high', true)).toBe(0);
  });

  it('never blocks fixed, suppressed, or newly-passing rules', () => {
    const r = report([
      finding('HIGH', { ruleId: 'SEC-001', status: 'PASS' }),
      finding('HIGH', { ruleId: 'SEC-002', status: 'FAIL', suppressedReason: 'accepted' }),
    ]);
    const base = baseline({
      'SEC-001': { status: 'FAIL', severity: 'HIGH' },
      'SEC-002': { status: 'PASS', severity: 'HIGH' },
    });
    expect(evaluateNewCodeGate(r, base, 'high', true)).toBe(0);
  });

  it('names the blocking rules on stderr unless quiet', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = report([open('SEC-999')]);
    expect(evaluateNewCodeGate(r, baseline({}), 'high', false)).toBe(1);
    expect(err.mock.calls.flat().join('\n')).toContain('SEC-999');
  });

  it('"none" disables the gate and bad thresholds exit 2', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = report([open('SEC-999')]);
    expect(evaluateNewCodeGate(r, baseline({}), 'none', true)).toBe(0);
    expect(evaluateNewCodeGate(r, baseline({}), 'catastrophic', false)).toBe(2);
    expect(err).toHaveBeenCalled();
  });

  describe('parseBaselineTrailer fails closed', () => {
    it('rejects empty and non-mapping documents', () => {
      expect(() => parseBaselineTrailer('')).toThrow();
      expect(() => parseBaselineTrailer('just a string')).toThrow();
      expect(() => parseBaselineTrailer('42')).toThrow();
    });

    it('rejects YAML without a rules section', () => {
      expect(() => parseBaselineTrailer('schema: usa-report-v1\noverall: 70\n')).toThrow(/rules/);
    });

    it('rejects invalid YAML and malformed rule entries', () => {
      expect(() => parseBaselineTrailer('rules: [unclosed')).toThrow();
      expect(() => parseBaselineTrailer('rules:\n  "SEC-001": {status: FAIL}\n')).toThrow(
        /SEC-001/,
      );
    });

    it('accepts a well-formed trailer', () => {
      const parsed = parseBaselineTrailer(
        'schema: usa-report-v1\noverall: 70\nrules:\n  "SEC-001": {status: FAIL, severity: HIGH, section: S2}\n',
      );
      expect(parsed.rules?.['SEC-001']?.status).toBe('FAIL');
    });
  });
});
