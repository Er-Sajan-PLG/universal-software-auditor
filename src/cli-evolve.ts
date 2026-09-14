import fs from 'node:fs';
import path from 'node:path';
import { Store } from './store/index.js';
import { runEvolutionCycle, type EvolutionCycleOutput } from './evolution/run.js';
import { loadPackFile } from './engine/loader.js';
import { capabilityFromPack } from './evolution/capability.js';
import type { QueueSummary } from './evolution/queue.js';
import type {
  BenchmarkCase,
  CandidateCapability,
  CapabilityGap,
  CoverageModel,
} from './evolution/types.js';
import { VERSION, DEFAULT_RULES_DIR, bool, dryRunWrites, str, type Args } from './cli-args.js';

/** The `evolve` loop driver: audit → gap → candidate → release, with reporting. */
/* ----------------------------------------------------------------- evolve -- */

export function cmdEvolve(args: Args): number {
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
