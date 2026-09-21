import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_RULES_DIR,
  VERSION,
  bool,
  dryRunWrites,
  list,
  str,
  type Args,
} from './cli-args.js';
import { loadConfig } from './config.js';
import { evaluateGateForFindings } from './engine/gate.js';
import {
  loadDocAuditContext,
  renderDocAuditMd,
  resolveTargetLabel,
  runDocAudit,
  type DocAuditContext,
  type DocAuditResult,
} from './engine/docs-audit.js';
import type { DocTaxonomy } from './engine/docs-taxonomy.js';
import { describeFile } from './engine/docs-impact.js';
import { writeTextFile } from './util/files.js';
import type { Maturity } from './types.js';

/**
 * `usa docs` — the documentation universe surface.
 *
 *   usa docs audit [path]    full 14-category documentation audit
 *   usa docs impact [path]   which docs a change affects (semantic model)
 *   usa docs coverage [path] coverage report against the taxonomy
 *
 * Read-only by construction: USA audits, it never rewrites the target repo.
 * The `--fail-on` gate on `audit` is the CI-equivalent check (AC-8/9) — the
 * same findings the main audit emits with `--docs-universe`.
 */
/* ------------------------------------------------------------------ help -- */

export const DOCS_HELP_TEXT = `
usa docs — documentation universe audit (14 categories, 220 artifacts)

  usa docs audit [path]     Audit documentation: inventory, tier coverage,
                            invariants, optional impact (--changed), gate
  usa docs impact [path]    Which documentation a set of changed files affects
  usa docs coverage [path]  Coverage report against the full taxonomy

audit options
  --out <file>        Report path (default DOC-AUDIT.md)
  --format <fmt>      md | json                   (default md; inferred from --out)
  --fail-on <sev>     Exit 1 on findings >= sev: critical|high|medium|low|none
  --changed <file>    Changed file for impact analysis (repeatable, or comma separated)
  --tiers <list>      Expected tiers, comma separated (default: by detected maturity)
  --profile <stage>   auto | prototype | mvp | beta | production | legacy
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)
  --config <file>     Explicit .usa.yaml location
  --fact <ns:value>   Assert a fact detection missed
  --dry-run           Print the report path that would be written and exit
  --quiet             Only errors

impact options
  --changed <file>    Changed file (repeatable, or comma separated) — required
  --describe <file>   Instead of impact: show the documentation relationship
                      of one file (what it invalidates, what it documents,
                      what derives from it)
  --format <fmt>      md | json                   (default md)
  --profile <stage>   auto | prototype | mvp | beta | production | legacy
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)
  --config <file>     Explicit .usa.yaml location

coverage options
  --format <fmt>      md | json                   (default md)
  --profile <stage>   auto | prototype | mvp | beta | production | legacy
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)
  --config <file>     Explicit .usa.yaml location

examples
  usa docs audit . --out DOC-AUDIT.md
  usa docs audit . --fail-on medium          # CI-equivalent gate
  usa docs impact . --changed src/api/users.ts --changed .env.example
  usa docs impact . --describe docs/api/users.md
  usa docs coverage . --format json
`.trim();

/* ----------------------------------------------------------------- shared -- */

const MATURITIES: Maturity[] = ['prototype', 'mvp', 'beta', 'production', 'legacy'];

function validateProfile(arg: string | undefined): string | null {
  if (arg === undefined || arg === 'auto') return null;
  if (!MATURITIES.includes(arg as Maturity)) {
    return `--profile must be auto or one of ${MATURITIES.join('|')}`;
  }
  return null;
}

/** Comma list of 0..4 → sorted unique tiers; error message on bad input. */
function parseTiers(raw: string | undefined): { tiers?: number[]; error?: string } {
  if (raw === undefined) return {};
  const tiers = [...new Set(raw.split(',').map((s) => Number(s.trim())))].filter((n) =>
    Number.isInteger(n),
  );
  if (tiers.length === 0 || tiers.some((n) => n < 0 || n > 4)) {
    return { error: '--tiers must be a comma separated list of integers 0..4' };
  }
  return { tiers: tiers.sort((a, b) => a - b) };
}

/** Mirrors EXPECTED_TIERS (docs-taxonomy.ts) — one place for the CLI view. */
function defaultTiersFor(maturity: Maturity): number[] {
  switch (maturity) {
    case 'mvp':
      return [0, 1, 2];
    case 'beta':
      return [0, 1, 2, 3];
    case 'production':
      return [0, 1, 2, 3, 4];
    default:
      return [0, 1];
  }
}

interface Loaded {
  ctx: DocAuditContext;
  taxonomy: DocTaxonomy;
}

/** Shared load; `error` means the caller prints it and returns 2. */
function loadContext(target: string, args: Args): Loaded | { error: string } {
  if (!fs.existsSync(target)) {
    return { error: `Target path does not exist: ${target}` };
  }
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  let config;
  try {
    config = loadConfig(target, str(args, 'config'));
  } catch (err) {
    return { error: (err as Error).message };
  }
  const { context, taxonomy, warnings } = loadDocAuditContext(target, rulesDir, [
    ...list(args, 'fact'),
    ...(config.facts ?? []),
  ]);
  for (const w of warnings) console.error(`warning: ${w}`);
  if (!context || !taxonomy) {
    return { error: 'Documentation universe unavailable (see warnings above).' };
  }
  return { ctx: context, taxonomy };
}

function resolveMaturity(ctx: DocAuditContext, arg: string | undefined): Maturity {
  return (arg && arg !== 'auto' ? arg : ctx.maturity) as Maturity;
}

function buildResult(
  target: string,
  ctx: DocAuditContext,
  taxonomy: DocTaxonomy,
  maturity: Maturity,
  tiers: number[],
  changed: string[],
): DocAuditResult {
  return runDocAudit({
    project: ctx.project,
    facts: ctx.facts,
    taxonomy,
    maturity,
    usaVersion: VERSION,
    target: resolveTargetLabel(target),
    commit: ctx.commit,
    gitTags: ctx.gitTags,
    tiers,
    changedFiles: changed.length > 0 ? changed : undefined,
  });
}

/* ----------------------------------------------------------------- audit -- */

export function cmdDocsAudit(args: Args): number {
  const target = (args._[2] as string | undefined) ?? '.';
  const out = str(args, 'out', 'DOC-AUDIT.md') ?? 'DOC-AUDIT.md';
  if (!dryRunWrites(args, [out])) return 0;

  const loaded = loadContext(target, args);
  if ('error' in loaded) {
    console.error(loaded.error);
    return 2;
  }
  const { ctx, taxonomy } = loaded;
  const { maturity, expectedTiers, error } = resolveAuditArgs(args, ctx);
  if (error) {
    console.error(error);
    return 2;
  }
  const result = buildResult(target, ctx, taxonomy, maturity, expectedTiers, list(args, 'changed'));
  const rendered = renderAudit(result, resolveFormat(args, out));
  if (rendered === null) {
    console.error('--format must be md or json');
    return 2;
  }
  if (!writeReport(out, rendered)) return 2;
  if (!bool(args, 'quiet')) {
    console.log(
      `usa docs audit (${maturity}, tiers ${expectedTiers.join(',')}) — ${summarize(result)}`,
    );
    console.log(`  report → ${out}`);
  }
  return evaluateGateForFindings(result.findings, failOnArg(args), bool(args, 'quiet'));
}

/** Profile + tiers validation and resolution (one place for both flags). */
function resolveAuditArgs(
  args: Args,
  ctx: DocAuditContext,
): { maturity: Maturity; expectedTiers: number[]; error?: string } {
  const invalid = validateProfile(str(args, 'profile'));
  if (invalid) return { maturity: ctx.maturity, expectedTiers: [], error: invalid };
  const maturity = resolveMaturity(ctx, str(args, 'profile'));
  const { tiers, error } = parseTiers(str(args, 'tiers'));
  if (error) return { maturity, expectedTiers: [], error };
  return { maturity, expectedTiers: tiers ?? defaultTiersFor(maturity) };
}

function writeReport(out: string, rendered: string): boolean {
  try {
    writeTextFile(out, rendered);
    return true;
  } catch (err) {
    console.error((err as Error).message);
    return false;
  }
}

function failOnArg(args: Args): string {
  return (str(args, 'fail-on', 'none') ?? 'none').toLowerCase();
}

/** Explicit --format wins; otherwise the output extension decides. */
function resolveFormat(args: Args, out: string): string {
  return (
    str(args, 'format') ?? (path.extname(out).toLowerCase() === '.json' ? 'json' : 'md')
  ).toLowerCase();
}

/** null = unsupported format (the caller reports the usage error). */
function renderAudit(result: DocAuditResult, fmt: string): string | null {
  if (fmt === 'json') {
    // JSON is for machines: deterministic bytes, no wall-clock stamp.
    return JSON.stringify(result, null, 2);
  }
  if (fmt === 'md') return renderDocAuditMd(result, todayStamp());
  return null;
}

function summarize(result: DocAuditResult): string {
  const t = result.totals;
  const failing = result.invariants.filter((i) => i.status === 'FAIL').length;
  return (
    `${t.present}/${t.applicable} applicable artifacts present, ${t.missing} missing, ` +
    `${failing} invariant(s) failing, ${result.findings.length} open finding(s)`
  );
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------- impact -- */

export function cmdDocsImpact(args: Args): number {
  const invalid = validateProfile(str(args, 'profile'));
  if (invalid) {
    console.error(invalid);
    return 2;
  }
  const target = (args._[2] as string | undefined) ?? '.';
  const changed = list(args, 'changed');
  const describe = str(args, 'describe');
  if (changed.length === 0 && !describe) {
    console.error(
      'usage: usa docs impact <path> --changed <file> [--changed <file> ...] | --describe <file>',
    );
    return 2;
  }
  const loaded = loadContext(target, args);
  if ('error' in loaded) {
    console.error(loaded.error);
    return 2;
  }
  const { ctx, taxonomy } = loaded;
  const maturity = resolveMaturity(ctx, str(args, 'profile'));
  const fmt = (str(args, 'format') ?? 'md').toLowerCase();

  if (describe) {
    printDescribe(ctx, taxonomy, describe, fmt);
    return 0;
  }
  const result = buildResult(target, ctx, taxonomy, maturity, defaultTiersFor(maturity), changed);
  if (!result.impact) {
    console.error('no impact computed (no changed files)');
    return 2;
  }
  console.log(
    fmt === 'json' ? impactJson(result.impact) : impactMd(target, maturity, result.impact),
  );
  return 0;
}

function impactJson(imp: NonNullable<DocAuditResult['impact']>): string {
  return JSON.stringify(
    {
      schema: 'usa-doc-impact-v1',
      changed: imp.changed,
      affected: imp.affected.map((e) => ({
        id: e.artifact.id,
        name: e.artifact.name,
        category: e.artifact.cat,
        tier: e.artifact.tier,
        crossCategory: e.crossCategory,
        reasons: e.reasons,
        triggeredBy: e.triggeredBy,
      })),
      noImpact: imp.noImpact,
      edgesTraversed: imp.edgesTraversed,
    },
    null,
    2,
  );
}

function impactMd(
  target: string,
  maturity: string,
  imp: NonNullable<DocAuditResult['impact']>,
): string {
  const L: string[] = [];
  L.push(`# Documentation impact — ${resolveTargetLabel(target)} (${maturity})`);
  L.push('');
  L.push(
    `Changed files: ${imp.changed.length} · affected artifacts: ${imp.affected.length} · edges traversed: ${imp.edgesTraversed}`,
  );
  L.push('');
  if (imp.affected.length === 0) {
    L.push('No documentation impact detected for this change set.');
  } else {
    for (const e of imp.affected) {
      const cross = e.crossCategory ? ' [cross-category]' : '';
      L.push(
        `# ${e.artifact.id} ${e.artifact.name} (${e.artifact.cat}, tier ${e.artifact.tier})${cross}`,
      );
      for (const r of e.reasons) L.push(`  - ${r}`);
    }
  }
  if (imp.noImpact.length > 0) {
    L.push('');
    L.push(`No documentation impact detected for: ${imp.noImpact.join(', ')}`);
  }
  L.push('');
  L.push(
    'Conservative by design: prefer a flagged doc over a stale one. Update the listed artifacts (or add a taxonomy edge) and re-run.',
  );
  return L.join('\n');
}

function printDescribe(
  ctx: DocAuditContext,
  taxonomy: DocTaxonomy,
  file: string,
  fmt: string,
): void {
  const d = describeFile(taxonomy, ctx.facts, file);
  if (fmt === 'json') {
    console.log(
      JSON.stringify(
        {
          schema: 'usa-doc-describe-v1',
          file: d.file,
          invalidates: d.invalidates.map((a) => a.id),
          documents: d.documents.map((a) => a.id),
          downstream: d.downstream.map((a) => a.id),
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`# Documentation relationship — ${file}`);
  console.log();
  console.log(`Invalidates (${d.invalidates.length}):`);
  for (const a of d.invalidates) console.log(`  - #${a.id} ${a.name} (${a.cat}, tier ${a.tier})`);
  console.log(`Documents (${d.documents.length}):`);
  for (const a of d.documents) console.log(`  - #${a.id} ${a.name} (${a.cat}, tier ${a.tier})`);
  console.log(`Downstream (${d.downstream.length}):`);
  for (const a of d.downstream) console.log(`  - #${a.id} ${a.name} (${a.cat}, tier ${a.tier})`);
}

/* --------------------------------------------------------------- coverage -- */

export function cmdDocsCoverage(args: Args): number {
  const invalid = validateProfile(str(args, 'profile'));
  if (invalid) {
    console.error(invalid);
    return 2;
  }
  const target = (args._[2] as string | undefined) ?? '.';
  const loaded = loadContext(target, args);
  if ('error' in loaded) {
    console.error(loaded.error);
    return 2;
  }
  const { ctx, taxonomy } = loaded;
  const maturity = resolveMaturity(ctx, str(args, 'profile'));
  const result = buildResult(target, ctx, taxonomy, maturity, defaultTiersFor(maturity), []);
  const fmt = (str(args, 'format') ?? 'md').toLowerCase();
  if (fmt === 'json') {
    console.log(coverageJson(result));
    return 0;
  }
  console.log(coverageMd(result));
  return 0;
}

function coverageJson(result: DocAuditResult): string {
  return JSON.stringify(
    {
      schema: 'usa-doc-coverage-v1',
      target: result.target,
      maturity: result.maturity,
      expectedTiers: result.expectedTiers,
      totals: result.totals,
      coverage: result.coverage,
      categories: result.inventory.map((c) => ({
        id: c.id,
        name: c.name,
        present: c.present,
        missing: c.missing,
        manual: c.manual,
        artifacts: c.entries.map((e) => ({
          id: e.artifact.id,
          name: e.artifact.name,
          tier: e.artifact.tier,
          kind: e.artifact.kind,
          status: e.status,
          files: e.files.slice(0, 5),
        })),
      })),
    },
    null,
    2,
  );
}

function coverageMd(result: DocAuditResult): string {
  const t2 = result.totals;
  const L: string[] = [];
  L.push(`# Documentation coverage — ${result.target} (${result.maturity})`);
  L.push('');
  L.push(
    `Totals: ${t2.present} present, ${t2.missing} missing, ${t2.manual} manual, ` +
      `${t2.notApplicable} not applicable (of ${t2.applicable} applicable, ${t2.artifacts} known).`,
  );
  L.push('');
  L.push('| Tier | Applicable | Present | Missing | Manual | Expected |');
  L.push('| ---- | ---------- | ------- | ------- | ------ | -------- |');
  for (const c of result.coverage) {
    L.push(
      `| ${c.tier} | ${c.applicable} | ${c.present} | ${c.missing} | ${c.manual} | ` +
        `${result.expectedTiers.includes(c.tier) ? 'yes' : 'no'} |`,
    );
  }
  L.push('');
  for (const c of result.inventory) {
    L.push(
      `${c.id} · ${c.name} — ${c.present} present / ${c.missing} missing / ${c.manual} manual`,
    );
    for (const e of c.entries) {
      if (e.status === 'NOT_APPLICABLE') continue;
      const icon = e.status === 'PRESENT' ? '✅' : e.status === 'MISSING' ? '🚫' : '🖐️';
      const flag = e.expected && e.status === 'MISSING' ? ' (expected)' : '';
      L.push(
        `  ${icon} ${e.artifact.id.toString().padStart(3)} ${e.artifact.name} [t${e.artifact.tier} · ${e.artifact.kind}]${flag}`,
      );
    }
  }
  return L.join('\n');
}

/* ---------------------------------------------------------------- dispatch -- */

export function cmdDocs(args: Args): number {
  if (bool(args, 'help')) {
    console.log(DOCS_HELP_TEXT);
    return 0;
  }
  const sub = args._[1] as string | undefined;
  switch (sub) {
    case 'audit':
      return cmdDocsAudit(args);
    case 'impact':
      return cmdDocsImpact(args);
    case 'coverage':
      return cmdDocsCoverage(args);
    case undefined:
      console.log(DOCS_HELP_TEXT);
      return 0;
    default:
      console.error(`Unknown docs subcommand: ${sub}\n`);
      console.error(DOCS_HELP_TEXT);
      return 2;
  }
}
