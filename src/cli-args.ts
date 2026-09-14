import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Depth, Maturity, Severity } from './types.js';

/** Shared CLI plumbing: install paths, version, and argument accessors. */
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RULES_DIR = path.resolve(HERE, '..', 'rules');
export const VERSION = readVersion();

export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'FUTURE'];
export const DEPTHS: Depth[] = ['quick', 'standard', 'deep'];
export const MATURITIES: Maturity[] = ['prototype', 'mvp', 'beta', 'production', 'legacy'];

/* ------------------------------------------------------------------- args -- */

export interface Args {
  _: string[];
  [k: string]: string | boolean | string[] | undefined;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (!tok.startsWith('--')) {
      args._.push(tok);
      continue;
    }
    const body = tok.slice(2);
    if (body.includes('=')) {
      const [k, ...rest] = body.split('=');
      args[k!] = rest.join('=');
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[body] = true;
    } else {
      args[body] = next;
      i++;
    }
  }
  return args;
}

export function str(args: Args, key: string, fallback?: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : fallback;
}
export function bool(args: Args, key: string): boolean {
  return args[key] === true || args[key] === 'true';
}

/**
 * CLI-003: every command that writes files honors --dry-run. Call after pure
 * argument validation with the resolved paths that WOULD be written: it
 * prints one line per path and returns false, and the caller exits 0 before
 * doing any work — no audit run, no model calls, no disk writes. With an
 * empty list it says so explicitly rather than silently succeeding.
 */
export function dryRunWrites(args: Args, files: string[]): boolean {
  if (!bool(args, 'dry-run')) return true;
  if (files.length === 0) {
    console.log('dry-run: nothing would be written');
    return false;
  }
  for (const f of files) console.log(`dry-run: would write ${path.resolve(f)}`);
  return false;
}
export function list(args: Args, key: string): string[] {
  const v = args[key];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string')
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

/* ------------------------------------------------------------------ utils -- */

function readVersion(): string {
  const candidates = [
    path.resolve(HERE, '..', 'package.json'),
    path.resolve(HERE, '..', '..', 'package.json'),
  ];
  for (const c of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(c, 'utf8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      /* fall through */
    }
  }
  return '0.0.0';
}
