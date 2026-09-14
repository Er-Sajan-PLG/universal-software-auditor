import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeTextFile } from '../src/util/files.js';

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) fs.rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-files-'));
  cleanups.push(dir);
  return dir;
}

describe('writeTextFile (CLI-004)', () => {
  it('creates missing parent directories instead of crashing with ENOENT', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'a', 'b', 'out.md');
    writeTextFile(file, '# hi\n');
    expect(fs.readFileSync(file, 'utf8')).toBe('# hi\n');
  });

  it('overwrites an existing file like before', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'out.md');
    fs.writeFileSync(file, 'old', 'utf8');
    writeTextFile(file, 'new');
    expect(fs.readFileSync(file, 'utf8')).toBe('new');
  });

  it('throws a clean usage error (no stack needed) on an impossible path', () => {
    // NUL bytes are rejected by the OS on every platform — deterministic
    // without playing permission games.
    expect(() => writeTextFile('bad\0path/out.md', 'x')).toThrow(/^cannot write /);
  });
});
