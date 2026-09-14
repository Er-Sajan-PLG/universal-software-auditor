import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../../src/cli.js';
import { TRAILER_BEGIN, TRAILER_END } from '../../src/report/markdown.js';
import {
  SIGNATURE_SCHEMA,
  formatDetachedSignature,
  isCosignAvailable,
  sha256Hex,
  type DetachedSignature,
} from '../../src/report/signature.js';

afterEach(() => {
  vi.restoreAllMocks();
});

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

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
const mkTmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-verify-cli-'));
  tmpDirs.push(dir);
  return dir;
};

const TRAILER_YAML = 'schema: usa-report-v1\noverall: 50\n';
const payloadFor = (yaml: string): Buffer => Buffer.from(`${yaml}\n`, 'utf8');

function writeReport(dir: string, yaml: string = TRAILER_YAML): string {
  const md = `# Audit\n\n${TRAILER_BEGIN}\n\`\`\`yaml\n${yaml}\`\`\`\n${TRAILER_END}\n`;
  const p = path.join(dir, 'AUDIT.md');
  fs.writeFileSync(p, md, 'utf8');
  return p;
}

function writeSidecar(dir: string, sig: DetachedSignature): string {
  const p = path.join(dir, 'AUDIT.md.sig.json');
  fs.writeFileSync(p, formatDetachedSignature(sig), 'utf8');
  return p;
}

const dummySidecar = (yaml: string = TRAILER_YAML): DetachedSignature => ({
  schema: SIGNATURE_SCHEMA,
  payloadSha256: sha256Hex(payloadFor(yaml)),
  bundle: Buffer.from('{}', 'utf8').toString('base64'),
});

describe('verify-report usage and malformed input (exit 2, loud)', () => {
  it('requires a report path and --bundle', () => {
    const noArgs = run(['verify-report']);
    expect(noArgs.code).toBe(2);
    expect(noArgs.err).toContain('Usage: usa verify-report');
    const dir = mkTmp();
    const report = writeReport(dir);
    const noBundle = run(['verify-report', report]);
    expect(noBundle.code).toBe(2);
    expect(noBundle.err).toContain('Usage: usa verify-report');
  });

  it('is listed in --help', () => {
    const r = run(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('usa verify-report <AUDIT.md>');
  });

  it('missing report file exits 2 even when quiet', () => {
    const dir = mkTmp();
    const sidecar = writeSidecar(dir, dummySidecar());
    const r = run(['verify-report', path.join(dir, 'missing.md'), '--bundle', sidecar, '--quiet']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('not found or unreadable');
  });

  it('missing sidecar file exits 2', () => {
    const dir = mkTmp();
    const report = writeReport(dir);
    const r = run(['verify-report', report, '--bundle', path.join(dir, 'missing.sig.json')]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('not found or unreadable');
  });

  it('report without a trailer exits 2', () => {
    const dir = mkTmp();
    const report = path.join(dir, 'AUDIT.md');
    fs.writeFileSync(report, '# Audit\n\nno trailer here\n', 'utf8');
    const sidecar = writeSidecar(dir, dummySidecar());
    const r = run(['verify-report', report, '--bundle', sidecar]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('no machine-readable trailer');
  });

  it.each([
    ['not json at all', 'not valid JSON'],
    [
      '{"schema":"nope","payloadSha256":"' + 'a'.repeat(64) + '","bundle":"e30="}',
      'unsupported signature schema',
    ],
  ])('malformed sidecar exits 2 (%s)', (raw, message) => {
    const dir = mkTmp();
    const report = writeReport(dir);
    const sidecar = path.join(dir, 'AUDIT.md.sig.json');
    fs.writeFileSync(sidecar, raw, 'utf8');
    const r = run(['verify-report', report, '--bundle', sidecar]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('malformed');
    expect(r.err).toContain(message);
  });
});

describe('verify-report verdicts without cosign', () => {
  it('hash mismatch exits 1 (tampered report, no key or cosign needed)', () => {
    const dir = mkTmp();
    const report = writeReport(dir);
    const forged = dummySidecar('schema: usa-report-v1\noverall: 99\n');
    const sidecar = writeSidecar(dir, forged);
    const r = run(['verify-report', report, '--bundle', sidecar]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/hash mismatch/);
  });

  it('--quiet suppresses the mismatch detail but keeps exit 1', () => {
    const dir = mkTmp();
    const report = writeReport(dir);
    const sidecar = writeSidecar(dir, dummySidecar('schema: usa-report-v1\noverall: 99\n'));
    const r = run(['verify-report', report, '--bundle', sidecar, '--quiet']);
    expect(r.code).toBe(1);
    expect(r.err).toBe('');
    expect(r.out).toBe('');
  });

  it('missing public key fails closed with exit 1', () => {
    const dir = mkTmp();
    const report = writeReport(dir);
    const sidecar = writeSidecar(dir, dummySidecar());
    const r = run(['verify-report', report, '--bundle', sidecar]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/no public key/);
  });

  it('absent cosign binary exits 2 with an explicit error, never a pass', () => {
    const dir = mkTmp();
    const report = writeReport(dir);
    const sidecar = writeSidecar(dir, dummySidecar());
    const keyPath = path.join(dir, 'k.pub');
    fs.writeFileSync(keyPath, 'not-a-real-key', 'utf8');
    const r = run([
      'verify-report',
      report,
      '--bundle',
      sidecar,
      '--key',
      keyPath,
      '--cosign-binary',
      '/nonexistent/cosign-for-tests',
    ]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/cosign binary not found/);
  });
});

const hasCosign = isCosignAvailable();

describe.runIf(hasCosign)('verify-report end to end with cosign', () => {
  const keypair = (dir: string): string => {
    execFileSync('cosign', ['generate-key-pair', '--output-key-prefix', path.join(dir, 'k')], {
      env: { ...process.env, COSIGN_PASSWORD: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return path.join(dir, 'k.pub');
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

  it(
    'valid signature verifies (exit 0), tampered trailer fails (exit 1)',
    { timeout: 60_000 },
    () => {
      const dir = mkTmp();
      const pub = keypair(dir);
      const report = writeReport(dir);
      const sidecar = writeSidecar(dir, sign(dir, payloadFor(TRAILER_YAML)));

      const ok = run(['verify-report', report, '--bundle', sidecar, '--key', pub]);
      expect(ok.code).toBe(0);
      expect(ok.out).toContain('Signature verified');

      const quietOk = run(['verify-report', report, '--bundle', sidecar, '--key', pub, '--quiet']);
      expect(quietOk.code).toBe(0);
      expect(quietOk.out).toBe('');

      const tampered = writeReport(dir, 'schema: usa-report-v1\noverall: 51\n');
      const tamperedSidecar = path.join(dir, 'tampered.sig.json');
      fs.copyFileSync(sidecar, tamperedSidecar);
      const bad = run(['verify-report', tampered, '--bundle', tamperedSidecar, '--key', pub]);
      expect(bad.code).toBe(1);
      expect(bad.err).toMatch(/hash mismatch/);
    },
  );
});
