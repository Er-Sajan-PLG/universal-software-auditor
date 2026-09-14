import fs from 'node:fs';
import path from 'node:path';

/**
 * Write text, creating parent directories. Throws a clean Error naming the
 * path and reason — callers turn it into `exit 2` instead of a stack trace.
 *
 * CLI-004: report/learn/diff outputs used to crash with raw ENOENT when the
 * --out directory did not exist, while the transcript/foundation/bootstrap
 * writers already created parents. One helper, one behavior everywhere.
 */
export function writeTextFile(file: string, content: string): void {
  try {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  } catch (err) {
    throw new Error(`cannot write ${file}: ${(err as Error).message}`, { cause: err });
  }
}
