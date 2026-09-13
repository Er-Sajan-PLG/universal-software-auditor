import type { Finding, Location, Suppression } from '../types.js';
import { matchesSite, siteMatcher } from '../util/site.js';

/**
 * Site-level suppressions (ADR-0022).
 *
 * A rule-wide waiver (`suppressions: [{rule}]`) hides every finding for that
 * rule. A site-level waiver adds a `file` glob (and optional `line`) and hides
 * only the matching locations. This is the ESLint model: an exception is fine,
 * but it must point at the place it excuses — and an exception that no longer
 * matches anything is reported, so waivers decay instead of accumulating.
 *
 * An entry is "used" when it actually suppressed at least one location. The
 * index records that, and the audit reports unused entries as warnings.
 */
export interface SuppressionEntry {
  readonly suppression: Suppression;
  readonly matcher: RegExp | null;
  used: boolean;
}

/** Active (non-expired) suppressions, grouped by rule id. */
export type SuppressionIndex = Map<string, SuppressionEntry[]>;

/** Build the index from validated, non-expired suppressions. */
export function buildSuppressionIndex(suppressions: Suppression[] | undefined): SuppressionIndex {
  const index: SuppressionIndex = new Map();
  for (const s of suppressions ?? []) {
    if (!s.rule) continue;
    const entry: SuppressionEntry = {
      suppression: s,
      matcher: siteMatcher(s.file),
      used: false,
    };
    const list = index.get(s.rule);
    if (list) list.push(entry);
    else index.set(s.rule, [entry]);
  }
  return index;
}

function matchesLocation(entry: SuppressionEntry, loc: Location): boolean {
  return matchesSite(entry.matcher, entry.suppression.line, loc);
}

export interface SuppressionOutcome {
  /** Locations that survive (are not excused). */
  kept: Location[];
  /** Reasons of the entries that suppressed at least one location, in order. */
  reasons: string[];
  /** True when at least one location was excused. */
  suppressedAny: boolean;
}

/**
 * Split a finding's locations into those a waiver excuses and those it does
 * not. Entries are matched in order; a location is removed by the first entry
 * that matches it, and every entry that fires is marked used.
 *
 * A rule-wide entry (no `file`) excuses the finding as a whole, including a
 * finding that carries no locations at all (a repo-level MISSING). A
 * site-level entry can only excuse locations, so a location-less finding is
 * left untouched by it — a waiver naming one file must not hide a repo-wide
 * failure.
 */
export function applySuppressions(
  index: SuppressionIndex,
  ruleId: string,
  locations: Location[],
): SuppressionOutcome {
  const entries = index.get(ruleId);
  if (!entries || entries.length === 0) {
    return { kept: locations, reasons: [], suppressedAny: false };
  }
  const reasons: string[] = [];
  let suppressedAny = false;

  // Rule-wide waivers apply to the finding itself, not to individual locations.
  for (const e of entries) {
    if (e.suppression.file) continue;
    e.used = true;
    suppressedAny = true;
    if (!reasons.includes(e.suppression.reason)) reasons.push(e.suppression.reason);
  }
  if (suppressedAny) return { kept: [], reasons, suppressedAny };

  const kept: Location[] = [];
  for (const loc of locations) {
    const hit = entries.find((e) => matchesLocation(e, loc));
    if (!hit) {
      kept.push(loc);
      continue;
    }
    hit.used = true;
    suppressedAny = true;
    if (!reasons.includes(hit.suppression.reason)) reasons.push(hit.suppression.reason);
  }
  return { kept, reasons, suppressedAny };
}

/** Every entry across the index that suppressed nothing this run. */
export function unusedSuppressions(index: SuppressionIndex): Suppression[] {
  const out: Suppression[] = [];
  for (const entries of index.values()) {
    for (const e of entries) {
      if (!e.used) out.push(e.suppression);
    }
  }
  return out;
}

/**
 * A stable, human-readable label for a suppression: `RULE` for a rule-wide
 * waiver, `RULE (file[:line])` for a site-level one. Used in warnings.
 */
export function describeSuppression(s: Suppression): string {
  if (!s.file) return s.rule;
  return s.line === undefined ? `${s.rule} (${s.file})` : `${s.rule} (${s.file}:${s.line})`;
}

/** Findings that carry a suppression reason (for report rendering/tests). */
export function isSuppressed(finding: Finding): boolean {
  return finding.suppressedReason !== undefined;
}
