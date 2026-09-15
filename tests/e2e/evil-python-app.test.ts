import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditAt } from '../helpers.js';

/**
 * Adversarial system benchmark, Python sibling (evil-node-app is the
 * pilot): planted violations must fire across rule families, traps must
 * stay quiet. Generated at test time, never committed. Rule IDs asserted
 * present, never scores.
 */
const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) fs.rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function evilApp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-evil-py-'));
  cleanups.push(dir);
  fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask\nrequests==2.31.0\n', 'utf8');
  // Planted: mutable default (PY-005), unsafe load (PY-006), credential (SEC-001).
  fs.writeFileSync(
    path.join(dir, 'app.py'),
    'import yaml\n\n\ndef load(text, opts=[]):\n    return yaml.load(text)\n\n\napi_key = "AKIAIOSFODNN7EXAMPLE"\n',
    'utf8',
  );
  // Trap: secret-adjacent identifiers, no credential, no mutable default, no unsafe load.
  fs.writeFileSync(
    path.join(dir, 'auth.py'),
    'def count(password_hash):\n    return len(str(password_hash))\n',
    'utf8',
  );
  // Planted: clean file, nothing flaggable.
  fs.writeFileSync(path.join(dir, 'clean.py'), 'def add(a, b):\n    return a + b\n', 'utf8');
  // Deliberately absent: README, LICENSE, .gitignore, lockfile, tests.
  return dir;
}

describe('evil-python-app (whole-auditor recall)', () => {
  it('catches the planted issues across rule families', () => {
    const { report } = auditAt(evilApp());
    const byId = new Map(report.findings.map((f) => [f.ruleId, f.status]));
    expect(byId.get('PY-005')).toBe('WRONG');
    expect(byId.get('PY-006')).toBe('FAIL');
    expect(byId.get('SEC-001')).toBe('FAIL');
  });

  it('stays quiet on the trap file and the clean file', () => {
    const { report } = auditAt(evilApp());
    const at = (file: string) =>
      report.findings.filter(
        (f) => f.status !== 'PASS' && f.locations.some((l) => l.file.endsWith(file)),
      );
    expect(
      at('auth.py').filter((f) => ['SEC-001', 'PY-005', 'PY-006'].includes(f.ruleId)),
    ).toHaveLength(0);
    expect(at('clean.py')).toHaveLength(0);
  });
});
