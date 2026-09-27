/**
 * Documentation universe audit — orchestration.
 *
 * `runDocAudit` is the single deterministic computation behind three surfaces
 * that must never disagree (AC-8):
 *   1. `usa docs audit`          — standalone report (DOC-AUDIT.md / JSON)
 *   2. `usa audit --docs-universe` — DOCU-* findings inside the main report
 *   3. the `--fail-on` gate on either surface (same findings object)
 *
 * It composes:
 *   - the taxonomy (rules/docs-taxonomy.yaml, 14 categories / 220 artifacts)
 *   - the inventory (presence per artifact, tier expectation per maturity)
 *   - the invariants (src/engine/docs-invariants.ts)
 *   - the impact analysis (src/engine/docs-impact.ts, when --changed)
 */
import path from 'node:path';
import type { Facts, Finding, Maturity, Severity } from '../types.js';
import { Project } from '../util/project.js';
import { detect, loadDetectorFile } from '../detect/index.js';
import {
  EXPECTED_TIERS,
  TIER_SEVERITY,
  artifactApplies,
  loadDocTaxonomy,
  matchPatterns,
  type DocArtifact,
  type DocTaxonomy,
} from './docs-taxonomy.js';
import {
  checkBrokenLinks,
  checkChangelogConsistency,
  checkDocstringCoverage,
  checkEnvVarCoverage,
  checkGeneratedProvenance,
  checkRouteCoverage,
  invariantToFinding,
  type InvariantResult,
} from './docs-invariants.js';
import { analyzeImpact, type ImpactResult } from './docs-impact.js';

/* ------------------------------------------------------------------ types -- */

export type DocStatus = 'PRESENT' | 'MISSING' | 'MANUAL' | 'NOT_APPLICABLE';

export interface DocInventoryEntry {
  artifact: DocArtifact;
  status: DocStatus;
  /** Tier within the expected range for the current stage? */
  expected: boolean;
  /** Files that satisfied the presence patterns (PRESENT only). */
  files: string[];
  /** Aliased absence: an existing rule already reports it (main audit). */
  aliasRule?: string;
}

export interface DocCategoryResult {
  id: string;
  name: string;
  entries: DocInventoryEntry[];
  present: number;
  missing: number;
  manual: number;
}

export interface DocTierCoverage {
  tier: number;
  applicable: number;
  present: number;
  missing: number;
  manual: number;
}

export interface DocAuditResult {
  schema: 'usa-doc-audit-v1';
  target: string;
  commit?: string;
  usaVersion: string;
  taxonomy: { schema: string; categories: number; artifacts: number };
  maturity: Maturity;
  expectedTiers: number[];
  inventory: DocCategoryResult[];
  coverage: DocTierCoverage[];
  totals: {
    artifacts: number;
    applicable: number;
    present: number;
    missing: number;
    manual: number;
    notApplicable: number;
  };
  invariants: InvariantResult[];
  impact?: ImpactResult;
  /** Open (non-PASS) findings — the gate's input. */
  findings: Finding[];
  limitations: string[];
}

export interface RunDocAuditInput {
  project: Project;
  facts: Facts;
  taxonomy: DocTaxonomy;
  maturity: Maturity;
  usaVersion: string;
  target: string;
  commit?: string;
  gitTags?: string[];
  /** Override the expected tiers (default: EXPECTED_TIERS[maturity]). */
  tiers?: number[];
  /** Changed files for impact analysis (optional). */
  changedFiles?: string[];
}

/** Static limitations, reported honestly in every report. */
export const DOC_LIMITATIONS = [
  'Presence is pattern-based: an artifact can exist under a name no pattern covers (reported as MANUAL when no pattern is defined, otherwise as MISSING).',
  'Impact sources are declarative globs plus any-source; a change whose invalidation path is not declared in rules/docs-taxonomy.yaml is not flagged.',
  'Route and env-var extraction are framework-broad heuristics (Express/FastAPI/Flask/chi-style signatures); exotic routers may be missed, so undetected surfaces are the only blind spot.',
  'USA is a read-only auditor: it reports remediation but never rewrites the target repository (the sync half of the contract is the agent/human job).',
  'Cross-references are checked for file existence, not for semantic correctness of the reference.',
];

/* --------------------------------------------------------------- inventory -- */

export function buildInventory(
  project: Project,
  taxonomy: DocTaxonomy,
  facts: Facts,
  expectedTiers: number[],
): {
  inventory: DocCategoryResult[];
  coverage: DocTierCoverage[];
  entries: Map<number, DocInventoryEntry>;
} {
  const entries = new Map<number, DocInventoryEntry>();
  const byCat = new Map<string, DocInventoryEntry[]>();
  for (const a of taxonomy.artifacts) {
    const applies = artifactApplies(a, facts);
    let status: DocStatus;
    let files: string[] = [];
    if (!applies) status = 'NOT_APPLICABLE';
    else if (a.patterns.length === 0) status = 'MANUAL';
    else {
      files = matchPatterns(project.files, a.patterns);
      status = files.length > 0 ? 'PRESENT' : 'MISSING';
    }
    const entry: DocInventoryEntry = {
      artifact: a,
      status,
      expected: applies && expectedTiers.includes(a.tier),
      files,
      aliasRule: status === 'MISSING' ? a.aliasRule : undefined,
    };
    entries.set(a.id, entry);
    const list = byCat.get(a.cat) ?? [];
    list.push(entry);
    byCat.set(a.cat, list);
  }

  const inventory: DocCategoryResult[] = taxonomy.categories.map((c) => {
    const list = byCat.get(c.id) ?? [];
    return {
      id: c.id,
      name: c.name,
      entries: list,
      present: list.filter((e) => e.status === 'PRESENT').length,
      missing: list.filter((e) => e.status === 'MISSING').length,
      manual: list.filter((e) => e.status === 'MANUAL').length,
    };
  });

  const coverage: DocTierCoverage[] = [0, 1, 2, 3, 4].map((tier) => {
    const list = [...entries.values()].filter(
      (e) => e.artifact.tier === tier && e.status !== 'NOT_APPLICABLE',
    );
    return {
      tier,
      applicable: list.length,
      present: list.filter((e) => e.status === 'PRESENT').length,
      missing: list.filter((e) => e.status === 'MISSING').length,
      manual: list.filter((e) => e.status === 'MANUAL').length,
    };
  });

  return { inventory, coverage, entries };
}

/* --------------------------------------------------------------- invariants -- */

export function runInvariants(
  project: Project,
  facts: Facts,
  gitTags: string[],
): InvariantResult[] {
  return [
    checkEnvVarCoverage(project),
    checkRouteCoverage(project),
    checkDocstringCoverage(project, facts),
    checkBrokenLinks(project),
    checkGeneratedProvenance(project),
    checkChangelogConsistency(project, gitTags),
  ];
}

/* ---------------------------------------------------------------- findings -- */

export interface DocFindingsOptions {
  /**
   * Rule ids that already have a finding in the evaluated set (main audit).
   * A missing artifact aliased to one of these is suppressed — the absence
   * is reported once, not twice (score double-dipping).
   */
  suppressAliasedRules?: Set<string>;
  /** Injected by the main audit so DOCU findings obey the maturity profile. */
  dampen: (base: Severity, profile: unknown) => { severity: Severity; dampened: boolean };
}

/**
 * The DOCU finding set: one finding per missing-expected artifact (aliased
 * absences suppressed per options) plus one finding per failing invariant.
 * Pure function of the audit state → deterministic (AC-2) and shared by the
 * standalone report and the main audit injection (AC-8).
 */
export function docFindings(result: DocAuditResult, opts: DocFindingsOptions): Finding[] {
  const catName = new Map(result.inventory.map((c) => [c.id, c.name]));
  const findings: Finding[] = [];
  for (const e of collectEntries(result)) {
    const f = missingArtifactFinding(e, catName.get(e.artifact.cat) ?? '', result, opts);
    if (f) findings.push(f);
  }
  for (const r of result.invariants) {
    if (r.status !== 'FAIL') continue;
    const { severity, dampened } = opts.dampen('LOW', null);
    findings.push(invariantToFinding(r, severity, dampened));
  }
  return findings;
}

function collectEntries(result: DocAuditResult): DocInventoryEntry[] {
  const entries = new Map<number, DocInventoryEntry>();
  for (const cat of result.inventory) for (const e of cat.entries) entries.set(e.artifact.id, e);
  return [...entries.values()].sort((a, b) => a.artifact.id - b.artifact.id);
}

function missingArtifactFinding(
  e: DocInventoryEntry,
  catLabel: string,
  result: DocAuditResult,
  opts: DocFindingsOptions,
): Finding | null {
  if (e.status !== 'MISSING' || !e.expected) return null;
  if (e.aliasRule && opts.suppressAliasedRules?.has(e.aliasRule)) return null;
  const base = TIER_SEVERITY[e.artifact.tier] ?? 'LOW';
  const { severity, dampened } = opts.dampen(base, null);
  const a = e.artifact;
  return {
    ruleId: `DOCU-${a.id}`,
    title: `${a.name} is missing`,
    section: 'S12',
    sectionTitle: 'Documentation & Knowledge',
    severity,
    baseSeverity: base,
    status: 'MISSING',
    ruleClass: 'documentation',
    dampened,
    message:
      `Artifact "${a.name}" (${a.cat} ${catLabel} #${a.id}, tier ${a.tier}, ` +
      `${a.kind}) is expected at ${result.maturity} stage but no matching file was found.`,
    locations: [],
    why:
      'Documentation is a first-class correctness contract: a missing expected artifact is a silent obligation, ' +
      'and the contract is tiered so young projects are not graded against launch bars.',
    remediation: remediationHint(a),
    references: ['Docs-as-Code'],
    automatability: 'full',
    tags: [`doc-cat:${a.cat}`, `doc-tier:${a.tier}`, `doc-kind:${a.kind}`],
  };
}

function remediationHint(a: DocArtifact): string {
  const positive = a.patterns.filter((p) => !p.startsWith('!'));
  const hint =
    positive.length > 0
      ? `Add the artifact (looked for: ${positive.slice(0, 5).join(', ')}).`
      : 'Add the artifact (not mechanically trackable — record where it lives).';
  return a.notes ? `${hint} ${a.notes}` : hint;
}

/* ------------------------------------------------------------------ render -- */

const STATUS_ICON: Record<DocStatus, string> = {
  PRESENT: '✅',
  MISSING: '🚫',
  MANUAL: '🖐️',
  NOT_APPLICABLE: '➖',
};

/** Standalone markdown report (DOC-AUDIT.md). Deterministic except the date. */
export function renderDocAuditMd(result: DocAuditResult, today: string): string {
  return [
    renderHeader(result, today),
    renderVerificationTable(result),
    renderTierTable(result),
    renderUniverse(result),
    renderInvariants(result),
    result.impact ? renderImpact(result.impact) : '',
    renderFindings(result),
    renderLimitations(result),
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}

function renderHeader(result: DocAuditResult, today: string): string {
  const L: string[] = [];
  L.push(`# Documentation audit — ${result.target}`);
  L.push('');
  L.push(
    `> USA ${result.usaVersion} · taxonomy ${result.taxonomy.schema} ` +
      `(${result.taxonomy.artifacts} artifacts, ${result.taxonomy.categories} categories)`,
  );
  if (result.commit) L.push(`> Baseline: \`${result.commit}\``);
  L.push(
    `> Maturity: **${result.maturity}** · expected tiers: ${result.expectedTiers.join(', ')} · ${today}`,
  );
  return L.join('\n');
}

function renderVerificationTable(result: DocAuditResult): string {
  const L: string[] = ['## Verification report', '', '| Metric | Value |', '| ------ | ----- |'];
  L.push(`| Baseline | ${result.commit ?? 'not a git repo'} |`);
  L.push(`| Categories covered | ${result.taxonomy.categories}/14 |`);
  for (const c of result.coverage) {
    L.push(
      `| Tier ${c.tier} artifacts | ${c.present} present / ${c.applicable} applicable ` +
        `(missing ${c.missing}, manual ${c.manual}) |`,
    );
  }
  const failing = result.invariants.filter((i) => i.status === 'FAIL').length;
  L.push(
    `| Invariants | ${result.invariants.length - failing}/${result.invariants.length} passing |`,
  );
  const crossCats = result.impact?.affected.filter((a) => a.crossCategory).length ?? 0;
  L.push(
    `| Impact mechanism | taxonomy sources + derives_from/syncs_with edges` +
      (result.impact
        ? ` (this run: ${result.impact.affected.length} affected, ${crossCats} cross-category)`
        : '') +
      ' |',
  );
  L.push(
    `| Local commands | \`usa docs audit\`, \`usa docs impact\`, \`usa docs coverage\`, \`usa audit --docs-universe\` |`,
  );
  L.push(`| Gate | \`usa docs audit --fail-on <sev>\` (same findings as CI) |`);
  L.push(`| Open findings | ${result.findings.length} |`);
  return L.join('\n');
}

function renderTierTable(result: DocAuditResult): string {
  const L: string[] = [
    '## Tier coverage',
    '',
    '| Tier | Applicable | Present | Missing | Manual | Expected |',
    '| ---- | ---------- | ------- | ------- | ------ | -------- |',
  ];
  for (const c of result.coverage) {
    L.push(
      `| ${c.tier} | ${c.applicable} | ${c.present} | ${c.missing} | ${c.manual} | ` +
        `${result.expectedTiers.includes(c.tier) ? 'yes' : 'no'} |`,
    );
  }
  const t = result.totals;
  L.push('');
  L.push(
    `Totals: ${t.present} present, ${t.missing} missing, ${t.manual} manual, ` +
      `${t.notApplicable} not applicable (of ${t.applicable} applicable).`,
  );
  return L.join('\n');
}

function renderUniverse(result: DocAuditResult): string {
  const L: string[] = ['## Documentation universe'];
  for (const cat of result.inventory) {
    L.push('');
    L.push(
      `### ${cat.id} · ${cat.name} — ${cat.present} present / ${cat.missing} missing / ${cat.manual} manual`,
    );
    L.push('');
    L.push('| # | Artifact | Tier | Kind | Status | Evidence |');
    L.push('| - | -------- | ---- | ---- | ------ | -------- |');
    for (const e of cat.entries) L.push(universeRow(e));
  }
  return L.join('\n');
}

function universeRow(e: DocInventoryEntry): string {
  const a = e.artifact;
  const icon = STATUS_ICON[e.status];
  const flag = e.expected && e.status === 'MISSING' ? ' **(expected)**' : '';
  const alias = e.aliasRule ? ` _alias: ${e.aliasRule}_` : '';
  const evidence =
    e.status === 'PRESENT'
      ? e.files.slice(0, 3).join(', ') + (e.files.length > 3 ? ` (+${e.files.length - 3})` : '')
      : e.status === 'MANUAL'
        ? 'manual'
        : e.status === 'MISSING'
          ? '—'
          : 'n/a';
  return `| ${a.id} | ${a.name} | ${a.tier} | ${a.kind} | ${icon} ${e.status}${flag}${alias} | ${evidence} |`;
}

function renderInvariants(result: DocAuditResult): string {
  const L: string[] = [
    '## Invariants',
    '',
    '| Invariant | Status | Detail |',
    '| --------- | ------ | ------ |',
  ];
  for (const r of result.invariants) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '➖';
    L.push(`| ${r.id} — ${r.title} | ${icon} ${r.status} | ${r.detail} |`);
  }
  return L.join('\n');
}

function renderImpact(impact: ImpactResult): string {
  const L: string[] = [
    '## Impact analysis',
    '',
    `Changed files: ${impact.changed.length} · affected artifacts: ${impact.affected.length} · ` +
      `edges traversed: ${impact.edgesTraversed}`,
    '',
  ];
  if (impact.affected.length > 0) {
    L.push('| Artifact | Category | Tier | Cross-category | Reason |');
    L.push('| -------- | -------- | ---- | -------------- | ------ |');
    for (const e of impact.affected) {
      L.push(
        `| #${e.artifact.id} ${e.artifact.name} | ${e.artifact.cat} | ${e.artifact.tier} | ` +
          `${e.crossCategory ? 'yes' : 'no'} | ${e.reasons.join('; ')} |`,
      );
    }
  }
  if (impact.noImpact.length > 0) {
    L.push('');
    L.push(`No documentation impact detected for: ${impact.noImpact.join(', ')}`);
  }
  return L.join('\n');
}

function renderFindings(result: DocAuditResult): string {
  const L: string[] = ['## Open findings', ''];
  if (result.findings.length === 0) {
    L.push('No open findings.');
  } else {
    for (const f of result.findings) L.push(findingBlock(f));
  }
  return L.join('\n');
}

function findingBlock(f: Finding): string {
  const L: string[] = [`- **${f.severity} ${f.ruleId}** — ${f.title}`, `  ${f.message}`];
  for (const loc of f.locations.slice(0, 10)) {
    L.push(
      `    - ${loc.file}${loc.line ? `:${loc.line}` : ''}${loc.excerpt ? ` — ${loc.excerpt}` : ''}`,
    );
  }
  if (f.locations.length > 10) L.push(`    - … and ${f.locations.length - 10} more`);
  if (f.remediation) L.push(`  _Repair: ${f.remediation}_`);
  return L.join('\n');
}

function renderLimitations(result: DocAuditResult): string {
  const L: string[] = ['## Known limitations', ''];
  for (const lim of result.limitations) L.push(`- ${lim}`);
  return L.join('\n');
}

/* ------------------------------------------------------------------ driver -- */

/** The one deterministic computation (see module doc). */
export function runDocAudit(input: RunDocAuditInput): DocAuditResult {
  const expectedTiers = input.tiers ?? EXPECTED_TIERS[input.maturity];
  const { inventory, coverage, entries } = buildInventory(
    input.project,
    input.taxonomy,
    input.facts,
    expectedTiers,
  );
  const invariants = runInvariants(input.project, input.facts, input.gitTags ?? []);
  const impact =
    input.changedFiles && input.changedFiles.length > 0
      ? analyzeImpact(input.taxonomy, input.facts, input.changedFiles)
      : undefined;

  const totals = {
    artifacts: input.taxonomy.artifacts.length,
    applicable: 0,
    present: 0,
    missing: 0,
    manual: 0,
    notApplicable: 0,
  };
  for (const e of entries.values()) {
    if (e.status === 'NOT_APPLICABLE') {
      totals.notApplicable++;
      continue;
    }
    totals.applicable++;
    if (e.status === 'PRESENT') totals.present++;
    else if (e.status === 'MISSING') totals.missing++;
    else totals.manual++;
  }

  const result: DocAuditResult = {
    schema: 'usa-doc-audit-v1',
    target: input.target,
    commit: input.commit,
    usaVersion: input.usaVersion,
    taxonomy: {
      schema: input.taxonomy.schema,
      categories: input.taxonomy.categories.length,
      artifacts: input.taxonomy.artifacts.length,
    },
    maturity: input.maturity,
    expectedTiers,
    inventory,
    coverage,
    totals,
    invariants,
    impact,
    findings: [],
    limitations: [...DOC_LIMITATIONS],
  };
  // Identity dampening here; the main audit re-derives findings with its own
  // profile via `docFindings` — same inputs, same outputs (AC-8).
  result.findings = docFindings(result, {
    dampen: (base) => ({ severity: base, dampened: false }),
  });
  return result;
}

/* --------------------------------------------------------------- plumbing -- */

export interface DocAuditContext {
  project: Project;
  facts: Facts;
  maturity: Maturity;
  warnings: string[];
  commit?: string;
  gitTags: string[];
}

/**
 * Shared load: project index + detection + taxonomy. Used by the CLI so the
 * three `usa docs` subcommands and `usa audit --docs-universe` share one
 * loading path (single source of truth for the inputs, AC-8).
 */
export function loadDocAuditContext(
  target: string,
  rulesDir: string,
  extraFacts: string[] = [],
): { context: DocAuditContext | null; taxonomy: DocTaxonomy | null; warnings: string[] } {
  const warnings: string[] = [];
  const project = new Project(target);
  const git = project.gitInfo();
  const detection = detect(project, loadDetectorFile(rulesDir), git, extraFacts);
  const { taxonomy, warnings: taxWarnings } = loadDocTaxonomy(rulesDir);
  warnings.push(...taxWarnings);
  if (!taxonomy) return { context: null, taxonomy: null, warnings };
  return {
    context: {
      project,
      facts: detection.facts,
      maturity: detection.maturity,
      warnings,
      commit: git.commit,
      gitTags: project.gitTags(),
    },
    taxonomy,
    warnings,
  };
}

export function resolveTargetLabel(target: string): string {
  return path.basename(path.resolve(target)) || target;
}
