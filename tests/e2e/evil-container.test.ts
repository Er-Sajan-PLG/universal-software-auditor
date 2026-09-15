import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditAt } from '../helpers.js';

/**
 * Adversarial system benchmark, container sibling: a root-running image
 * (CTNR-001) plus a committed secret (SEC-001). Generated at test time,
 * never committed. Rule IDs asserted present, never scores.
 */
const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) fs.rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function evilApp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-evil-ctnr-'));
  cleanups.push(dir);
  // Planted: no USER directive — runs as root (CTNR-001). The trailing
  // comment is the trap: secret-adjacent words, no credential.
  fs.writeFileSync(
    path.join(dir, 'Dockerfile'),
    'FROM python:3.12\nCOPY . /app\nCMD ["python", "/app/app.py"]\n# password_hash is not a credential\n',
    'utf8',
  );
  // Planted: committed credential (SEC-001).
  fs.writeFileSync(path.join(dir, '.env'), 'API_KEY="AKIAIOSFODNN7EXAMPLE"\n', 'utf8');
  // Planted: clean file, nothing flaggable.
  fs.writeFileSync(path.join(dir, 'clean.sh'), '#!/bin/sh\necho hi\n', 'utf8');
  // Deliberately absent: README, LICENSE, .gitignore.
  return dir;
}

describe('evil-container (whole-auditor recall)', () => {
  it('catches the planted issues across rule families', () => {
    const { report } = auditAt(evilApp());
    const byId = new Map(report.findings.map((f) => [f.ruleId, f.status]));
    expect(byId.get('CTNR-001')).toBe('MISSING');
    expect(byId.get('SEC-001')).toBe('FAIL');
  });

  it('stays quiet on the trap comment and the clean file', () => {
    const { report } = auditAt(evilApp());
    const at = (file: string) =>
      report.findings.filter(
        (f) => f.status !== 'PASS' && f.locations.some((l) => l.file.endsWith(file)),
      );
    expect(at('Dockerfile').filter((f) => f.ruleId === 'SEC-001')).toHaveLength(0);
    expect(at('clean.sh')).toHaveLength(0);
  });
});
