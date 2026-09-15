import path from 'node:path';
import type {
  AuditReport,
  Depth,
  Facts,
  Finding,
  Maturity,
  RulePack,
  Suppression,
  UsaConfig,
} from '../types.js';
import type { SectionDef } from './sections.js';
import { SEVERITY_LADDER } from './loader.js';
import { MAX_FILE_BYTES, MAX_FILES, Project } from '../util/project.js';
import { detect, loadDetectorFile } from '../detect/index.js';
import { loadRulePacks, applyRuleOverrides } from './loader.js';
import {
  applySuppressionToFinding,
  evaluateRule,
  packApplies,
  ruleApplies,
  type EvalContext,
} from './evaluate.js';
import { evaluateInvariant, invariantLocations } from './invariants.js';
import { ruleAutomatability } from './automatability.js';
import { buildSuppressionIndex, describeSuppression, unusedSuppressions } from './suppression.js';
import {
  attachReviews,
  buildReviewIndex,
  describeReview,
  resolveActiveReviews,
  reviewOverdueDays,
  type ReviewIndex,
} from './review.js';
import { loadFoundationFacts, loadFoundationStage } from '../foundation/loader.js';
import { fingerprintRulesDir } from './ruleset.js';
import { loadSections } from './sections.js';
import { loadProfiles, dampen, type MaturityProfile } from './maturity.js';
import { loadConfig } from '../config.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** `rules/`, resolved relative to the installed package (works from src and dist). */
const DEFAULT_RULES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'rules',
);

/** Version of this build, read from package.json so it never drifts. */
const DEFAULT_VERSION = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'),
        'utf8',
      ),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
import { score, type ScoredRule } from './score.js';

export interface AuditOptions {
  target: string;
  rulesDir?: string;
  depth?: Depth;
  profile?: Maturity | 'auto';
  config?: UsaConfig;
  allowCommands?: boolean;
  usaVersion?: string;
  /** Force these pack ids on/off regardless of detection. */
  includePacks?: string[];
  excludePacks?: string[];
  /** Indexing caps for bigger-than-comfortable trees (CLI wins over config). */
  maxFiles?: number;
  maxBytes?: number;
  /**
   * Extra rule packs merged into the loaded set for this run only. This is how
   * the evolution layer injects a *released* capability into a re-audit without
   * mutating the on-disk `rules/` registry — the resolved capability set lives
   * in `capabilitySetId`, not in the filesystem. The CLI never passes this, so
   * `usa audit` behaviour is unchanged.
   */
  extraPacks?: RulePack[];
}

export interface AuditOutcome {
  report: AuditReport;
  warnings: string[];
  profile: MaturityProfile;
}

export function runAudit(options: AuditOptions): AuditOutcome {
  // The programmatic entry point must be usable with nothing but a target, so
  // every knob the CLI exposes gets a sane default here rather than a crash.
  const config = options.config ?? loadConfig(options.target);
  const opts = normalizeAuditOptions(options, config);
  const warnings: string[] = [];
  const project = new Project(
    opts.target,
    config.ignore ?? [],
    resolveLimits(options, config, warnings),
  );
  const git = project.gitInfo();
  appendHistoryWarnings(git, warnings);
  const detectors = loadDetectorFile(opts.rulesDir);
  const detection = detect(project, detectors, git, config.facts ?? []);

  const { packs, warnings: packWarnings } = loadRulePacks(opts.rulesDir);
  warnings.push(...packWarnings);

  mergeExtraPacks(packs, options.extraPacks);

  const { disabled, overrides } = collectRuleSettings(config, warnings);
  applyRuleOverrides(packs, overrides);

  const suppressions = buildSuppressionIndex(resolveSuppressions(config.suppressions, warnings));
  const reviews = buildReviewIndex(resolveActiveReviews(config.reviews, warnings));
  const { include, exclude } = resolvePackSets(options, config);

  // A pack may assert extra facts simply by applying (e.g. "we are a monorepo").
  const facts: Facts = detection.facts;
  // Declared intent (ADR-0029): `.usa/foundation.yaml` intents[] become
  // `intent:<value>` facts before pack selection, so intent-gated rules
  // (e.g. FND-014 on intent:api) apply exactly where promised. A broken
  // intent file warns loudly and asserts nothing — an audit must never run
  // half an intent, but it must still run.
  assertFoundationFacts(opts.target, facts, warnings);

  const selection = selectInitialPacks(packs, facts, include, exclude);

  // Packs can contribute facts, which can make another pack apply. Resolve to a
  // fixed point (bounded, so a malformed pack cannot hang the audit).
  resolvePackFacts(packs, facts, include, exclude, selection);

  const sections = selectSections(loadSections(opts.rulesDir), config.sections, warnings);
  const profiles = loadProfiles(opts.rulesDir);
  const maturity = resolveMaturity(opts.profile, config.maturity, detection.maturity, warnings);
  const profile = profiles[maturity];
  assertStageAspiration(opts.target, detection.maturity, warnings);

  const ctx: EvalContext = {
    project,
    facts,
    depth: opts.depth,
    allowCommands: opts.allowCommands,
    disabled,
    suppressions,
  };

  const evaluatedAll = evaluatePacks(
    selection.activePacks,
    facts,
    opts.depth,
    include,
    ctx,
    profile,
  );
  // A `sections:` restriction narrows both the scored set and the report, so a
  // scoped audit cannot leak findings it promised to exclude.
  const sectionFilter = config.sections ?? [];
  const wanted = new Set(sections.map((s) => s.id));
  const evaluated =
    sectionFilter.length > 0
      ? evaluatedAll.filter((e) => wanted.has(e.finding.section))
      : evaluatedAll;
  // Index warnings go last: content reads happen lazily during rule
  // evaluation, so oversize counts are only complete once scoring is done.
  appendIndexWarnings(project, warnings);
  appendUnusedSuppressionWarnings(suppressions, warnings);
  attachReviews(
    reviews,
    evaluated.map((e) => e.finding),
  );
  appendReviewWarnings(reviews, warnings);
  const card = score(evaluated, sections, profile);
  const report = buildReport(
    opts,
    git,
    detection,
    facts,
    maturity,
    card,
    evaluated,
    selection.packsLoaded,
    selection.packsSkipped,
  );

  return { report, warnings, profile };
}

/**
 * Merges an additional capability set into the loaded packs for a single run.
 * A pack id already present in the base registry wins (the registry is the
 * source of truth); duplicate ids from `extraPacks` are dropped silently so a
 * released capability cannot shadow a shipped one.
 */
function mergeExtraPacks(packs: RulePack[], extra: RulePack[] | undefined): void {
  if (!extra || extra.length === 0) return;
  const seen = new Set(packs.map((p) => p.id));
  for (const p of extra) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      packs.push(p);
    }
  }
}

function normalizeAuditOptions(options: AuditOptions, config: UsaConfig) {
  return {
    rulesDir: options.rulesDir ?? DEFAULT_RULES_DIR,
    depth: options.depth ?? ('standard' as Depth),
    profile: options.profile ?? ('auto' as Maturity | 'auto'),
    allowCommands: options.allowCommands ?? false,
    usaVersion: options.usaVersion ?? DEFAULT_VERSION,
    target: options.target,
    config,
  };
}

/**
 * Expired (or undated) waivers fail closed: an `until` date in the past — or
 * one that cannot be parsed — excludes the suppression and raises a warning,
 * so an audit never silently honours dead risk acceptances.
 */
function resolveSuppressions(
  suppressions: Suppression[] | undefined,
  warnings: string[],
): Suppression[] {
  const active: Suppression[] = [];
  for (const s of suppressions ?? []) {
    if (!s.rule) continue;
    if (s.until && isSuppressionExpired(s.rule, s.until, warnings)) continue;
    active.push(s);
  }
  return active;
}

function isSuppressionExpired(rule: string, until: string, warnings: string[]): boolean {
  const t = Date.parse(until);
  if (Number.isNaN(t)) {
    warnings.push(
      `suppression for ${rule} has an unparseable "until" date ("${until}") — waiver ignored`,
    );
    return true;
  }
  if (t < Date.now()) {
    warnings.push(`suppression for ${rule} expired on ${until} — treating as an active finding`);
    return true;
  }
  return false;
}

const MATURITIES: Maturity[] = ['prototype', 'mvp', 'beta', 'production', 'legacy'];

/**
 * CLI --profile wins; otherwise a valid config `maturity` pins the bar;
 * otherwise auto-detection stands. Invalid config values warn and fall back.
 */
function resolveMaturity(
  cliProfile: Maturity | 'auto',
  configMaturity: Maturity | undefined,
  detected: Maturity,
  warnings: string[],
): Maturity {
  if (cliProfile !== 'auto') return cliProfile;
  if (configMaturity === undefined) return detected;
  if ((MATURITIES as readonly string[]).includes(configMaturity)) return configMaturity;
  warnings.push(
    `.usa.yaml: invalid maturity "${String(configMaturity)}" — using auto-detected ${detected}`,
  );
  return detected;
}

/** Restrict scoring and reporting to the configured sections, if any. */
function selectSections(
  all: SectionDef[],
  wanted: string[] | undefined,
  warnings: string[],
): SectionDef[] {
  if (!wanted || wanted.length === 0) return all;
  const known = new Set(all.map((s) => s.id));
  for (const id of wanted) {
    if (!known.has(id)) warnings.push(`.usa.yaml: unknown section "${id}" in sections — ignored`);
  }
  return all.filter((s) => wanted.includes(s.id));
}

/**
 * A waiver that matched nothing is dead weight — usually a rule that no longer
 * fires there, a renamed file, or a passing rule. Report it so suppressions
 * decay instead of accumulating (ADR-0022, the ESLint model).
 */
function appendUnusedSuppressionWarnings(
  suppressions: ReturnType<typeof buildSuppressionIndex>,
  warnings: string[],
): void {
  for (const s of unusedSuppressions(suppressions)) {
    warnings.push(
      `suppression for ${describeSuppression(s)} matched no finding — remove it or fix the target`,
    );
  }
}

/**
 * Rank for the declared-vs-detected check (ADR-0041). Legacy is unranked:
 * a retiring system plays a different game and gets no aspiration warning.
 */
const STAGE_RANK: Record<string, number> = { prototype: 0, mvp: 1, beta: 2, production: 3 };

/**
 * ADR-0041: declared stage above detected maturity is aspiration beyond
 * evidence — one loud line, zero moved bars. Severity keeps following
 * detected maturity (never the declaration), so claiming `prototype` buys
 * no leniency and claiming `production` buys no strictness.
 */
function assertStageAspiration(target: string, detected: string, warnings: string[]): void {
  const declared = loadFoundationStage(target);
  if (declared === undefined) return;
  const want = STAGE_RANK[declared];
  const have = STAGE_RANK[detected];
  if (want === undefined || have === undefined || want <= have) return;
  warnings.push(
    `declared stage ${declared} exceeds detected maturity ${detected} — grading follows detected; ` +
      `pass --profile ${declared} to be held to the declared bar explicitly`,
  );
}

/**
 * Declared intent becomes detection facts. The loader throws on a broken
 * file (fail closed); the audit converts that into a warning and proceeds
 * without intent facts — a malformed promise must be loud, but it must not
 * brick the audit it was meant to guide.
 */
function assertFoundationFacts(target: string, facts: Facts, warnings: string[]): void {
  try {
    for (const flag of loadFoundationFacts(target)) facts.flags.add(flag);
  } catch (err) {
    warnings.push(`foundation intent ignored: ${(err as Error).message}`);
  }
}

/**
 * A review that matched nothing is dead provenance — the finding was fixed, the
 * rule renamed, the file moved. A review whose `until` has passed is a decision
 * nobody has revisited. Both are reported so the ledger decays instead of
 * accumulating (ADR-0023, the ESLint model applied to attention).
 */
function appendReviewWarnings(reviews: ReviewIndex, warnings: string[]): void {
  const nowMs = Date.now();
  for (const entries of reviews.values()) {
    for (const entry of entries) {
      if (!entry.used) {
        warnings.push(
          `review for ${describeReview(entry.review)} matched no finding — remove it or re-target it`,
        );
        continue;
      }
      const overdue = reviewOverdueDays(entry.review, nowMs);
      if (overdue !== null) {
        warnings.push(
          `review for ${describeReview(entry.review)} was due ${entry.review.until} — ` +
            `overdue by ${overdue} day(s); re-review`,
        );
      }
    }
  }
}

/**
 * Scale honesty: a truncated index or skipped oversize files means PASS
 * verdicts may rest on unseen files. Loud warning, never silent absorption.
 */
function appendIndexWarnings(project: Project, warnings: string[]): void {
  if (project.truncated) {
    warnings.push(
      `index truncated at ${MAX_FILES} files — the tree is bigger than the audit can see; ` +
        'treat PASS verdicts as partial and split the target (e.g. per-package audits)',
    );
  }
  if (project.skippedLarge > 0) {
    warnings.push(
      `${project.skippedLarge} file(s) skipped for exceeding ${MAX_FILE_BYTES} bytes — ` +
        'content checks could not see them',
    );
  }
  if (project.skippedSymlinks > 0) {
    warnings.push(
      `${project.skippedSymlinks} symlink(s) skipped without traversal — ` +
        'linked source is invisible to every check; materialize it to audit it',
    );
  }
}

/**
 * CLI flags win over config file; both are validated with warnings.
 * Invalid values fall back to engine defaults (never zero, never infinite).
 */
function resolveLimits(
  options: AuditOptions,
  config: UsaConfig,
  warnings: string[],
): { maxFiles?: number; maxBytes?: number } {
  return {
    maxFiles: validatedLimit(
      options.maxFiles ?? config.limits?.max_files,
      'limits.max_files / --max-files',
      warnings,
    ),
    maxBytes: validatedLimit(
      options.maxBytes ?? config.limits?.max_bytes,
      'limits.max_bytes / --max-bytes',
      warnings,
    ),
  };
}

function validatedLimit(
  v: number | undefined,
  name: string,
  warnings: string[],
): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v);
  warnings.push(`invalid ${name} "${String(v)}" (must be a positive number) — using defaults`);
  return undefined;
}

/**
 * History-thin targets blind the history-dependent rules (REPO-003 scans
 * `git log`, REL-002 needs tags, maturity signals need commits). The
 * negation in REPO-003 even turns git errors into PASS — true only in the
 * vacuous sense. Say so loudly instead of scoring blind confidence.
 */
function appendHistoryWarnings(git: ReturnType<Project['gitInfo']>, warnings: string[]): void {
  if (!git.isRepo) {
    warnings.push(
      'not a git repository — history and provenance checks cannot verify anything; ' +
        'treat history-dependent findings as vacuous',
    );
    return;
  }
  if (git.commits <= 1) {
    warnings.push(
      'single-commit history (shallow clone?) — maturity signals, tag checks, and ' +
        'history scans are under-verified; prefer a full clone for release-grade audits',
    );
  }
}

function resolvePackSets(
  options: AuditOptions,
  config: UsaConfig,
): { include: Set<string>; exclude: Set<string> } {
  return {
    include: new Set(options.includePacks ?? config.include ?? []),
    exclude: new Set(options.excludePacks ?? config.exclude ?? []),
  };
}

type RuleOverride = { severity?: Finding['severity']; weight?: number };

function collectRuleSettings(
  config: UsaConfig,
  warnings: string[],
): {
  disabled: Set<string>;
  overrides: Record<string, RuleOverride>;
} {
  const disabled = new Set<string>();
  const overrides: Record<string, RuleOverride> = {};
  for (const [id, o] of Object.entries(config.rules ?? {})) {
    if (o.disabled) disabled.add(id);
    const severity = validateOverrideSeverity(id, o.severity, warnings);
    const weight = validateOverrideWeight(id, o.weight, warnings);
    if (severity !== undefined || weight !== undefined) {
      overrides[id] = { severity, weight };
    }
  }
  return { disabled, overrides };
}

/**
 * Config overrides flow straight into scoring arithmetic — an invalid severity
 * yields NaN totals and a negative weight yields scores outside 0–100.
 * Reject loudly rather than corrupt the report.
 */
function validateOverrideSeverity(
  id: string,
  v: unknown,
  warnings: string[],
): RuleOverride['severity'] {
  if (v === undefined) return undefined;
  if ((SEVERITY_LADDER as readonly string[]).includes(String(v))) {
    return String(v) as RuleOverride['severity'];
  }
  warnings.push(`rules.${id}: invalid severity "${String(v)}" — override ignored`);
  return undefined;
}

function validateOverrideWeight(id: string, v: unknown, warnings: string[]): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  warnings.push(
    `rules.${id}: invalid weight "${String(v)}" (must be a finite number ≥ 0) — override ignored`,
  );
  return undefined;
}

interface PackSelection {
  activePacks: RulePack[];
  packsLoaded: string[];
  packsSkipped: string[];
}

function selectInitialPacks(
  packs: RulePack[],
  facts: Facts,
  include: Set<string>,
  exclude: Set<string>,
): PackSelection {
  const selection: PackSelection = { activePacks: [], packsLoaded: [], packsSkipped: [] };
  selection.activePacks = packs.filter((p) => selectPack(p, facts, include, exclude, selection));
  return selection;
}

function selectPack(
  pack: RulePack,
  facts: Facts,
  include: Set<string>,
  exclude: Set<string>,
  selection: PackSelection,
): boolean {
  if (exclude.has(pack.id)) {
    selection.packsSkipped.push(pack.id);
    return false;
  }
  if (include.has(pack.id)) {
    selection.packsLoaded.push(pack.id);
    pack.provides?.forEach((f) => facts.flags.add(f));
    return true;
  }
  if (!packApplies(pack, facts)) {
    selection.packsSkipped.push(pack.id);
    return false;
  }
  selection.packsLoaded.push(pack.id);
  pack.provides?.forEach((f) => facts.flags.add(f));
  return true;
}

function resolvePackFacts(
  packs: RulePack[],
  facts: Facts,
  include: Set<string>,
  exclude: Set<string>,
  selection: PackSelection,
): void {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const p of packs) {
      if (selection.packsLoaded.includes(p.id) || exclude.has(p.id) || include.has(p.id)) continue;
      if (!packApplies(p, facts)) continue;
      selection.packsLoaded.push(p.id);
      p.provides?.forEach((f) => facts.flags.add(f));
      selection.activePacks.push(p);
      changed = true;
    }
    if (!changed) break;
  }
}

function evaluatePacks(
  activePacks: RulePack[],
  facts: Facts,
  depth: Depth,
  include: Set<string>,
  ctx: EvalContext,
  profile: MaturityProfile,
): ScoredRule[] {
  const evaluated: ScoredRule[] = [];
  const invariants: RulePack['rules'][number][] = [];
  for (const pack of activePacks) {
    for (const rule of pack.rules) {
      if (!ruleApplies(rule, facts, depth, include.has(pack.id))) continue;
      // Invariants read conclusions, not files: second pass, after every
      // file rule has reported. Collect now, evaluate below.
      if (rule.check.kind === 'invariant') {
        invariants.push(rule);
        continue;
      }
      evaluated.push(scoreFinding(rule, ctx, profile));
    }
  }
  for (const rule of invariants) {
    evaluated.push(scoreInvariant(rule, ctx, profile, evaluated));
  }
  return evaluated;
}

function scoreInvariant(
  rule: RulePack['rules'][number],
  ctx: EvalContext,
  profile: MaturityProfile,
  evaluated: ScoredRule[],
): ScoredRule {
  const check = rule.check;
  if (check.kind !== 'invariant') {
    throw new Error(`scoreInvariant called on non-invariant rule ${rule.id}`);
  }
  const byId = new Map(evaluated.map((e) => [e.finding.ruleId, e.finding.status]));
  const findings = evaluated.map((e) => e.finding);
  const outcome = evaluateInvariant(check.when, check.assert, byId);
  const base = {
    ruleId: rule.id,
    title: rule.title,
    section: rule.section,
    sectionTitle: rule.sectionTitle ?? rule.section,
    baseSeverity: rule.severity,
    ruleClass: rule.ruleClass,
    why: rule.why,
    evidenceHint: rule.evidence,
    remediation: rule.remediation,
    references: rule.references,
    automatability: ruleAutomatability(rule),
    tags: rule.tags,
  };
  if (!outcome.applicable) {
    return {
      rule,
      finding: {
        ...base,
        status: 'NOT_APPLICABLE',
        severity: rule.severity,
        dampened: false,
        message: `Invariant inapplicable — ${outcome.detail}.`,
        locations: [],
      },
    };
  }
  const finding: Finding = {
    ...base,
    status: outcome.passed ? 'PASS' : 'FAIL',
    severity: rule.severity,
    dampened: false,
    message: outcome.passed
      ? `Combination holds and ${check.assert.rule} agrees — ${outcome.detail}.`
      : `Dangerous combination: ${outcome.detail}.`,
    locations: outcome.passed ? [] : invariantLocations(check.when, findings),
  };
  if (!outcome.passed) {
    applySuppressionToFinding(ctx.suppressions, rule.id, finding);
    if (finding.status !== 'PASS') {
      const { severity, dampened } = dampen(rule.severity, rule.ruleClass, profile);
      finding.severity = severity;
      finding.dampened = dampened;
    }
  }
  return { rule, finding };
}

function scoreFinding(
  rule: RulePack['rules'][number],
  ctx: EvalContext,
  profile: MaturityProfile,
): ScoredRule {
  const finding = evaluateRule(rule, ctx);
  if (finding.status === 'PASS' || finding.status === 'NOT_APPLICABLE') {
    return { rule, finding };
  }
  const { severity, dampened } = dampen(rule.severity, rule.ruleClass, profile);
  finding.severity = severity;
  finding.dampened = dampened;
  return { rule, finding };
}

function buildReport(
  opts: {
    target: string;
    depth: Depth;
    profile: Maturity | 'auto';
    rulesDir: string;
    usaVersion: string;
  },
  git: ReturnType<Project['gitInfo']>,
  detection: ReturnType<typeof detect>,
  facts: Facts,
  maturity: Maturity,
  card: AuditReport['score'],
  evaluated: ScoredRule[],
  packsLoaded: string[],
  packsSkipped: string[],
): AuditReport {
  return {
    schema: 'usa-report-v1',
    generatedAt: new Date().toISOString(),
    usaVersion: opts.usaVersion,
    ruleset: fingerprintRulesDir(opts.rulesDir),
    target: {
      path: path.resolve(opts.target),
      name: path.basename(path.resolve(opts.target)) || opts.target,
      commit: git.commit,
      ref: git.ref,
      repoUrl: git.repoUrl,
    },
    detection: {
      maturity,
      maturitySignals: detection.maturitySignals,
      projectTypes: pick(facts, 'project'),
      platforms: pick(facts, 'platform'),
      languages: pick(facts, 'lang'),
      frameworks: pick(facts, 'fw'),
      packageManagers: pick(facts, 'pm'),
      databases: pick(facts, 'db'),
      flags: [...facts.flags].filter((f) => f.startsWith('has:')).sort(),
      metrics: facts.metrics,
    },
    options: {
      depth: opts.depth,
      profile: opts.profile,
      rulesDir: opts.rulesDir,
      packsLoaded,
      packsSkipped,
    },
    score: card,
    findings: evaluated
      .map((e) => e.finding)
      .filter((f) => f.status !== 'NOT_APPLICABLE')
      .sort(bySeverityThenSection),
  };
}

function pick(facts: Facts, prefix: string): string[] {
  const out: string[] = [];
  for (const f of facts.flags) {
    if (f.startsWith(`${prefix}:`)) out.push(f.slice(prefix.length + 1));
  }
  return out.sort();
}

const ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, FUTURE: 4 };

function bySeverityThenSection(a: Finding, b: Finding): number {
  const sa = ORDER[a.severity] ?? 9;
  const sb = ORDER[b.severity] ?? 9;
  if (sa !== sb) return sa - sb;
  if (a.section !== b.section)
    return a.section.localeCompare(b.section, undefined, { numeric: true });
  return a.ruleId.localeCompare(b.ruleId);
}
