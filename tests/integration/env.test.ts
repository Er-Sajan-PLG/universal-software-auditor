import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnvFile } from '../../src/util/env.js';

const DIRTY_KEYS = ['USA_ENV_TEST_ALPHA', 'USA_ENV_TEST_BETA', 'USA_ENV_TEST_GAMMA'];
const saved = new Map<string, string | undefined>();

function stashEnv(): void {
  saved.clear();
  for (const k of DIRTY_KEYS) saved.set(k, process.env[k]);
  for (const k of DIRTY_KEYS) delete process.env[k];
}

function restoreEnv(): void {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function tmpDir(files: Record<string, string>): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-env-test-'));
  for (const [rel, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, rel), content, 'utf8');
  }
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

afterEach(restoreEnv);

describe('loadEnvFile', () => {
  it('loads KEY=VALUE pairs and returns only the names', () => {
    stashEnv();
    const { root, cleanup } = tmpDir({
      '.env': 'USA_ENV_TEST_ALPHA=alpha-value\nUSA_ENV_TEST_BETA=beta\n',
    });
    try {
      const loaded = loadEnvFile(root);
      expect(loaded.sort()).toEqual(['USA_ENV_TEST_ALPHA', 'USA_ENV_TEST_BETA']);
      expect(process.env['USA_ENV_TEST_ALPHA']).toBe('alpha-value');
      // Names returned, values never echoed back in the listing.
      expect(loaded.join(',')).not.toContain('alpha-value');
    } finally {
      cleanup();
    }
  });

  it('skips comments, blanks, malformed lines, and bad key names', () => {
    stashEnv();
    const { root, cleanup } = tmpDir({
      '.env': '# comment\n\nNOEQUALS\n9BAD=x\nUSA_ENV_TEST_GAMMA=ok\n',
    });
    try {
      expect(loadEnvFile(root)).toEqual(['USA_ENV_TEST_GAMMA']);
      expect(process.env['9BAD']).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('strips matching quotes and handles CRLF', () => {
    stashEnv();
    const { root, cleanup } = tmpDir({
      '.env': 'USA_ENV_TEST_ALPHA="quoted value"\r\nUSA_ENV_TEST_BETA=\x27single\x27\n',
    });
    try {
      loadEnvFile(root);
      expect(process.env['USA_ENV_TEST_ALPHA']).toBe('quoted value');
      expect(process.env['USA_ENV_TEST_BETA']).toBe('single');
    } finally {
      cleanup();
    }
  });

  it('never overrides the real environment', () => {
    stashEnv();
    process.env['USA_ENV_TEST_ALPHA'] = 'from-shell';
    const { root, cleanup } = tmpDir({ '.env': 'USA_ENV_TEST_ALPHA=from-file\n' });
    try {
      expect(loadEnvFile(root)).toEqual([]);
      expect(process.env['USA_ENV_TEST_ALPHA']).toBe('from-shell');
    } finally {
      cleanup();
    }
  });

  it('missing file is a quiet no-op', () => {
    stashEnv();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-env-empty-'));
    try {
      expect(loadEnvFile(root)).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
