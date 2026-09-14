import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal `.env` loader (no dependency on purpose — one file format, ~25
 * lines, and zero new supply chain for a secrets-adjacent feature).
 *
 * Reads `KEY=VALUE` lines from `<dir>/.env` (default: the caller's working
 * directory) and sets each key into `process.env` ONLY when it is not already
 * set — the real environment always wins over the file. Returns the names of
 * the keys it set (names, never values) so callers can log what was loaded
 * without ever printing secret material.
 *
 * Format: blank lines and `#` comments skipped; surrounding single or double
 * quotes stripped from values; keys must look like `ENV_VAR` names or the
 * line is ignored. A missing file is not an error (returns `[]`).
 */
export function loadEnvFile(dir: string = process.cwd()): string[] {
  const loaded: string[] = [];
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  } catch {
    return loaded;
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquote(line.slice(eq + 1).trim());
    loaded.push(key);
  }
  return loaded;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}
