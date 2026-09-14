import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AuditReport, Finding } from '../../src/types.js';
import { trailer } from '../../src/report/markdown.js';
import {
  SIGNATURE_SCHEMA,
  canonicalReportBytes,
  formatDetachedSignature,
  isCosignAvailable,
  parseDetachedSignature,
  sha256Hex,
  verifyDetachedSignature,
  type DetachedSignature,
} from '../../src/report/signature.js';

/**
 * Verify-side only (ADR-0011: USA ships NO signer). The end-to-end test below
 * shells out to the EXTERNAL `cosign` binary as the signer — USA itself never
 * mints; it only parses sidecars and verifies them.
 */

const finding = (over: Partial<Finding>): Finding => ({
  ruleId: 'X-001',
  title: 'A finding',
  section: 'S2',
  sectionTitle: 'Security',
  severity: 'HIGH',
  baseSeverity: 'HIGH',
  status: 'MISSING',
  ruleClass: 'security',
  dampened: false,
  message: 'Not detected.',
  locations: [],
  ...over,
});

const report = (findings: Finding[] = [finding({})]): AuditReport => ({
  schema: 'usa-report-v1',
  generatedAt: '2026-09-08T00:00:00.000Z',
  usaVersion: 'test',
  target: { path: '/tmp/proj', name: 'proj' },
  detection: {
    maturity: 'beta',
    maturitySignals: [],
    projectTypes: [],
    platforms: [],
    languages: [],
    frameworks: [],
    packageManagers: [],
    databases: [],
    flags: [],
    metrics: {},
  },
  options: {
    depth: 'standard',
    profile: 'auto',
    rulesDir: 'rules',
    packsLoaded: [],
    packsSkipped: [],
  },
  score: {
    overall: 50,
    sections: [],
    counts: {
      PASS: 0,
      FAIL: 0,
      WRONG: 0,
      MISSING: 1,
      DEPRECATED: 0,
      EXPERIMENTAL: 0,
      UNKNOWN: 0,
      NOT_APPLICABLE: 0,
    },
    severityCounts: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0, FUTURE: 0 },
    automationCoverage: 0,
    expectedBand: [0, 100],
  },
  findings,
});

/** A structurally valid sidecar with a dummy bundle (never cosign-verified). */
const dummySidecar = (payloadSha256: string): DetachedSignature => ({
  schema: SIGNATURE_SCHEMA,
  payloadSha256,
  bundle: Buffer.from('{}', 'utf8').toString('base64'),
});

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
const mkTmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-sig-test-'));
  tmpDirs.push(dir);
  return dir;
};

describe('canonical payload', () => {
  it('is deterministic and reuses the single trailer projection', () => {
    const r = report();
    expect(canonicalReportBytes(r).equals(canonicalReportBytes(report()))).toBe(true);
    expect(canonicalReportBytes(r).equals(Buffer.from(`${trailer(r)}\n`, 'utf8'))).toBe(true);
  });

  it('changes when the report changes', () => {
    const a = canonicalReportBytes(report());
    const b = canonicalReportBytes(report([finding({ status: 'PASS' })]));
    expect(a.equals(b)).toBe(false);
  });

  it('sha256Hex matches a known vector', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('sidecar format', () => {
  it('round-trips through format/parse and ends with a newline', () => {
    const r = report();
    const formatted = formatDetachedSignature(dummySidecar(sha256Hex(canonicalReportBytes(r))));
    expect(formatted.endsWith('\n')).toBe(true);
    expect(parseDetachedSignature(formatted).payloadSha256).toBe(
      sha256Hex(canonicalReportBytes(r)),
    );
  });

  it.each([
    ['not json at all', 'not valid JSON'],
    ['["an","array"]', 'must be a JSON object'],
    ['{}', 'unsupported signature schema'],
    ['{"schema":"usa-report-sig-v1"}', 'no valid payloadSha256'],
    [
      `{"schema":"usa-report-sig-v1","payloadSha256":"ZZZ","bundle":"${Buffer.from('{}').toString('base64')}"}`,
      'no valid payloadSha256',
    ],
    [
      `{"schema":"usa-report-sig-v1","payloadSha256":"${'a'.repeat(64)}","bundle":"!!!not-base64!!!"}`,
      'no valid bundle',
    ],
    [
      `{"schema":"usa-report-sig-v1","payloadSha256":"${'a'.repeat(64)}","bundle":""}`,
      'no valid bundle',
    ],
  ])('rejects malformed sidecar %s', (raw, message) => {
    expect(() => parseDetachedSignature(raw)).toThrow(message);
  });
});

describe('verifyDetachedSignature without cosign', () => {
  it('tampered payload fails via the bound hash (no cosign needed)', () => {
    const r = report();
    const sig = dummySidecar(sha256Hex(canonicalReportBytes(r)));
    const tampered = Buffer.concat([canonicalReportBytes(r), Buffer.from('x')]);
    const result = verifyDetachedSignature(tampered, sig, {
      publicKeyPath: path.join(mkTmp(), 'missing.pub'),
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/hash mismatch/);
  });

  it('absent binary errors explicitly instead of passing', () => {
    const r = report();
    const sig = dummySidecar(sha256Hex(canonicalReportBytes(r)));
    // The key exists so execution reaches the spawn: the binary is what is absent.
    const dir = mkTmp();
    const keyPath = path.join(dir, 'dummy.pub');
    fs.writeFileSync(keyPath, 'not-a-real-key', 'utf8');
    expect(() =>
      verifyDetachedSignature(canonicalReportBytes(r), sig, {
        publicKeyPath: keyPath,
        cosignBinary: '/nonexistent/cosign-for-tests',
      }),
    ).toThrow(/cosign binary not found/);
  });

  it('missing public key fails closed', () => {
    const r = report();
    const sig = dummySidecar(sha256Hex(canonicalReportBytes(r)));
    // Binary exists here, but the key does not — still a refusal, never a pass.
    const result = verifyDetachedSignature(canonicalReportBytes(r), sig, {
      publicKeyPath: path.join(mkTmp(), 'missing.pub'),
      cosignBinary: process.execPath,
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/public key not found/);
  });
});

const hasCosign = isCosignAvailable();

describe.runIf(hasCosign)('verifyDetachedSignature with cosign', () => {
  /** Ephemeral keypair via the EXTERNAL signer (test fixture only — not USA minting). */
  const keypair = (dir: string): { pub: string } => {
    execFileSync('cosign', ['generate-key-pair', '--output-key-prefix', path.join(dir, 'k')], {
      env: { ...process.env, COSIGN_PASSWORD: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { pub: path.join(dir, 'k.pub') };
  };
  const sign = (dir: string, payload: Buffer): DetachedSignature => {
    const blob = path.join(dir, 'payload.bin');
    const bundlePath = path.join(dir, 'payload.bundle');
    fs.writeFileSync(blob, payload);
    execFileSync(
      'cosign',
      ['sign-blob', '--key', path.join(dir, 'k.key'), '--bundle', bundlePath, '--yes', blob],
      {
        env: { ...process.env, COSIGN_PASSWORD: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return {
      schema: SIGNATURE_SCHEMA,
      payloadSha256: sha256Hex(payload),
      bundle: fs.readFileSync(bundlePath).toString('base64'),
    };
  };

  it('valid signature verifies', { timeout: 60_000 }, () => {
    const dir = mkTmp();
    const { pub } = keypair(dir);
    const r = report();
    const payload = canonicalReportBytes(r);
    const sig = sign(dir, payload);
    // Sidecar survives a format/parse round-trip before verification.
    const result = verifyDetachedSignature(
      r,
      parseDetachedSignature(formatDetachedSignature(sig)),
      {
        publicKeyPath: pub,
      },
    );
    expect(result.ok).toBe(true);
  });

  it('cosign itself rejects a payload the sidecar hash was forged for', { timeout: 60_000 }, () => {
    const dir = mkTmp();
    const { pub } = keypair(dir);
    const payload = canonicalReportBytes(report());
    const sig = sign(dir, payload);
    // Forge the bound hash so the fast path passes and cosign must catch it.
    const forged = { ...sig, payloadSha256: sha256Hex(Buffer.concat([payload, Buffer.from('x')])) };
    const result = verifyDetachedSignature(Buffer.concat([payload, Buffer.from('x')]), forged, {
      publicKeyPath: pub,
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/rejected/);
  });
});

describe.skipIf(hasCosign)('verifyDetachedSignature without cosign installed', () => {
  it('skips gracefully when cosign is absent', () => {
    expect(isCosignAvailable('/nonexistent/cosign-for-tests')).toBe(false);
  });
});
