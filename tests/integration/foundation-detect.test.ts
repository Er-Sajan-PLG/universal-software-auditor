import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectFoundationDefaults } from '../../src/foundation/detect.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A scratch tree with exactly the given relative files (content irrelevant). */
function tree(files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-detect-'));
  dirs.push(root);
  for (const rel of files) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'x\n', 'utf8');
  }
  return root;
}

describe('detectFoundationDefaults', () => {
  it('reflects what exists: docs, governance, agent files, env, CI', () => {
    const root = tree([
      'README.md',
      'LICENSE',
      'AGENTS.md',
      '.env.example',
      'package.json',
      '.github/workflows/ci.yml',
      'openapi.yaml',
    ]);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'demo', scripts: { test: 'vitest', build: 'tsc' } }),
      'utf8',
    );
    const config = detectFoundationDefaults(root, 'demo');
    expect(config.project.name).toBe('demo');
    expect(config.pillars.docs.required).toEqual(['README.md', 'LICENSE']);
    expect(config.pillars.governance.license).toBe(true);
    expect(config.pillars.governance.codeOfConduct).toBe(false);
    expect(config.pillars.ai.readable).toBe(true);
    expect(config.pillars.ai.writable).toBe(false);
    expect(config.pillars.environment.files).toEqual(['.env.example']);
    expect(config.pillars.pipelines.local).toEqual(['test', 'build']);
    expect(config.pillars.pipelines.ci).toEqual(['.github/workflows/ci.yml']);
    expect(config.pillars.specs).toEqual(['openapi.yaml']);
  });

  it('detects test directories that exist', () => {
    const root = tree(['tests/a.test.ts', 'src/a.ts']);
    const config = detectFoundationDefaults(root, 'demo');
    expect(config.pillars.testing.dirs).toEqual(['tests']);
  });

  it('leaves promises at defaults on an empty tree', () => {
    const config = detectFoundationDefaults(tree([]), 'demo');
    expect(config.project.intents).toEqual(['library']);
    expect(config.stage).toBe('prototype');
    expect(config.pillars.docs.required).toEqual([]);
    expect(config.pillars.testing.dirs).toEqual([]);
    expect(config.pillars.testing.minCoverage).toBe(80);
    expect(config.pillars.pipelines.local).toEqual(['test', 'build']);
    expect(config.pillars.pipelines.ci).toEqual(['.github/workflows/ci.yml']);
    expect(config.pillars.standards).toEqual([]);
    expect(config.pillars.specs).toEqual([]);
  });

  it('ignores malformed package.json scripts without throwing', () => {
    const root = tree(['package.json']);
    fs.writeFileSync(path.join(root, 'package.json'), '{not json', 'utf8');
    const config = detectFoundationDefaults(root, 'demo');
    expect(config.pillars.pipelines.local).toEqual(['test', 'build']);
  });
});
