import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditAt } from '../helpers.js';

/**
 * Adversarial system benchmark, Go sibling: planted panic-in-handler
 * (GO-004) plus a hardcoded credential (SEC-001). Generated at test
 * time, never committed. Rule IDs asserted present, never scores.
 */
const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) fs.rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function evilApp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-evil-go-'));
  cleanups.push(dir);
  fs.writeFileSync(path.join(dir, 'go.mod'), 'module evil\n\ngo 1.21\n', 'utf8');
  fs.mkdirSync(path.join(dir, 'handlers'));
  // Planted: panic in a request path (GO-004). Not main.go, not cmd/ —
  // the rule's exclusions must not swallow a real handler panic.
  fs.writeFileSync(
    path.join(dir, 'handlers', 'get.go'),
    'package handlers\n\nfunc Get(id string) string {\n\tif id == "" {\n\t\tpanic("missing id")\n\t}\n\treturn id\n}\n',
    'utf8',
  );
  // Planted: hardcoded credential (SEC-001).
  fs.writeFileSync(
    path.join(dir, 'main.go'),
    'package main\n\nimport "fmt"\n\nvar apiKey = "AKIAIOSFODNN7EXAMPLE"\n\nfunc main() { fmt.Println(apiKey) }\n',
    'utf8',
  );
  // Trap: secret-adjacent identifier, no credential, no panic.
  fs.writeFileSync(
    path.join(dir, 'auth.go'),
    'package main\n\nfunc namelen(password_hash string) int { return len(password_hash) }\n',
    'utf8',
  );
  // Deliberately absent: README, LICENSE, .gitignore, tests.
  return dir;
}

describe('evil-go-service (whole-auditor recall)', () => {
  it('catches the planted issues across rule families', () => {
    const { report } = auditAt(evilApp());
    const byId = new Map(report.findings.map((f) => [f.ruleId, f.status]));
    expect(byId.get('GO-004')).toBe('FAIL');
    expect(byId.get('SEC-001')).toBe('FAIL');
  });

  it('stays quiet on the trap file', () => {
    const { report } = auditAt(evilApp());
    const at = (file: string) =>
      report.findings.filter(
        (f) => f.status !== 'PASS' && f.locations.some((l) => l.file.endsWith(file)),
      );
    expect(at('auth.go').filter((f) => ['SEC-001', 'GO-004'].includes(f.ruleId))).toHaveLength(0);
  });
});
