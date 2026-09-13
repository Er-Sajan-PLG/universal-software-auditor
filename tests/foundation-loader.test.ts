import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadFoundationFacts,
  parseFoundationYamlText,
  sanitizeIntent,
} from '../src/foundation/loader.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-foundation-'));
  dirs.push(dir);
  return dir;
}

function writeFoundation(root: string, text: string): string {
  const file = path.join(root, '.usa', 'foundation.yaml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

const HAPPY = `version: 1
project:
  name: demo
  vision: Demo everything.
  intents:
    - api
    - cli
stage: mvp
pillars:
  docs:
    required: [README.md]
  governance:
    codeOfConduct: true
    contributing: true
    securityPolicy: true
    license: true
  ai:
    readable: true
    writable: false
  testing:
    dirs: [tests]
    minCoverage: 80
  environment:
    files: [.env.example]
  pipelines:
    local: [test, build]
    ci: [.github/workflows/ci.yml]
  standards: []
  specs: []
`;

describe('loadFoundationFacts', () => {
  it('returns one intent:<value> flag per intents[] entry', () => {
    const root = scratch();
    writeFoundation(root, HAPPY);
    expect(loadFoundationFacts(root)).toEqual(['intent:api', 'intent:cli']);
  });

  it('returns [] when the file is missing', () => {
    expect(loadFoundationFacts(scratch())).toEqual([]);
  });

  it('throws a loud error naming the file on malformed YAML', () => {
    const root = scratch();
    const file = writeFoundation(root, 'version: [unclosed\n  nope: : :\n');
    expect(() => loadFoundationFacts(root)).toThrow(file);
  });

  it('throws on unknown shapes (non-map, bad version, bad project, bad intents)', () => {
    const root = scratch();
    const file = writeFoundation(root, HAPPY);
    for (const text of [
      '- just\n- a\n- list\n',
      'version: 2\nproject:\n  name: x\n',
      'project: nope\n',
      'version: 1\n',
      'version: 1\nproject:\n  name: x\n  intents: api\n',
      'version: 1\nproject:\n  name: x\n  intents: []\npillars: nope\n',
      'version: 1\nproject:\n  name: x\n  intents: []\nstage: moon\n',
    ]) {
      fs.writeFileSync(file, text, 'utf8');
      expect(() => loadFoundationFacts(root), JSON.stringify(text)).toThrow(file);
    }
  });

  it('throws on date values instead of auditing against them', () => {
    const root = scratch();
    // An explicit !!timestamp decodes to a Date — no date belongs in an
    // intent file, so this is fail-closed, never silent.
    const file = writeFoundation(
      root,
      'version: 1\nproject:\n  name: x\n  intents: [api]\n  until: !!timestamp 2026-12-31\n',
    );
    expect(() => loadFoundationFacts(root)).toThrow(file);
  });

  it('ignores unknown extra keys (plain date-like strings stay strings)', () => {
    const root = scratch();
    writeFoundation(
      root,
      'version: 1\nproject:\n  name: x\n  intents: [api]\n  until: 2026-12-31\n',
    );
    expect(loadFoundationFacts(root)).toEqual(['intent:api']);
  });

  it('parses a minimal file, backfilling pillars from defaults', () => {
    const root = scratch();
    writeFoundation(root, 'version: 1\nproject:\n  name: tiny\n  intents: []\n');
    expect(loadFoundationFacts(root)).toEqual([]);
    const config = parseFoundationYamlText(
      'version: 1\nproject:\n  name: tiny\n  intents: []\n',
      'foundation.yaml',
    );
    expect(config.version).toBe(1);
    expect(config.pillars.docs.required).toEqual(['README.md']);
    expect(config.pillars.testing.minCoverage).toBe(80);
  });
});

describe('sanitizeIntent', () => {
  it('lowercases and accepts slugs', () => {
    expect(sanitizeIntent('API')).toBe('intent:api');
    expect(sanitizeIntent('  docs-site ')).toBe('intent:docs-site');
    expect(sanitizeIntent('data-pipeline2')).toBe('intent:data-pipeline2');
  });

  it('skips invalid entries without throwing', () => {
    for (const bad of [
      '',
      '  ',
      'has space',
      'under_score',
      'semi;colon',
      'dot.name',
      42,
      null,
      undefined,
      {},
      ['api'],
    ]) {
      expect(sanitizeIntent(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('loader skips invalid intents but keeps the valid ones', () => {
    const root = scratch();
    writeFoundation(
      root,
      'version: 1\nproject:\n  name: x\n  intents:\n    - API\n    - "has space"\n    - 42\n    - cli\n',
    );
    expect(loadFoundationFacts(root)).toEqual(['intent:api', 'intent:cli']);
  });
});
