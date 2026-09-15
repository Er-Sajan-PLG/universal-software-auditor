import { describe, it, expect } from 'vitest';
import {
  allRules,
  loadFixtures,
  evaluateFixture,
  type RuleFixture,
} from '../rule-fixture-helpers.js';
import type { Check } from '../../src/types.js';

/**
 * Auditor mutation probes (review 1, §47): break each rule's check on
 * purpose and assert the rule's own fixtures go red. A fixture suite that
 * stays green under mutation is decoration — it exercises the auditor
 * without guarding it.
 *
 * Two mutations per kind where meaningful: blind (match nothing) and
 * saturate (match everything). At least one fixture case must flip under
 * at least one mutation. `command`/`oracle` are skipped: the offline
 * harness forces them UNKNOWN regardless of content, so no content
 * mutation can flip them here — their honesty is covered by construction
 * (opt-in / artifact-absent), not by fixtures. `manual`/`invariant` have
 * no file fixtures by design (own harnesses).
 */

const NEVER = 'zzz-never-matches-auditor-mutation-probe-zzz';
const EVERYTHING_GLOB = '**/*';

type Mode = 'blind' | 'saturate';

function mutateGrep(
  check: Extract<
    Check,
    { kind: 'grep_present' | 'grep_absent' | 'grep_wrong' | 'grep_deprecated' }
  >,
  mode: Mode,
): Check {
  return { ...check, pattern: mode === 'blind' ? NEVER : '(?:)' };
}

function mutateFileList(
  check:
    | Extract<Check, { kind: 'file_exists' | 'file_absent' }>
    | Extract<Check, { kind: 'any_file' | 'tracked_present' | 'tracked_absent' }>,
  mode: Mode,
): Check {
  const value = mode === 'blind' ? [NEVER] : [EVERYTHING_GLOB];
  return 'files' in check ? { ...check, files: value } : { ...check, patterns: value };
}

function mutateCheck(check: Check, mode: Mode): Check | null {
  switch (check.kind) {
    case 'grep_present':
    case 'grep_absent':
    case 'grep_wrong':
    case 'grep_deprecated':
      return mutateGrep(check, mode);
    case 'file_exists':
    case 'file_absent':
    case 'any_file':
    case 'tracked_present':
    case 'tracked_absent':
      return mutateFileList(check, mode);
    case 'count_min':
      return { ...check, min: mode === 'blind' ? 999999 : 0 };
    case 'file_lines_max':
      return { ...check, max_lines: mode === 'blind' ? 0 : 999999999 };
    case 'json_path':
      // Saturate has no generic form (it needs a path that resolves in the
      // fixture's files); blind alone must flip the negative case.
      return mode === 'blind' ? { ...check, path: 'zzz.nonexistent.path' } : null;
    case 'any_of':
      // Blind every branch (no rescuer left); saturate every branch
      // (first PASS wins immediately). A branch that cannot be mutated
      // in this mode poisons the whole mutation — skip honestly.
      if (mode === 'blind') {
        const subs: Check[] = [];
        for (const sub of check.checks) {
          const mutated = mutateCheck(sub, mode);
          if (!mutated) return null;
          subs.push(mutated);
        }
        return { ...check, checks: subs };
      }
      return null;
    case 'command':
    case 'oracle':
    case 'manual':
    case 'invariant':
    case 'info':
      return null;
  }
}

function runCase(check: Check, files: Record<string, string>): string {
  const { status, cleanup } = evaluateFixture(check, { files });
  try {
    return status;
  } finally {
    cleanup();
  }
}

/** Statuses under both mutations; null entries are skipped modes. */
function mutatedOutcomes(
  check: Check,
  files: Record<string, string>,
): Array<{ mode: Mode; status: string }> {
  const out: Array<{ mode: Mode; status: string }> = [];
  for (const mode of ['blind', 'saturate'] as const) {
    const mutated = mutateCheck(check, mode);
    if (mutated) out.push({ mode, status: runCase(mutated, files) });
  }
  return out;
}

describe('auditor mutation probes', () => {
  const rules = allRules();
  for (const { fixture } of loadFixtures()) {
    const rule = rules.get(fixture.rule);
    if (!rule) continue;
    if (
      rule.check.kind === 'command' ||
      rule.check.kind === 'oracle' ||
      rule.check.kind === 'manual' ||
      rule.check.kind === 'invariant' ||
      rule.check.kind === 'info'
    ) {
      continue;
    }
    it(`${fixture.rule}: gutting the check flips a fixture outcome`, () => {
      assertSensitive(rule.check, fixture);
    });
  }
});

function assertSensitive(check: Check, fixture: RuleFixture): void {
  const cases: Array<{ name: string; files: Record<string, string>; baseline: string }> = [];
  if (fixture.negative) {
    cases.push({
      name: 'negative',
      files: fixture.negative.files,
      baseline: runCase(check, fixture.negative.files),
    });
  }
  if (fixture.positive) {
    cases.push({
      name: 'positive',
      files: fixture.positive.files,
      baseline: runCase(check, fixture.positive.files),
    });
  }
  expect(cases.length).toBeGreaterThan(0);
  const flips: string[] = [];
  for (const c of cases) {
    for (const m of mutatedOutcomes(check, c.files)) {
      if (m.status !== c.baseline) flips.push(`${c.name}/${m.mode}: ${c.baseline}→${m.status}`);
    }
  }
  expect(
    flips,
    `no mutation flipped any fixture outcome — fixtures insensitive to check content`,
  ).not.toHaveLength(0);
}
