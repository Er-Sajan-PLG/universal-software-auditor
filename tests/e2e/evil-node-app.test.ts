import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditAt } from '../helpers.js';

/**
 * Adversarial system benchmark, pilot (review 1, §46): a deliberately
 * insecure little app, generated at test time (never committed, so its
 * planted secrets cannot trip this repo's own audit). Asserts the whole
 * auditor — not individual rules — catches the planted issues and stays
 * quiet on the trap file. Rule IDs asserted present, never scores: scores
 * move when rules improve, planted issues must not stop firing.
 */
const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) fs.rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function evilApp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-evil-'));
  cleanups.push(dir);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'evil', version: '0.0.1', dependencies: { express: '^4.0.0' } }),
  );
  fs.mkdirSync(path.join(dir, 'src'));
  // Planted: hardcoded credential (SEC-001 must fire here).
  fs.writeFileSync(
    path.join(dir, 'src', 'config.js'),
    'const apiKey = "AKIAIOSFODNN7EXAMPLE";\nmodule.exports = { apiKey };\n',
  );
  // Trap: looks secret-adjacent, is not a credential (SEC-001 must stay quiet).
  fs.writeFileSync(
    path.join(dir, 'src', 'auth.js'),
    'function hashName(password_hash) {\n  return String(password_hash).length;\n}\n' +
      'module.exports = { hashName };\n',
  );
  // Planted: clean file, nothing flaggable (no finding may locate here).
  fs.writeFileSync(
    path.join(dir, 'src', 'clean.js'),
    'module.exports = { add: (a, b) => a + b };\n',
  );
  // Planted: one test file (TEST-003 needs five; TEST-001 passes).
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(
    path.join(dir, 'tests', 'clean.test.js'),
    "const { add } = require('../src/clean.js');\n" +
      'if (add(1, 2) !== 3) throw new Error("math broke");\n',
  );
  // Deliberately absent: README, LICENSE, .gitignore, any lockfile.
  return dir;
}

describe('evil-node-app (whole-auditor recall pilot)', () => {
  it('catches the planted issues across rule families', () => {
    const { report } = auditAt(evilApp());
    const fired = new Set(report.findings.map((f) => f.ruleId));
    expect(fired.has('SEC-001')).toBe(true);
    expect(fired.has('SUP-001')).toBe(true);
    expect(fired.has('TEST-003')).toBe(true);
    expect(fired.has('FND-001')).toBe(true);
  });

  it('stays quiet on the trap file and the clean file', () => {
    const { report } = auditAt(evilApp());
    // Open findings only: PASS entries carry their evidence locations too.
    const at = (file: string) =>
      report.findings.filter(
        (f) => f.status !== 'PASS' && f.locations.some((l) => l.file.endsWith(file)),
      );
    // Looks secret-adjacent, is not a credential.
    expect(at('src/auth.js').filter((f) => f.ruleId === 'SEC-001')).toHaveLength(0);
    // Nothing flaggable at all.
    expect(at('src/clean.js')).toHaveLength(0);
  });
});
