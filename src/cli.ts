#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AuditReport, Depth, Maturity, Rule, Severity } from './types.js';
import { runAudit } from './engine/audit.js';
import { loadRulePacks, loadPackFile } from './engine/loader.js';
import { loadDetectorFile } from './detect/index.js';
import { Project } from './util/project.js';
import { writeTextFile } from './util/files.js';
import { loadEnvFile } from './util/env.js';
import { detect } from './detect/index.js';
import { renderMarkdown, parseTrailer } from './report/markdown.js';
import {
  parseDetachedSignature,
  verifyDetachedSignature,
  type DetachedSignature,
} from './report/signature.js';
import { renderJson } from './report/json.js';
import { renderSarif } from './report/sarif.js';
import { renderNarrative } from './report/narrative.js';
import type { MaturityProfile } from './engine/maturity.js';
import { diffReports } from './engine/diff.js';
import { bootstrapPacks, writeBootstrapPacks } from './bootstrap/index.js';
import { EXAMPLE_CONFIG, loadConfig } from './config.js';
import { evaluateGate, evaluateNewCodeGate, parseBaselineTrailer } from './engine/gate.js';
import { learnFromReport, renderSuggestions, type LearnOptions } from './learn/index.js';
import { Store } from './store/index.js';
import { runEvolutionCycle, type EvolutionCycleOutput } from './evolution/run.js';
import { capabilityFromPack } from './evolution/capability.js';
import { ruleAutomatability } from './engine/automatability.js';
import { catalogueCoverage, catalogueOf, loadCatalogues } from './engine/catalogues.js';
import { categoryCoverage, loadCategories } from './engine/categories.js';
import { createStdinAsk, runFoundationInit, runFoundationShow } from './foundation/interview.js';
import { checkModelAdvertised, runLiveSession, type ChatFn } from './live/runner.js';
import { complete, listModels, loadProviderConfig } from './agent/index.js';
import type { Catalogue } from './engine/catalogues.js';
import type { QueueSummary } from './evolution/queue.js';
import type {
  BenchmarkCase,
  CandidateCapability,
  CapabilityGap,
  CoverageModel,
} from './evolution/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RULES_DIR = path.resolve(HERE, '..', 'rules');
const VERSION = readVersion();

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'FUTURE'];
const DEPTHS: Depth[] = ['quick', 'standard', 'deep'];
const MATURITIES: Maturity[] = ['prototype', 'mvp', 'beta', 'production', 'legacy'];

/* ------------------------------------------------------------------- args -- */

interface Args {
  _: string[];
  [k: string]: string | boolean | string[] | undefined;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (!tok.startsWith('--')) {
      args._.push(tok);
      continue;
    }
    const body = tok.slice(2);
    if (body.includes('=')) {
      const [k, ...rest] = body.split('=');
      args[k!] = rest.join('=');
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[body] = true;
    } else {
      args[body] = next;
      i++;
    }
  }
  return args;
}

function str(args: Args, key: string, fallback?: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : fallback;
}
function bool(args: Args, key: string): boolean {
  return args[key] === true || args[key] === 'true';
}

/**
 * CLI-003: every command that writes files honors --dry-run. Call after pure
 * argument validation with the resolved paths that WOULD be written: it
 * prints one line per path and returns false, and the caller exits 0 before
 * doing any work — no audit run, no model calls, no disk writes. With an
 * empty list it says so explicitly rather than silently succeeding.
 */
function dryRunWrites(args: Args, files: string[]): boolean {
  if (!bool(args, 'dry-run')) return true;
  if (files.length === 0) {
    console.log('dry-run: nothing would be written');
    return false;
  }
  for (const f of files) console.log(`dry-run: would write ${path.resolve(f)}`);
  return false;
}
function list(args: Args, key: string): string[] {
  const v = args[key];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string')
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

/* -------------------------------------------------------------------- main -- */

const COMMANDS: Record<string, (args: Args) => number | Promise<number>> = {
  audit: cmdAudit,
  detect: cmdDetect,
  rules: cmdRules,
  explain: cmdExplain,
  diff: cmdDiff,
  'verify-report': cmdVerifyReport,
  init: cmdInit,
  bootstrap: cmdBootstrap,
  learn: cmdLearn,
  evolve: cmdEvolve,
  standards: cmdStandards,
  foundation: cmdFoundation,
  categories: cmdCategories,
  live: cmdLive,
  models: cmdModels,
};

/** Global --help/--version, resolved before dispatch. Returns null to continue. */
function handleTopLevelFlags(args: Args, cmd: string): number | Promise<number> | null {
  if (bool(args, 'help')) {
    // A subcommand's own help wins over the top-level text — `usa live --help`
    // used to print the generic help, orphaning LIVE_HELP_TEXT entirely.
    if (cmd === 'live') return cmdLive(args);
    console.log(HELP);
    return 0;
  }
  if (bool(args, 'version')) {
    console.log(`usa ${VERSION}`);
    return 0;
  }
  return null;
}

export function main(argv: string[]): number | Promise<number> {
  // `.env` sits beside the invocation (never committed — see .gitignore), so
  // provider keys work without exporting them into every shell first. The real
  // environment always wins; this only fills gaps. No values are ever logged.
  loadEnvFile(process.cwd());
  const args = parseArgs(argv);
  const cmd = (args._[0] ?? 'audit') as string;
  const handled = handleTopLevelFlags(args, cmd);
  if (handled !== null) return handled;

  const run = COMMANDS[cmd];
  if (run) return run(args);
  switch (cmd) {
    case 'version':
    case '--version':
      console.log(`usa ${VERSION}`);
      return 0;
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.error(HELP);
      return 2;
  }
}

/* ------------------------------------------------------------------ audit -- */

type OutputFormat = 'md' | 'json' | 'sarif' | 'narrative';

const FORMATS: OutputFormat[] = ['md', 'json', 'sarif', 'narrative'];

interface AuditCliOptions {
  target: string;
  rulesDir: string;
  depth: Depth;
  profileArg: string;
  out: string;
  format: OutputFormat;
  failOn: string;
  baseline?: string;
  quiet: boolean;
  maxFiles?: number;
  maxBytes?: number;
}

/** Resolves the report format from an explicit flag, else the --out suffix. */
function resolveFormat(flag: string | undefined, out: string): OutputFormat {
  if (flag) return flag.toLowerCase() as OutputFormat;
  const ext = path.extname(out).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.sarif') return 'sarif';
  return 'md';
}

function parseCountFlag(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function readAuditOptions(args: Args): AuditCliOptions {
  const out = str(args, 'out', 'AUDIT.md') ?? 'AUDIT.md';
  return {
    target: (args._[1] as string | undefined) ?? '.',
    rulesDir: path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR),
    depth: (str(args, 'depth', 'standard') as Depth) ?? 'standard',
    profileArg: str(args, 'profile', 'auto') ?? 'auto',
    out,
    format: resolveFormat(str(args, 'format'), out),
    failOn: (str(args, 'fail-on', 'none') ?? 'none').toLowerCase(),
    baseline: str(args, 'baseline'),
    quiet: bool(args, 'quiet'),
    maxFiles: parseCountFlag(str(args, 'max-files')),
    maxBytes: parseCountFlag(str(args, 'max-bytes')),
  };
}

function validateAuditOptions(o: AuditCliOptions): string | null {
  if (!DEPTHS.includes(o.depth)) return `--depth must be one of ${DEPTHS.join('|')}`;
  if (o.profileArg !== 'auto' && !MATURITIES.includes(o.profileArg as Maturity)) {
    return `--profile must be auto or one of ${MATURITIES.join('|')}`;
  }
  if (!FORMATS.includes(o.format)) return `--format must be one of ${FORMATS.join('|')}`;
  if (o.maxFiles !== undefined && !(o.maxFiles > 0)) return '--max-files must be a positive number';
  if (o.maxBytes !== undefined && !(o.maxBytes > 0)) return '--max-bytes must be a positive number';
  return null;
}

function cmdAudit(args: Args): number {
  const o = readAuditOptions(args);
  const invalid = validateAuditOptions(o);
  if (invalid) {
    console.error(invalid);
    return 2;
  }

  if (!fs.existsSync(o.target)) {
    console.error(`Target path does not exist: ${o.target}`);
    return 2;
  }

  // CLI-003: preview the write before the (expensive) audit runs.
  if (!dryRunWrites(args, [o.out])) return 0;

  let config;
  try {
    config = loadConfig(o.target, str(args, 'config'));
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
  if (config.facts) config.facts = [...config.facts, ...list(args, 'fact')];

  const { report, warnings, profile } = runAudit({
    target: o.target,
    rulesDir: o.rulesDir,
    depth: o.depth,
    profile: o.profileArg as Maturity | 'auto',
    config,
    allowCommands: bool(args, 'allow-commands'),
    usaVersion: VERSION,
    includePacks: list(args, 'include'),
    excludePacks: list(args, 'exclude'),
    maxFiles: o.maxFiles,
    maxBytes: o.maxBytes,
  });

  for (const w of warnings) console.error(`warning: ${w}`);

  const rendered = renderReport(report, profile, o.format);
  try {
    writeTextFile(o.out, rendered);
  } catch (err) {
    // CLI-004: an unwritable --out is a usage error (exit 2), not a crash.
    console.error((err as Error).message);
    return 2;
  }

  if (!o.quiet) {
    console.log(summaryLine(report));
    console.log(`  report → ${o.out}`);
  }

  // Without --baseline the absolute gate below is byte-identical to before:
  // same function, same arguments, same exit codes.
  if (!o.baseline) return evaluateGate(report, o.failOn, o.quiet);
  return runBaselineGate(report, o.baseline, o.failOn, o.quiet, args);
}

/**
 * New-code gate: fail only on findings this change introduced or regressed,
 * compared against a previous report's trailer. Every baseline failure mode
 * exits 2 loudly — a gate that cannot read its baseline must never pass.
 */
function runBaselineGate(
  report: AuditReport,
  baselinePath: string,
  failOn: string,
  quiet: boolean,
  args: Args,
): number {
  let text: string;
  try {
    text = fs.readFileSync(baselinePath, 'utf8');
  } catch {
    console.error(`--baseline file not found or unreadable: ${baselinePath}`);
    return 2;
  }
  // Tolerate a raw YAML trailer file, mirroring `usa diff`.
  const trailerYaml = parseTrailer(text) ?? text;
  if (!trailerYaml.trim()) {
    console.error(`--baseline has no report trailer and no YAML content: ${baselinePath}`);
    return 2;
  }
  try {
    const baseline = parseBaselineTrailer(trailerYaml);
    // An explicit --fail-on (even none) wins; otherwise the new-code gate
    // defaults to HIGH so legacy MEDIUM/LOW debt never blocks adoption.
    const threshold =
      failOn === 'none' && args['baseline'] !== undefined && args['fail-on'] === undefined
        ? 'high'
        : failOn;
    return evaluateNewCodeGate(report, baseline, threshold, quiet);
  } catch (err) {
    console.error(`--baseline is malformed (${baselinePath}): ${(err as Error).message}`);
    return 2;
  }
}

function renderReport(report: AuditReport, profile: MaturityProfile, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return renderJson(report);
    case 'sarif':
      return renderSarif(report);
    case 'narrative':
      return renderNarrative(report, profile);
    default:
      return renderMarkdown(report, profile);
  }
}

function summaryLine(report: AuditReport): string {
  const s = report.score.severityCounts;
  const parts = SEVERITY_ORDER.filter((k) => s[k] > 0)
    .map((k) => `${k.toLowerCase()} ${s[k]}`)
    .join(' · ');
  return (
    `usa ${report.score.overall}/100 (${report.detection.maturity}) — ` +
    `${report.score.counts.PASS} passed, ` +
    (parts ? `open: ${parts}` : 'no open findings') +
    `, ${report.score.counts.UNKNOWN} to review` +
    ` (${report.score.automationCoverage}% verified automatically)`
  );
}

/* ----------------------------------------------------------------- detect -- */

function cmdDetect(args: Args): number {
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

function cmdRules(args: Args): number {
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

function cmdExplain(args: Args): number {
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

function cmdStandards(args: Args): number {
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
function cmdCategories(args: Args): number {
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

/* ------------------------------------------------------------ foundation -- */

function cmdFoundation(args: Args): number {
  const sub = args._[1] as string | undefined;
  const dir = str(args, 'dir') ?? (args._[2] as string | undefined) ?? '.';
  if (sub === 'init') {
    return runFoundationInit({
      dir,
      nonInteractive: bool(args, 'non-interactive'),
      dryRun: bool(args, 'dry-run'),
    });
  }
  if (sub === 'show' || sub === undefined) {
    return runFoundationShow({ dir });
  }
  console.error(
    'Usage: usa foundation <init|show> [path] [--dir <path>] [--non-interactive] [--dry-run]',
  );
  return 2;
}

/* ------------------------------------------------------------------ live -- */

/**
 * `usa live`: conversational audit session (foundation → audit → triage →
 * report). The default chat is the agent layer's `complete()`; without a
 * configured provider the session runs deterministically (loud skips, no
 * model calls). Async only because the LLM transport is async — every
 * deterministic step stays synchronous underneath.
 */
async function cmdLive(args: Args): Promise<number> {
  if (bool(args, 'help')) {
    console.log(LIVE_HELP_TEXT);
    return 0;
  }
  const dir = (args._[1] as string | undefined) ?? '.';
  const providerId =
    str(args, 'provider') ?? process.env['USA_PROVIDER'] ?? process.env['USA_LIVE_PROVIDER'];
  const modelOpt = str(args, 'model') ?? process.env['USA_MODEL'];
  const transcriptPath = str(args, 'transcript');
  const triageLimit = parseTriageLimit(str(args, 'triage-limit'));
  if (triageLimit === null) {
    console.error('--triage-limit must be a positive number');
    return 2;
  }
  // CLI-003: preview before any provider call or prompting.
  if (!dryRunWrites(args, transcriptPath ? [transcriptPath] : [])) return 0;
  const chat = await resolveLiveChatOrAnnounce(providerId, modelOpt);
  return runLiveSession({
    dir,
    ask: createStdinAsk(),
    print: (line: string) => console.log(line),
    chat,
    transcriptPath,
    provider: providerId,
    model: modelOpt,
    triageLimit: triageLimit ?? undefined,
  });
}

/**
 * Resolve the session chat, announcing deterministic-only mode when no
 * provider is configured. The pre-flight warns once up front about
 * unadvertised model ids (the classic mid-session 404); the call itself
 * stays authoritative.
 */
async function resolveLiveChatOrAnnounce(
  providerId: string | undefined,
  modelOpt: string | undefined,
): Promise<ChatFn | undefined> {
  if (providerId) return resolveLiveChat(providerId, modelOpt);
  console.log(
    'live: no provider configured (set --provider or USA_PROVIDER) — deterministic-only mode.',
  );
  return undefined;
}

/**
 * Resolve the session chat, or undefined for deterministic-only mode. The
 * pre-flight warns once up front about unadvertised model ids (the classic
 * mid-session 404); the call itself stays authoritative.
 */
async function resolveLiveChat(
  providerId: string,
  modelOpt: string | undefined,
): Promise<ChatFn | undefined> {
  try {
    const cfg = loadProviderConfig(
      providerId,
      modelOpt === undefined ? undefined : { model: modelOpt },
    );
    const provider = providerId;
    const model = modelOpt;
    const admonition = await checkModelAdvertised(providerId, cfg.model, listModels);
    if (admonition) console.error(admonition);
    return (req) => complete({ ...req, provider, ...(model === undefined ? {} : { model }) });
  } catch {
    // Deliberately a STATIC message: provider failures name key material
    // (env vars, endpoints) and even the provider id is env-derived, so a
    // transcript-adjacent CLI interpolates nothing here — neither the
    // error nor the id. The user just typed it; they know which one failed.
    console.error(
      'live: LLM provider unavailable (check its API key) — continuing in deterministic-only mode.',
    );
    return undefined;
  }
}

/** Positive integer, or null when the flag value is unusable. */
function parseTriageLimit(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * `usa models`: what the provider actually serves, so a model id can be
 * checked before a session burns calls on a 404. Read-only and side-effect
 * free beyond one GET.
 */
async function cmdModels(args: Args): Promise<number> {
  if (bool(args, 'help')) {
    console.log(MODELS_HELP_TEXT);
    return 0;
  }
  const providerId = str(args, 'provider') ?? process.env['USA_PROVIDER'];
  if (!providerId) {
    console.error('Usage: usa models --provider <id> (or set USA_PROVIDER)');
    return 2;
  }
  let names: string[];
  try {
    // Validates the key and resolves static defaults first — same fail-closed
    // contract as the session; the static message policy applies here too.
    loadProviderConfig(providerId);
    names = (await listModels(providerId)).map((m) => m.name);
  } catch {
    console.error('live: LLM provider unavailable (check its API key).');
    return 2;
  }
  for (const name of names) console.log(name);
  return 0;
}

const MODELS_HELP_TEXT = `
usa models — list models a provider advertises

  usa models --provider ID

  Prints one model id per line (live listing, static default on fallback).
  Use it to check a model id exists before a session spends calls on a 404.
`.trim();

const LIVE_HELP_TEXT = `
usa live — conversational audit session

  usa live [path] [--provider ID] [--model M] [--transcript FILE] [--triage-limit N] [--dry-run]

  Walks foundation → audit → triage → report with you. The deterministic
  engine verifies; the model only proposes. Without a provider the session
  runs deterministically (model turns are skipped loudly, never faked).

  --provider <id>     LLM provider preset (default $USA_PROVIDER, else deterministic-only)
  --model <m>         Model id (default preset default or $USA_MODEL)
  --transcript <file> Write the session transcript to this file
  --triage-limit <n>  Max findings to walk in triage (default 15, ceiling 50)
  --dry-run           Print the transcript path that would be written and exit
`.trim();

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

function cmdDiff(args: Args): number {
  const beforePath = args._[1] as string | undefined;
  const afterPath = args._[2] as string | undefined;
  if (!beforePath || !afterPath) {
    console.error('Usage: usa diff <before.md> <after.md> [--out DIFF.md] [--dry-run]');
    return 2;
  }
  // CLI-003: preview before reading or comparing anything.
  const diffOut = str(args, 'out');
  if (!dryRunWrites(args, diffOut ? [diffOut] : [])) return 0;
  const readTrailer = (file: string) => {
    const text = fs.readFileSync(file, 'utf8');
    return parseTrailer(text) ?? text; // tolerate a raw YAML trailer file
  };
  try {
    const md = diffReports(readTrailer(beforePath), readTrailer(afterPath));
    if (diffOut) writeTextFile(diffOut, md);
    console.log(md);
    return 0;
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
}

/* -------------------------------------------------------- verify-report -- */

/** Reads a text input, or reports it loudly and returns null (exit 2). */
function readTextInput(file: string, label: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    console.error(`${label} not found or unreadable: ${file}`);
    return null;
  }
}

function cmdVerifyReport(args: Args): number {
  const reportPath = args._[1] as string | undefined;
  const bundlePath = str(args, 'bundle');
  if (!reportPath || !bundlePath) {
    console.error(
      'Usage: usa verify-report <AUDIT.md> --bundle <sidecar.sig.json> [--key <pubkey>] [--cosign-binary <path>] [--quiet]',
    );
    return 2;
  }
  const markdown = readTextInput(reportPath, 'Report file');
  if (markdown === null) return 2;
  const sidecarRaw = readTextInput(bundlePath, 'Signature sidecar');
  if (sidecarRaw === null) return 2;
  const trailerYaml = parseTrailer(markdown);
  if (!trailerYaml || !trailerYaml.trim()) {
    console.error(`Report has no machine-readable trailer: ${reportPath}`);
    return 2;
  }
  let signature;
  try {
    signature = parseDetachedSignature(sidecarRaw);
  } catch (err) {
    console.error(`Signature sidecar is malformed (${bundlePath}): ${(err as Error).message}`);
    return 2;
  }
  // Payload bytes are exactly canonicalReportBytes(report) for the report
  // that rendered this trailer: the trailer projection plus '\n'. The CLI
  // only ever sees rendered bytes, so it reconstructs them from the parsed
  // trailer rather than re-deriving a report object.
  const payload = Buffer.from(`${trailerYaml}\n`, 'utf8');
  return runSignatureVerify(args, reportPath, payload, signature);
}

/**
 * Runs the cosign verification and maps the outcome onto the gate
 * convention: 0 verified, 1 mismatch/failed, 2 environment refusal (an
 * absent cosign binary throws — a loud error, never a fake pass).
 */
function runSignatureVerify(
  args: Args,
  reportPath: string,
  payload: Buffer,
  signature: DetachedSignature,
): number {
  const quiet = bool(args, 'quiet');
  const cosignBinary = str(args, 'cosign-binary');
  let result;
  try {
    result = verifyDetachedSignature(payload, signature, {
      publicKeyPath: str(args, 'key') ?? '',
      ...(cosignBinary === undefined ? {} : { cosignBinary }),
    });
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
  if (result.ok) {
    if (!quiet) console.log(`Signature verified: ${reportPath}`);
    return 0;
  }
  // Gate convention: the mismatch detail goes to stderr, suppressed by
  // --quiet; the exit code alone carries the verdict then.
  if (!quiet) console.error(`Signature verification failed for ${reportPath}: ${result.detail}`);
  return 1;
}

/* -------------------------------------------------------------- bootstrap -- */

function cmdBootstrap(args: Args): number {
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

function cmdInit(args: Args): number {
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

function cmdLearn(args: Args): number {
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

function cmdEvolve(args: Args): number {
  const target = (args._[1] as string | undefined) ?? '.';
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  if (!fs.existsSync(target)) {
    console.error(`Target path does not exist: ${target}`);
    return 2;
  }

  const storeDir = str(args, 'store');
  // CLI-003: preview before the cycle runs (or the store dir is created).
  if (!dryRunWrites(args, storeDir ? [path.join(storeDir, 'objects')] : [])) return 0;
  const store = storeDir ? new Store(storeDir) : undefined;

  const candidateCapability = loadEvolveCandidate(args);
  const cases = loadEvolveCases(args, candidateCapability);
  const learnReportPath = loadEvolveLearn(args);
  const proposeFromGaps = bool(args, 'propose') && !candidateCapability && !learnReportPath;
  const allGaps = bool(args, 'all-gaps');

  const result = runEvolutionCycle({
    target,
    rulesDir,
    engineVersion: VERSION,
    candidateCapability,
    benchmarkCases: cases,
    store,
    learnReportPath,
    learnMinSeverity: str(args, 'min-severity', 'MEDIUM') as
      'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'FUTURE',
    proposeFromGaps,
    allGaps,
    onUnproposable: (gap, reason) => {
      console.error(`warning: ${gap.id} not proposable (${reason})`);
    },
  });

  printEvolutionResult(result);
  return 0;
}

/** Resolve `--learn <report.md>` to an existing path, or undefined. */
function loadEvolveLearn(args: Args): string | undefined {
  const reportPath = str(args, 'learn');
  if (!reportPath) return undefined;
  if (!fs.existsSync(reportPath)) {
    console.error(`warning: learn report not found (${reportPath}) — ignoring --learn`);
    return undefined;
  }
  return reportPath;
}

function loadEvolveCandidate(args: Args) {
  const candidateFile = str(args, 'candidate');
  if (!candidateFile) return undefined;
  const { pack, warnings } = loadPackFile(candidateFile);
  for (const w of warnings) console.error(`warning: ${w}`);
  if (!pack) {
    console.error(`Could not load candidate pack: ${candidateFile}`);
    return undefined;
  }
  return capabilityFromPack(pack, { createdBy: 'cli' });
}

function loadEvolveCases(args: Args, candidateCapability: unknown): BenchmarkCase[] {
  const benchDir = str(args, 'bench-dir');
  const cases = benchDir ? loadBenchCases(benchDir) : [];
  if (candidateCapability && cases.length === 0) {
    console.error(
      'warning: no benchmark cases supplied (--bench-dir). The release decision will be vacuous.',
    );
  }
  return cases;
}

function loadBenchCases(dir: string): BenchmarkCase[] {
  if (!fs.existsSync(dir)) return [];
  const cases: BenchmarkCase[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as BenchmarkCase;
      if (raw && raw.id && Array.isArray(raw.expected) && raw.fixture) cases.push(raw);
    } catch {
      console.error(`warning: could not read benchmark case ${entry}`);
    }
  }
  return cases;
}

function printEvolutionResult(result: EvolutionCycleOutput): void {
  console.log(`# Evolution: ${result.snapshot.root}`);
  console.log();
  console.log(`snapshot        : ${result.snapshot.id}`);
  printCoverage('before', result.before.coverage);
  printGaps(result.before.gaps);

  if (!result.candidate) {
    console.log();
    if (result.proposed.length > 0) {
      console.log(`proposed        : ${result.proposed.length} candidate(s) (none benchmarked)`);
      printProposed(result.proposed);
    } else {
      console.log('No candidate capability supplied (--candidate <pack.yaml>).');
      console.log('This was the deterministic BEFORE half of the loop only.');
      console.log('Pass --propose to auto-propose a candidate from the gaps.');
    }
    printQueue(result.queue);
    printSchedule(result.schedule);
    return;
  }

  const release = result.candidate.release;
  console.log();
  console.log(
    `candidate       : ${result.candidate.capabilityId} (gaps: ${result.candidate.gapIds.join(', ')})`,
  );
  if (result.proposed.length > 0) printProposed(result.proposed);
  if (result.learnedSuggestions !== undefined) {
    console.log(`learned       : ${result.learnedSuggestions} suggestion(s) from report`);
  }
  if (release) {
    console.log(`release decision: ${release.decision}`);
    console.log(
      `  precision ${release.precision.toFixed(3)} · recall ${release.recall.toFixed(3)} · regressions ${release.regressions}`,
    );
    for (const r of release.reasons) console.log(`  - ${r}`);
  }

  if (result.after) {
    console.log();
    printCoverage('after', result.after.coverage);
    const d = result.after.delta;
    console.log(
      `delta           : coverage +${d.coverageDelta}pt · ${d.findingsAdded.length} finding(s) added · gap reduced: ${d.gapReduced}`,
    );
    if (d.findingsAdded.length) console.log(`  new findings: ${d.findingsAdded.join(', ')}`);
  }

  if (result.queue) {
    console.log(
      `queue           : ${result.queue.open} open · ${result.queue.closed} closed · ${result.queue.total} total`,
    );
  }
  printSchedule(result.schedule);
}

function printSchedule(schedule: EvolutionCycleOutput['schedule']): void {
  if (!schedule) return;
  for (const c of schedule.candidates) {
    const blocked = c.blockedReason ? ` · blocked: ${c.blockedReason}` : '';
    console.log(
      `schedule        : ${c.capabilityId} → ${c.outcome} ` +
        `(precision ${c.release.precision.toFixed(3)} · recall ${c.release.recall.toFixed(3)} · ` +
        `regressions ${c.release.regressions}, closed: ${c.closedGapIds.length} gap(s))${blocked}`,
    );
  }
  console.log(
    `schedule        : ${schedule.attempted} attempted · ${schedule.released} released · ${schedule.rejected} rejected`,
  );
}

function printQueue(queue: QueueSummary | undefined): void {
  if (!queue) return;
  console.log(
    `queue           : ${queue.open} open · ${queue.closed} closed · ${queue.total} total`,
  );
}

function printCoverage(label: string, cov: CoverageModel): void {
  console.log(
    `${label.padEnd(16)}: language coverage ${cov.languageCoverage}% · automation ${cov.automationCoverage}%`,
  );
  if (cov.unsupportedLanguages.length) {
    console.log(`  unsupported : ${cov.unsupportedLanguages.join(', ')}`);
  }
}

function printGaps(gaps: CapabilityGap[]): void {
  if (gaps.length === 0) {
    console.log('gaps           : none');
    return;
  }
  console.log(`gaps           : ${gaps.length}`);
  for (const g of gaps) console.log(`  - ${g.id} [${g.priority}] ${g.requiredCapability}`);
}

function printProposed(proposed: CandidateCapability[]): void {
  for (const c of proposed) {
    const langs = c.capability.languages?.join(', ') ?? 'unknown';
    const rules = c.capability.pack?.rules.length ?? 0;
    console.log(
      `  proposed      : ${c.id} (${rules} rule(s), langs: ${langs}) → gap ${c.gapIds.join(', ')} [${c.status}]`,
    );
  }
  console.log('  review required — proposals are unreviewed bootstrap packs, never registered.');
}

/* ------------------------------------------------------------------ utils -- */

function readVersion(): string {
  const candidates = [
    path.resolve(HERE, '..', 'package.json'),
    path.resolve(HERE, '..', '..', 'package.json'),
  ];
  for (const c of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(c, 'utf8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      /* fall through */
    }
  }
  return '0.0.0';
}

const HELP = `
usa — Universal Software Auditor

  usa audit [path]              Audit a project and write a Markdown report
  usa detect [path]             Print the auto-detected facts and maturity
  usa rules [--section S2]      List all loaded rule packs and rules
  usa explain <RULE-ID>         Show everything about one rule
  usa diff <before> <after>     Compare two previously generated reports
  usa verify-report <AUDIT.md>  Verify a report's detached signature sidecar
  usa init [path]               Scaffold .usa.yaml + a GitHub Actions workflow
  usa bootstrap [path]          Propose rule packs for stacks USA cannot audit yet
  usa learn <report.md>         Generate suggested rules from audit findings
  usa evolve [path]             Run the audit → gap → candidate → release loop
  usa standards                 Report catalogue coverage and automatability
  usa categories                Report future-domain category coverage
  usa foundation init [path]    Capture project intent into .usa/foundation.yaml
  usa foundation show [path]    Print the effective intent and asserted facts
  usa live [path]               Conversational audit session (deterministic without a provider)
  usa models --provider ID      List models the provider advertises

evolve options
  --dry-run            Print what would be written and exit (no cycle, no store writes)
  --store <dir>        Persist audit runs/results (content-addressed store)
  --candidate <file>   A candidate capability pack (YAML) to benchmark and release
  --propose            Auto-propose a candidate from the gaps (bootstrap catalog)
  --all-gaps           Evaluate every proposable candidate (one per open gap)
  --learn <report.md>  Propose a candidate from a report's open findings (usa learn)
  --min-severity <s>   Min severity for --learn (default MEDIUM)
  --bench-dir <dir>    Directory of benchmark case *.json files
  --rules-dir <dir>    Rule pack directory             (default bundled rules/)

learn options
  --dry-run           Print the output path that would be written and exit
  --out <file>        Output YAML file (default learn-suggestions.yaml)
  --min-severity <s>  Minimum severity to consider (CRITICAL|HIGH|MEDIUM|LOW|FUTURE, default MEDIUM)

standards options
  --format <fmt>      md | json                       (default md)
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)

categories options
  --format <fmt>      md | json                       (default md)
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)

foundation options
  --dir <path>        Project directory (default .; a positional path works too)
  --non-interactive   Write the defaults file without prompting (init only)
  --dry-run           Print the file that would be written and exit (init only)

live options
  --dry-run           Print the transcript path that would be written and exit
  --provider <id>     LLM provider preset (default $USA_PROVIDER, else deterministic-only)
  --model <m>         Model id (default preset default or $USA_MODEL)
  --transcript <file> Write the session transcript to this file
  --triage-limit <n>  Max findings to walk in triage (default 15, ceiling 50)

models options
  --provider <id>     LLM provider preset (or $USA_PROVIDER)

audit options
  --dry-run           Print the report path that would be written and exit
  --out <file>        Report path (default AUDIT.md)
  --format <fmt>      md | json | sarif | narrative (default: inferred from --out)
  --depth <level>     quick | standard | deep          (default standard)
  --profile <stage>   auto | prototype | mvp | beta | production | legacy
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)
  --config <file>     Explicit .usa.yaml location
  --include <packs>   Force these packs on (comma separated)
  --exclude <packs>   Force these packs off
  --fact <ns:value>   Assert a fact detection missed, e.g. --fact has:database
  --allow-commands    Run \`command:\` checks (shells out; off by default)
  --fail-on <sev>     Exit 1 on findings >= sev: critical|high|medium|low|none
  --baseline <file>   New-code gate: only fail on findings new or regressed
                      vs this previous report (default threshold high;
                      explicit --fail-on overrides it)
  --quiet             Only errors
  --max-files <n>     Index at most n files (overrides config; default 60000)
  --max-bytes <n>     Skip files larger than n bytes (overrides config; default 2 MiB)

bootstrap options
  --dry-run           Print the path that would be written and exit (with --out)
  --out <file|dir>    Write pack files instead of printing (default: print)

init options
  --dry-run           Print the files that would be scaffolded and exit

verify-report options
  --bundle <file>       Signature sidecar (required, e.g. AUDIT.md.sig.json)
  --key <file>          PEM public key the bundle is verified against
  --cosign-binary <bin> Override the cosign binary (default cosign)
  --quiet               Only errors

examples
  usa audit . --depth deep
  usa bootstrap ~/code/legacy-php-app --out /tmp/packs
  usa audit ../api --profile production --fail-on high
  usa audit . --baseline reports/2026-08.md --fail-on high
  usa audit . --out reports/audit-$(date +%F).md
  usa learn AUDIT.md --out swift-suggestions.yaml
  usa verify-report AUDIT.md --bundle AUDIT.md.sig.json --key cosign.pub
`.trim();

const WORKFLOW_TEMPLATE = `# USA — Universal Software Auditor
# Runs on every PR and pushes a Markdown summary you can read in the Actions UI.
name: USA Audit

on:
  pull_request:
  push:
    branches: [master]
  workflow_dispatch:
    inputs:
      depth:
        description: Audit depth
        required: false
        default: standard
        type: choice
        options: [quick, standard, deep]

permissions:
  contents: read
`;

// ---- main entry point ----
// Run only when this file is the entry point. Comparing `import.meta.url` to
// `file://${process.argv[1]}` breaks under npm's bin symlinks: argv[1] is the
// `.bin/usa` symlink while import.meta.url is the real dist/cli.js path, so
// the guard never matches and the CLI exits silently. Resolve argv[1] to its
// real path first (and guard the fs call so a non-file argv never throws).
function isEntryPoint(
  argv1: string | undefined = process.argv[1],
  thisUrl: string = import.meta.url,
): boolean {
  if (!argv1) return false;
  try {
    return thisUrl === pathToFileURL(fs.realpathSync(argv1)).href;
  } catch {
    return false;
  }
}

export { isEntryPoint };

if (isEntryPoint()) {
  const out = main(process.argv.slice(2));
  if (typeof out === 'number') {
    process.exit(out);
  } else {
    // Static text: an async rejection can carry provider internals (env var
    // names, endpoints, HTTP snippets) from the agent layer, and this sink
    // must never paraphrase them into logs — see the cmdLive catch above.
    // Only `live` runs async today, and it already reports its own failures.
    out.then(
      (code) => process.exit(code),
      () => {
        console.error('usa: async command failed unexpectedly (exit 2).');
        process.exit(2);
      },
    );
  }
}
