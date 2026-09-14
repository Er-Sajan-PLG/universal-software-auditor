import fs from 'node:fs';
import path from 'node:path';
import { detect } from './detect/index.js';
import { loadDetectorFile } from './detect/index.js';
import { Project } from './util/project.js';
import { bootstrapPacks, writeBootstrapPacks } from './bootstrap/index.js';
import { EXAMPLE_CONFIG, loadConfig } from './config.js';
import { learnFromReport, renderSuggestions, type LearnOptions } from './learn/index.js';
import { DEFAULT_RULES_DIR, dryRunWrites, list, str, type Args } from './cli-args.js';
import { WORKFLOW_TEMPLATE } from './cli-help.js';
import { writeTextFile } from './util/files.js';

/** Scaffolding and generation: bootstrap packs, init, learn suggestions. */
/* -------------------------------------------------------------- bootstrap -- */

export function cmdBootstrap(args: Args): number {
  const target = (args._[1] as string | undefined) ?? '.';
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  const config = loadConfig(target, str(args, 'config'));
  const project = new Project(target, config.ignore ?? []);
  const git = project.gitInfo();
  const out = str(args, 'out');
  // CLI-003: preview before detection runs.
  if (out && !dryRunWrites(args, [out])) return 0;
  const detection = detect(project, loadDetectorFile(rulesDir), git, [
    ...list(args, 'fact'),
    ...(config.facts ?? []),
  ]);
  const outcome = bootstrapPacks(detection.facts);
  if (outcome.packs.length === 0) {
    console.log('No uncovered stacks: every detected language already has a pack.');
    return 0;
  }
  if (!out) {
    printBootstrap(outcome);
    return 0;
  }
  return writeBootstrapResult(outcome, out);
}

/** Write packs to --out with a clean error (exit 2), never a stack trace. */
function writeBootstrapResult(outcome: ReturnType<typeof bootstrapPacks>, out: string): number {
  try {
    writeBootstrapPacks(outcome, out);
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
  console.log(`wrote ${outcome.packs.length} pack(s) to ${out}`);
  for (const note of outcome.notes) console.log(`- ${note}`);
  return 0;
}

function printBootstrap(outcome: ReturnType<typeof bootstrapPacks>): void {
  for (const pack of outcome.packs) {
    console.log(`--- ${pack.filename} ---`);
    console.log(pack.yaml);
  }
  for (const note of outcome.notes) console.log(`- ${note}`);
}

/* ------------------------------------------------------------------- init -- */

export function cmdInit(args: Args): number {
  const target = (args._[1] as string | undefined) ?? '.';
  const configPath = path.join(target, '.usa.yaml');
  const workflowDir = path.join(target, '.github', 'workflows');
  const workflowPath = path.join(workflowDir, 'usa.yml');
  // CLI-003: preview the scaffold before creating anything.
  if (
    !dryRunWrites(
      args,
      [configPath, workflowPath].filter((p) => !fs.existsSync(p)),
    )
  )
    return 0;
  fs.mkdirSync(target, { recursive: true });
  if (fs.existsSync(configPath)) {
    console.error(`${configPath} already exists — leaving it alone.`);
  } else {
    fs.writeFileSync(configPath, EXAMPLE_CONFIG, 'utf8');
    console.log(`created ${configPath}`);
  }
  if (fs.existsSync(workflowPath)) {
    console.error(`${workflowPath} already exists — leaving it alone.`);
  } else {
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(workflowPath, WORKFLOW_TEMPLATE, 'utf8');
    console.log(`created ${workflowPath}`);
  }
  console.log('\nNext: run `npx usa audit .` or `usa audit . --depth standard`.');
  return 0;
}

/* ------------------------------------------------------------------ learn -- */

export function cmdLearn(args: Args): number {
  const reportPath = args._[1] as string | undefined;
  if (!reportPath) {
    console.error(
      'Usage: usa learn <report.md> [--out <file>] [--min-severity MEDIUM] [--dry-run]',
    );
    return 2;
  }
  if (!fs.existsSync(reportPath)) {
    console.error(`Report file not found: ${reportPath}`);
    return 2;
  }
  const outFile = str(args, 'out', 'learn-suggestions.yaml') ?? 'learn-suggestions.yaml';
  const minSeverity = (str(args, 'min-severity', 'MEDIUM') ?? 'MEDIUM').toUpperCase() as
    'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'FUTURE';
  const allowed = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'FUTURE'];
  if (!allowed.includes(minSeverity)) {
    console.error(`--min-severity must be one of: ${allowed.join(', ')}`);
    return 2;
  }
  // CLI-003: preview before the report is mined.
  if (!dryRunWrites(args, [outFile])) return 0;
  const options: LearnOptions = { reportPath, out: outFile, minSeverity };
  try {
    const suggestions = learnFromReport(options);
    if (suggestions.length === 0) {
      console.log(`No actionable suggestions found in ${reportPath}.`);
      return 0;
    }
    const yaml = renderSuggestions(suggestions);
    writeTextFile(outFile, yaml);
    console.log(`Wrote ${suggestions.length} suggestion(s) to ${outFile}`);
    console.log('  Review the rules, test them, then register in rules/index.yaml.');
    return 0;
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
}

/* ----------------------------------------------------------------- evolve -- */
