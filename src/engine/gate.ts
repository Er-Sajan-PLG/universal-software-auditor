import { parse as parseYaml } from 'yaml';
import type { AuditReport, Finding, Severity } from '../types.js';
import { isOpenStatus, ruleMovement, type TrailerData } from './diff.js';
import { SEVERITY_LADDER } from './loader.js';

/**
 * Findings that should block a build: anything at or above `threshold` that is
 * neither passing, unverified, nor explicitly accepted by project policy.
 *
 * Suppressed findings never block — that is the entire point of recording an
 * accepted risk in `.usa.yaml`. UNKNOWN never blocks either: "needs a human"
 * is not "failed", and gating on it would make every manual rule a CI failure.
 */
export function blockingFindings(report: AuditReport, threshold: Severity): Finding[] {
  const open = report.findings.filter(
    (f) =>
      f.status !== 'PASS' &&
      f.status !== 'NOT_APPLICABLE' &&
      f.status !== 'UNKNOWN' &&
      !f.suppressedReason,
  );
  const min = SEVERITY_LADDER.indexOf(threshold);
  return open.filter((f) => SEVERITY_LADDER.indexOf(f.severity) >= min);
}

/**
 * `--fail-on` gate. Returns a process exit code.
 *
 * The ladder is ascending (`FUTURE` … `CRITICAL`), so "at or above" means
 * *higher* index. Getting this backwards makes `--fail-on critical` fail on
 * every finding in the report, which is a memorable way to lose a CI pipeline.
 */
export function evaluateGate(report: AuditReport, failOn: string, quiet: boolean): number {
  if (failOn === 'none') return 0;

  const threshold = failOn.toUpperCase() as Severity;
  if (!SEVERITY_LADDER.includes(threshold)) {
    console.error(
      `--fail-on must be none or one of ${[...SEVERITY_LADDER].reverse().join('|').toLowerCase()}`,
    );
    return 2;
  }

  const blocking = blockingFindings(report, threshold);
  if (blocking.length === 0) return 0;

  if (!quiet) {
    console.error(`\nGate failed: ${blocking.length} finding(s) at or above ${threshold}.`);
    for (const f of blocking.slice(0, 10)) {
      const where = f.locations[0] ? `  (${f.locations[0].file}:${f.locations[0].line})` : '';
      console.error(`  ${f.severity.padEnd(8)} ${f.ruleId}  ${f.title}${where}`);
    }
    if (blocking.length > 10) console.error(`  … and ${blocking.length - 10} more`);
  }
  return 1;
}

/* ------------------------------------------ new-code gate (--baseline) -- */

/**
 * Fail-closed parse of a baseline report trailer.
 *
 * The baseline is the judge's memory of what was already known: an empty
 * file, a report without a trailer, non-YAML, or a YAML document without a
 * well-formed `rules:` mapping all throw. A malformed baseline must error
 * loudly (CLI exit 2) — never silently pass a gate that compared against
 * nothing. Pure: takes the trailer YAML string, returns structured data.
 */
export function parseBaselineTrailer(trailerYaml: string): TrailerData {
  let parsed: unknown;
  try {
    parsed = parseYaml(trailerYaml);
  } catch (err) {
    throw new Error(`--baseline trailer is not valid YAML: ${(err as Error).message}`, {
      cause: err,
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--baseline trailer is malformed: expected a YAML mapping.');
  }
  const rules = (parsed as TrailerData).rules;
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    throw new Error('--baseline trailer is malformed: missing or invalid `rules:` section.');
  }
  for (const [id, r] of Object.entries(rules)) assertTrailerRule(id, r);
  return parsed as TrailerData;
}

/** One baseline rule entry is a mapping with string status and severity. */
function assertTrailerRule(id: string, r: unknown): void {
  const entry = r as { status?: unknown; severity?: unknown };
  if (!entry || typeof entry !== 'object') {
    throw new Error(`--baseline trailer is malformed: rule ${id} is not a mapping.`);
  }
  if (typeof entry.status !== 'string' || typeof entry.severity !== 'string') {
    throw new Error(
      `--baseline trailer is malformed: rule ${id} needs string status and severity.`,
    );
  }
}

/**
 * Findings that should block a new-code gate: only what this change
 * introduced or made worse, so adopting USA on a legacy codebase does not
 * fail CI on pre-existing debt.
 *
 * A rule blocks when its diff movement (shared with `usa diff`, so text and
 * verdict agree) is:
 * - newly-applicable AND currently open at or above `threshold`
 *   (pre-existing open findings of any severity pass through), or
 * - regressed — decided before, open or back in the judgement queue now.
 *   Regressions block at any severity: breaking what passed is new debt no
 *   matter the rung. Suppressed findings never block, same as `--fail-on`.
 */
export function newCodeBlocking(
  report: AuditReport,
  baseline: TrailerData,
  threshold: Severity,
): Finding[] {
  // One finding per rule: first occurrence wins, so duplicate rule ids in a
  // hand-built report cannot smuggle extra blockers past the gate.
  const current = new Map<string, Finding>();
  for (const f of report.findings) {
    if (f.suppressedReason) continue;
    if (!current.has(f.ruleId)) current.set(f.ruleId, f);
  }
  const min = SEVERITY_LADDER.indexOf(threshold);
  const atOrAbove = (severity: string): boolean =>
    SEVERITY_LADDER.indexOf(severity as Severity) >= min;
  const baselineRules = baseline.rules ?? {};
  const blocking: Finding[] = [];
  for (const [id, f] of [...current.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (isNewCodeBlocker(f, baselineRules[id]?.status, atOrAbove)) blocking.push(f);
  }
  return blocking;
}

/**
 * Whether one current finding blocks the new-code gate: newly-applicable and
 * open at/above threshold, or regressed at any severity. Pure predicate so
 * the per-rule decision stays testable without building a whole report.
 */
function isNewCodeBlocker(
  f: Finding,
  beforeStatus: string | undefined,
  atOrAbove: (severity: string) => boolean,
): boolean {
  const movement = ruleMovement(beforeStatus, f.status);
  if (movement === 'regressed') return true;
  return movement === 'newly-applicable' && isOpenStatus(f.status) && atOrAbove(f.severity);
}

/**
 * `--baseline` gate. Returns a process exit code.
 *
 * Threshold handling mirrors `evaluateGate` (including `none` disables and
 * exit 2 on an unrecognised threshold) so the two gates compose: the CLI
 * passes `--fail-on` through when set, defaulting to HIGH under `--baseline`.
 */
export function evaluateNewCodeGate(
  report: AuditReport,
  baseline: TrailerData,
  failOn: string,
  quiet: boolean,
): number {
  if (failOn === 'none') return 0;

  const threshold = failOn.toUpperCase() as Severity;
  if (!SEVERITY_LADDER.includes(threshold)) {
    console.error(
      `--fail-on must be none or one of ${[...SEVERITY_LADDER].reverse().join('|').toLowerCase()}`,
    );
    return 2;
  }

  const blocking = newCodeBlocking(report, baseline, threshold);
  if (blocking.length === 0) return 0;

  if (!quiet) {
    console.error(
      `\nNew-code gate failed: ${blocking.length} newly-introduced or regressed finding(s) at or above ${threshold}.`,
    );
    for (const f of blocking.slice(0, 10)) {
      const where = f.locations[0] ? `  (${f.locations[0].file}:${f.locations[0].line})` : '';
      console.error(`  ${f.severity.padEnd(8)} ${f.ruleId}  ${f.title}${where}`);
    }
    if (blocking.length > 10) console.error(`  … and ${blocking.length - 10} more`);
  }
  return 1;
}
