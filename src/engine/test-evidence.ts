/**
 * Deterministic test-evidence analyzers (testing-assurance evidence slice).
 *
 * DOCTRINE (ADR-0032): these are pure deterministic heuristics that count
 * observable signals in file paths and file contents. Interpretation stays
 * agent-side. Nothing here asserts quality, coverage semantics, or assurance —
 * a count of patterns is presence evidence only, never a verdict.
 *
 * The module performs no I/O: callers supply paths, contents, inventories,
 * and timestamps explicitly. It changes no scores and wires into no report.
 */

/** Test level assigned by filename heuristics. `unknown` is the fallthrough. */
export type TestLevel = 'unit' | 'integration' | 'system' | 'e2e' | 'unknown';

/**
 * Per-level glob tables (`*` matches any run, matched as a substring,
 * case-insensitively). A supplied per-level array REPLACES that level's
 * defaults; levels left unspecified keep their defaults. `unknown` is never
 * matched by a pattern — it is the fallthrough when nothing matches.
 */
export type LevelPatterns = Partial<Record<Exclude<TestLevel, 'unknown'>, string[]>>;

/**
 * Default pattern table (documented contract):
 *
 * - unit:        `__tests__`, `*.unit.*`, `*.spec.*`, `test_*`
 * - integration: `*integration*`, `*contract*`, `*pact*`
 * - system:      `*system*`, `*acceptance*`
 * - e2e:         `*e2e*`, `*end-to-end*`, `*.e2e.*`
 * - else:        `unknown`
 */
export const DEFAULT_PATTERNS: Record<Exclude<TestLevel, 'unknown'>, string[]> = {
  unit: ['__tests__', '*.unit.*', '*.spec.*', 'test_*'],
  integration: ['*integration*', '*contract*', '*pact*'],
  system: ['*system*', '*acceptance*'],
  e2e: ['*e2e*', '*end-to-end*', '*.e2e.*'],
};

/**
 * Match precedence, narrowest scope first. A path matching several levels
 * (e.g. `e2e/login.spec.ts`) is classified by the earliest level here.
 * This is an arbitrary tie-break, documented so it cannot surprise.
 */
const LEVEL_PRECEDENCE: Array<Exclude<TestLevel, 'unknown'>> = [
  'e2e',
  'system',
  'integration',
  'unit',
];

/** Escape a literal so it can be embedded in a RegExp source. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** Convert a `*`-glob to an unanchored, case-insensitive RegExp (substring match). */
function globToRegExp(glob: string): RegExp {
  return new RegExp(glob.split('*').map(escapeRegExp).join('.*'), 'i');
}

/**
 * Classify a test file path into a level. Returns `unknown` when no
 * pattern matches. Counts as a naming signal only — it says nothing about
 * what the file actually exercises.
 */
export function classifyTestFile(filePath: string, patterns?: LevelPatterns): TestLevel {
  const table: Record<Exclude<TestLevel, 'unknown'>, string[]> = {
    ...DEFAULT_PATTERNS,
    ...patterns,
  };
  for (const level of LEVEL_PRECEDENCE) {
    if (table[level].some((glob) => globToRegExp(glob).test(filePath))) {
      return level;
    }
  }
  return 'unknown';
}

/** Count files per level. The result always carries all five keys. */
export function inventoryTests(
  files: string[],
  patterns?: LevelPatterns,
): Record<TestLevel, number> {
  const inventory: Record<TestLevel, number> = {
    unit: 0,
    integration: 0,
    system: 0,
    e2e: 0,
    unknown: 0,
  };
  for (const file of files) {
    inventory[classifyTestFile(file, patterns)] += 1;
  }
  return inventory;
}

/** Regex occurrence counts for one signal class. Signals, not verdicts. */
export interface AssertionSignals {
  failureAssertions: number;
  mockUsages: number;
  focusedMarkers: number;
  skippedMarkers: number;
}

/**
 * Signal patterns (documented contract — each counts literal occurrences):
 *
 * - failureAssertions: `toThrow|assert\.throws|rejects|assert\.rejects`
 * - mockUsages:        `jest\.mock|vi\.mock|sinon|mockReturnValue|mockResolvedValue|Mock`
 * - focusedMarkers:    `describe\.only|it\.only|test\.only|fit\(|fdescribe\(`
 * - skippedMarkers:    `describe\.skip|it\.skip|test\.skip|xit\(|xdescribe\(`
 *
 * A high mock count does not prove over-mocking; a focused marker is an
 * isolation signal, not a failure. Interpretation stays agent-side.
 */
const SIGNAL_PATTERNS: Record<keyof AssertionSignals, RegExp> = {
  failureAssertions: /toThrow|assert\.throws|rejects|assert\.rejects/g,
  mockUsages: /jest\.mock|vi\.mock|sinon|mockReturnValue|mockResolvedValue|Mock/g,
  focusedMarkers: /describe\.only|it\.only|test\.only|fit\(|fdescribe\(/g,
  skippedMarkers: /describe\.skip|it\.skip|test\.skip|xit\(|xdescribe\(/g,
};

/** Count global regex matches (0 when there are none). */
function countMatches(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches === null ? 0 : matches.length;
}

/** Count assertion/marker signals in file content. Pure string scan. */
export function assertionSignals(content: string): AssertionSignals {
  return {
    failureAssertions: countMatches(content, SIGNAL_PATTERNS.failureAssertions),
    mockUsages: countMatches(content, SIGNAL_PATTERNS.mockUsages),
    focusedMarkers: countMatches(content, SIGNAL_PATTERNS.focusedMarkers),
    skippedMarkers: countMatches(content, SIGNAL_PATTERNS.skippedMarkers),
  };
}

/**
 * Share of the inventory held by system+e2e above which the shape is
 * labelled `top-heavy`. Strictly greater-than: exactly 30% is not top-heavy.
 */
export const TOP_HEAVY_SHARE = 0.3;

export interface PyramidAssessment {
  shape: string;
  flag?: string;
}

/**
 * Label the shape of a level inventory. THE PYRAMID IS A HEURISTIC, NOT A
 * LAW: these labels describe count proportions only and assert nothing about
 * whether the suite is adequate, fast, or trustworthy.
 *
 * Documented rules: all counts zero → `untested`; system+e2e share strictly
 * above TOP_HEAVY_SHARE → `top-heavy`; no integration tests while unit tests
 * exist → `no-middle`; otherwise → `balanced` (no flag). `unknown` files
 * count toward the total but toward no level. Rule order is part of the
 * contract: `untested` beats `top-heavy` beats `no-middle` beats `balanced`.
 */
export function pyramidAssessment(inventory: Record<TestLevel, number>): PyramidAssessment {
  const total =
    inventory.unit + inventory.integration + inventory.system + inventory.e2e + inventory.unknown;
  if (total === 0) {
    return { shape: 'untested', flag: 'untested' };
  }
  if ((inventory.e2e + inventory.system) / total > TOP_HEAVY_SHARE) {
    return { shape: 'top-heavy', flag: 'top-heavy' };
  }
  if (inventory.integration === 0 && inventory.unit > 0) {
    return { shape: 'no-middle', flag: 'no-middle' };
  }
  return { shape: 'balanced' };
}

/** Milliseconds in a day; the unit of `ageDays`. */
export const MS_PER_DAY = 86_400_000;

export interface FreshnessResult {
  stale: boolean;
  ageDays: number;
}

/**
 * Compare an evidence-artifact timestamp against HEAD time, purely on the
 * explicit arguments (no clock reads). `ageDays` is fractional and may be
 * negative. `stale` is true when the artifact predates HEAD. Non-finite
 * inputs are a time paradox and fail closed: `stale` true, `ageDays` NaN.
 * Staleness is a timestamp ordering only — it says nothing about whether
 * the artifact's claims still hold.
 */
export function freshnessCheck(artifactMtimeMs: number, headTimeMs: number): FreshnessResult {
  if (!Number.isFinite(artifactMtimeMs) || !Number.isFinite(headTimeMs)) {
    return { stale: true, ageDays: NaN };
  }
  const ageDays = (artifactMtimeMs - headTimeMs) / MS_PER_DAY;
  return { stale: ageDays < 0, ageDays };
}
