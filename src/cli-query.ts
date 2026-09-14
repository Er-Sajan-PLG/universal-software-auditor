import path from 'node:path';
import type { Rule } from './types.js';
import { detect } from './detect/index.js';
import { loadDetectorFile } from './detect/index.js';
import { Project } from './util/project.js';
import { loadRulePacks } from './engine/loader.js';
import { catalogueCoverage, catalogueOf, loadCatalogues } from './engine/catalogues.js';
import type { Catalogue } from './engine/catalogues.js';
import { categoryCoverage, loadCategories } from './engine/categories.js';
import { loadConfig } from './config.js';
import { ruleAutomatability } from './engine/automatability.js';
import { DEFAULT_RULES_DIR, list, str, type Args } from './cli-args.js';

/** Read-only catalogue queries: detect, rules, explain, standards, categories. */
/* ----------------------------------------------------------------- detect -- */

export function cmdDetect(args: Args): number {
  const target = (args._[1] as string | undefined) ?? '.';
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  const config = loadConfig(target, str(args, 'config'));
  const project = new Project(target, config.ignore ?? []);
  const git = project.gitInfo();
  const detection = detect(project, loadDetectorFile(rulesDir), git, [
    ...list(args, 'fact'),
    ...(config.facts ?? []),
  ]);
  const grouped = groupFlagsByNamespace(detection.facts.flags);
  console.log(`# Detection: ${path.resolve(target)}`);
  console.log();
  console.log(`maturity: ${detection.maturity}`);
  for (const [ns, values] of [...grouped.entries()].sort()) {
    console.log(`${ns}: ${[...new Set(values)].sort().join(', ')}`);
  }
  console.log();
  console.log('metrics:');
  for (const [k, v] of Object.entries(detection.facts.metrics)) console.log(`  ${k}: ${v}`);
  console.log();
  console.log('maturity signals:');
  for (const s of detection.maturitySignals) console.log(`  ${s}`);
  return 0;
}

function groupFlagsByNamespace(flags: Iterable<string>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const f of flags) {
    const [ns, value] = f.split(':');
    const key = value === undefined ? 'other' : ns!;
    const list2 = grouped.get(key) ?? [];
    list2.push(value === undefined ? f : value);
    grouped.set(key, list2);
  }
  return grouped;
}

/* ------------------------------------------------------------------ rules -- */

export function cmdRules(args: Args): number {
  if (args['format'] !== undefined) {
    console.error('warning: rules has no --format; ignoring');
  }
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  const { packs } = loadRulePacks(rulesDir);
  const filter = str(args, 'section');
  let total = 0;
  for (const pack of packs) {
    const rules = filter ? pack.rules.filter((r) => r.section === filter) : pack.rules;
    if (filter && rules.length === 0) continue;
    console.log(`\n## ${pack.id} — ${pack.title} (${rules.length} rules)`);
    if (pack.description) console.log(`   ${pack.description}`);
    for (const r of rules) {
      total++;
      console.log(
        `   ${r.id.padEnd(10)} ${r.severity.padEnd(8)} ${r.ruleClass.padEnd(16)} ${r.title}`,
      );
    }
  }
  console.log(`\n${total} rule(s) across ${packs.length} pack(s).`);
  return 0;
}

/* ---------------------------------------------------------------- explain -- */

export function cmdExplain(args: Args): number {
  const id = args._[1] as string | undefined;
  if (!id) {
    console.error('Usage: usa explain <RULE-ID>');
    return 2;
  }
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  const { packs } = loadRulePacks(rulesDir);
  const { catalogues } = loadCatalogues(rulesDir);
  for (const pack of packs) {
    const rule = pack.rules.find((r) => r.id.toLowerCase() === id.toLowerCase());
    if (!rule) continue;
    printRuleDetail(pack.id, rule, catalogues);
    return 0;
  }
  console.error(`Rule not found: ${id}`);
  return 1;
}

export function cmdStandards(args: Args): number {
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  const { packs } = loadRulePacks(rulesDir);
  const { catalogues } = loadCatalogues(rulesDir);
  const rows = catalogueCoverage(packs, catalogues);
  const fmt = (str(args, 'format') ?? 'md').toLowerCase();
  if (fmt === 'json') {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  // Markdown table: catalogue → rules → how many the engine can fully decide.
  console.log('| Catalogue | Rules | Fully automated | Assisted | Manual |');
  console.log('| --------- | ----- | --------------- | -------- | ------ |');
  for (const row of rows) {
    console.log(
      `| ${row.name} (\`${row.catalogue}\`) | ${row.rules} | ${row.automatable.full} | ${row.automatable.assist} | ${row.automatable.manual} |`,
    );
  }
  return 0;
}

/**
 * Category coverage is derived, never scored (ADR-0030 taxonomy rule): the
 * table answers "which future domains already have rules" without touching
 * scoring, gates, or confidence.
 */
export function cmdCategories(args: Args): number {
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  const { packs } = loadRulePacks(rulesDir);
  const { categories, warnings } = loadCategories(rulesDir);
  for (const w of warnings) console.error(`warning: ${w}`);
  const rows = categoryCoverage(packs, categories);
  const fmt = (str(args, 'format') ?? 'md').toLowerCase();
  if (fmt === 'json') {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  console.log('| Category | Rules | Sections |');
  console.log('| -------- | ----- | -------- |');
  for (const row of rows) {
    console.log(
      `| ${row.name} (\`${row.id}\`) | ${row.ruleCount} | ${row.sections.join(', ') || '—'} |`,
    );
  }
  return 0;
}

function printRuleDetail(packId: string, rule: Rule, catalogues: Catalogue[]): void {
  console.log(`# ${rule.id} — ${rule.title}`);
  console.log();
  console.log(`pack      : ${packId}`);
  console.log(`section   : ${rule.section} ${rule.sectionTitle ?? ''}`);
  console.log(`severity  : ${rule.severity} (when violated)`);
  console.log(`class     : ${rule.ruleClass}`);
  console.log(`weight    : ${rule.weight ?? 'default'}`);
  console.log(`depths    : ${rule.depths?.join(', ') ?? 'all'}`);
  console.log(`automatable: ${ruleAutomatability(rule)}`);
  const catalogue = catalogueOf(rule, catalogues);
  if (catalogue) console.log(`catalogue : ${catalogue}`);
  console.log(`check     : ${JSON.stringify(rule.check)}`);
  printRuleOptional(rule);
}

function printRuleOptional(rule: Rule): void {
  if (rule.appliesWhen) console.log(`applies   : ${JSON.stringify(rule.appliesWhen)}`);
  if (rule.why) console.log(`\nwhy:\n  ${rule.why}`);
  if (rule.evidence) console.log(`\nevidence:\n  ${rule.evidence}`);
  if (rule.remediation) console.log(`\nfix:\n  ${rule.remediation}`);
  if (rule.references?.length) console.log(`\nreferences:\n  ${rule.references.join('\n  ')}`);
}

/* ------------------------------------------------------------------- diff -- */
