import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const cache = new Map<string, string>();

/**
 * Content fingerprint of the rule tree (review 1, §35): sorted relative
 * paths plus file bytes, sha256. Answers "same rules?" mechanically, so
 * longitudinal diffs can distinguish a changed project from changed
 * rules, detectors, or packs. Memoized per directory — the tree does not
 * change mid-process, and audits run back-to-back in tests.
 */
export function fingerprintRulesDir(dir: string): string {
  const hit = cache.get(dir);
  if (hit) return hit;
  const files: string[] = [];
  const walk = (d: string): void => {
    const entries = fs
      .readdirSync(d, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.yaml')) files.push(p);
    }
  };
  walk(dir);
  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(path.relative(dir, f));
    hash.update(fs.readFileSync(f));
  }
  const digest = hash.digest('hex');
  cache.set(dir, digest);
  return digest;
}
