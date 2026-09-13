import type { Location } from '../types.js';
import { globToRegExp } from './glob.js';

/**
 * Site scoping shared by suppressions (ADR-0022) and reviews (ADR-0023).
 *
 * A bare filename is anchored with a leading star-star-slash so it matches at
 * any depth; a glob containing a slash is matched as written. A `line` only
 * narrows when the location actually carries that line — a scope naming a line
 * must not silently match a whole file.
 */
export function siteMatcher(file: string | undefined): RegExp | null {
  if (!file) return null;
  const pattern = file.includes('/') ? file : '**/' + file;
  return globToRegExp(pattern);
}

/** True when a location falls inside the site a file/line scope names. */
export function matchesSite(
  matcher: RegExp | null,
  line: number | undefined,
  loc: Location,
): boolean {
  if (matcher && loc.file && !matcher.test(loc.file)) return false;
  if (line !== undefined && loc.line !== line) return false;
  return true;
}
