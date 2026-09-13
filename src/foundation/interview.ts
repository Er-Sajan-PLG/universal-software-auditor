/**
 * Foundation interview: pure question/answer builders plus a thin line-driven
 * driver for `usa foundation init`.
 *
 * Separation is the point: everything in the "builders" section is pure
 * (no readline, no fs, no console) so tests can drive the whole interview
 * without a terminal. The driver at the bottom only prints prompts, reads
 * lines through an injected `ask` function, and writes the file.
 *
 * Note on sync I/O: the CLI entrypoint is synchronous
 * (`process.exit(main(...))`), so the driver reads stdin with blocking
 * `fs.readSync` instead of `node:readline` (which is async-only and would be
 * truncated by `process.exit`). Piped stdin and TTYs both work.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  FOUNDATION_VERSION,
  INTENT_OPTIONS,
  STAGE_OPTIONS,
  defaultFoundation,
  type FoundationConfig,
} from './types.js';
import { foundationFile, parseFoundationYamlText, sanitizeIntent } from './loader.js';

/* ---------------------------------------------------------- pure builders -- */

export type QuestionKind = 'text' | 'multi-select' | 'select' | 'boolean' | 'number' | 'list';

export interface InterviewQuestion {
  id: string;
  prompt: string;
  kind: QuestionKind;
  options?: readonly string[];
  help?: string;
  /** Current value rendered for the `[default]` slot of the prompt. */
  read: (config: FoundationConfig) => string;
}

const boolRead =
  (get: (config: FoundationConfig) => boolean) =>
  (config: FoundationConfig): string =>
    get(config) ? 'yes' : 'no';

export const INTERVIEW_QUESTIONS: readonly InterviewQuestion[] = [
  {
    id: 'project.name',
    prompt: 'Project name',
    kind: 'text',
    read: (c) => c.project.name,
  },
  {
    id: 'project.vision',
    prompt: 'Vision (one or two sentences, free text)',
    kind: 'text',
    read: (c) => c.project.vision,
  },
  {
    id: 'project.intents',
    prompt: 'Intents (comma-separated)',
    kind: 'multi-select',
    options: INTENT_OPTIONS,
    help: `One or more of: ${INTENT_OPTIONS.join(', ')}. Each becomes an intent:<value> fact.`,
    read: (c) => c.project.intents.join(', '),
  },
  {
    id: 'stage',
    prompt: 'Stage target',
    kind: 'select',
    options: STAGE_OPTIONS,
    read: (c) => c.stage ?? '',
  },
  {
    id: 'pillars.docs.required',
    prompt: 'Required docs files (comma-separated)',
    kind: 'list',
    help: 'Files the docs pillar requires to exist, e.g. README.md, docs/ARCHITECTURE.md.',
    read: (c) => c.pillars.docs.required.join(', '),
  },
  {
    id: 'pillars.governance.codeOfConduct',
    prompt: 'Require a code of conduct?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.governance.codeOfConduct),
  },
  {
    id: 'pillars.governance.contributing',
    prompt: 'Require contributing guidance?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.governance.contributing),
  },
  {
    id: 'pillars.governance.securityPolicy',
    prompt: 'Require a security policy?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.governance.securityPolicy),
  },
  {
    id: 'pillars.governance.license',
    prompt: 'Require a license file?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.governance.license),
  },
  {
    id: 'pillars.ai.readable',
    prompt: 'AI posture: may assistants read this repo?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.ai.readable),
  },
  {
    id: 'pillars.ai.writable',
    prompt: 'AI posture: may assistants write to this repo?',
    kind: 'boolean',
    read: boolRead((c) => c.pillars.ai.writable),
  },
  {
    id: 'pillars.testing.dirs',
    prompt: 'Test directories (comma-separated)',
    kind: 'list',
    read: (c) => c.pillars.testing.dirs.join(', '),
  },
  {
    id: 'pillars.testing.minCoverage',
    prompt: 'Minimum coverage percent (0-100, empty clears)',
    kind: 'number',
    read: (c) =>
      c.pillars.testing.minCoverage === undefined ? '' : String(c.pillars.testing.minCoverage),
  },
  {
    id: 'pillars.environment.files',
    prompt: 'Environment files (comma-separated)',
    kind: 'list',
    help: 'Env exemplars contributors copy, e.g. .env.example.',
    read: (c) => c.pillars.environment.files.join(', '),
  },
  {
    id: 'pillars.pipelines.local',
    prompt: 'Local pipeline scripts (comma-separated package script names)',
    kind: 'list',
    read: (c) => c.pillars.pipelines.local.join(', '),
  },
  {
    id: 'pillars.pipelines.ci',
    prompt: 'CI workflow paths (comma-separated)',
    kind: 'list',
    read: (c) => c.pillars.pipelines.ci.join(', '),
  },
  {
    id: 'pillars.standards',
    prompt: 'Standards catalogues (comma-separated, empty for none)',
    kind: 'list',
    read: (c) => c.pillars.standards.join(', '),
  },
  {
    id: 'pillars.specs',
    prompt: 'Spec documents (comma-separated, empty for none)',
    kind: 'list',
    read: (c) => c.pillars.specs.join(', '),
  },
];

function clone(config: FoundationConfig): FoundationConfig {
  return JSON.parse(JSON.stringify(config)) as FoundationConfig;
}

function parseBool(raw: string, id: string): boolean {
  const v = raw.trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(v)) return true;
  if (['no', 'n', 'false', '0'].includes(v)) return false;
  throw new Error(`"${id}": expected yes/no, got ${JSON.stringify(raw)}`);
}

function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Applies one raw answer to a copy of `config` and returns it. An empty
 * answer keeps the current value. Unknown question ids and invalid values
 * throw (the driver catches per-question and re-prompts).
 */
export function applyInterviewAnswer(
  config: FoundationConfig,
  id: string,
  raw: string,
): FoundationConfig {
  const question = INTERVIEW_QUESTIONS.find((q) => q.id === id);
  if (!question) throw new Error(`unknown interview question: ${JSON.stringify(id)}`);
  if (raw.trim() === '') return clone(config);
  const next = clone(config);
  switch (question.kind) {
    case 'text': {
      setPath(next, id, raw.trim());
      return next;
    }
    case 'multi-select': {
      const values = splitList(raw).map((s) => s.toLowerCase());
      if (values.length === 0) return clone(config);
      const options = question.options ?? [];
      for (const v of values) {
        if (!options.includes(v)) {
          throw new Error(
            `"${id}": unknown value ${JSON.stringify(v)} (expected one of ${options.join(', ')})`,
          );
        }
      }
      setPath(next, id, values);
      return next;
    }
    case 'select': {
      const v = raw.trim().toLowerCase();
      const options = question.options ?? [];
      if (!options.includes(v)) {
        throw new Error(
          `"${id}": unknown value ${JSON.stringify(raw.trim())} (expected one of ${options.join(', ')})`,
        );
      }
      setPath(next, id, v);
      return next;
    }
    case 'boolean': {
      setPath(next, id, parseBool(raw, id));
      return next;
    }
    case 'number': {
      const n = Number(raw.trim());
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new Error(`"${id}": expected a number from 0 to 100, got ${JSON.stringify(raw)}`);
      }
      setPath(next, id, n);
      return next;
    }
    case 'list': {
      setPath(next, id, splitList(raw));
      return next;
    }
  }
}

function setPath(config: FoundationConfig, id: string, value: unknown): void {
  const p = config.pillars;
  switch (id) {
    case 'project.name':
      config.project.name = value as string;
      return;
    case 'project.vision':
      config.project.vision = value as string;
      return;
    case 'project.intents':
      config.project.intents = value as string[];
      return;
    case 'stage':
      config.stage = value as string;
      return;
    case 'pillars.docs.required':
      p.docs.required = value as string[];
      return;
    case 'pillars.governance.codeOfConduct':
      p.governance.codeOfConduct = value as boolean;
      return;
    case 'pillars.governance.contributing':
      p.governance.contributing = value as boolean;
      return;
    case 'pillars.governance.securityPolicy':
      p.governance.securityPolicy = value as boolean;
      return;
    case 'pillars.governance.license':
      p.governance.license = value as boolean;
      return;
    case 'pillars.ai.readable':
      p.ai.readable = value as boolean;
      return;
    case 'pillars.ai.writable':
      p.ai.writable = value as boolean;
      return;
    case 'pillars.testing.dirs':
      p.testing.dirs = value as string[];
      return;
    case 'pillars.testing.minCoverage':
      p.testing.minCoverage = value as number;
      return;
    case 'pillars.environment.files':
      p.environment.files = value as string[];
      return;
    case 'pillars.pipelines.local':
      p.pipelines.local = value as string[];
      return;
    case 'pillars.pipelines.ci':
      p.pipelines.ci = value as string[];
      return;
    case 'pillars.standards':
      p.standards = value as string[];
      return;
    case 'pillars.specs':
      p.specs = value as string[];
      return;
    default:
      throw new Error(`unknown interview question: ${JSON.stringify(id)}`);
  }
}

/**
 * Builds a FoundationConfig from a `{ [questionId]: rawAnswer }` map, in
 * question order, starting from defaults. Pure; throws on invalid values.
 */
export function foundationFromAnswers(
  answers: Record<string, string>,
  projectName = 'project',
): FoundationConfig {
  let config = defaultFoundation(projectName);
  for (const question of INTERVIEW_QUESTIONS) {
    const raw = answers[question.id];
    if (raw !== undefined) config = applyInterviewAnswer(config, question.id, raw);
  }
  return config;
}

/** Renders one prompt line, e.g. `Stage target [prototype]: `. Pure. */
export function formatQuestionPrompt(
  question: InterviewQuestion,
  config: FoundationConfig,
): string {
  const current = question.read(config);
  const options =
    question.kind === 'multi-select' || question.kind === 'select'
      ? ` (${question.options?.join('|')})`
      : '';
  const help = question.help ? `\n  ${question.help}` : '';
  return `${question.prompt}${options} [${current}]:${help}\n> `;
}

/* -------------------------------------------------------- commented YAML -- */

const BARE_RE = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/;

function yq(value: string): string {
  if (value === '') return '""';
  return BARE_RE.test(value) ? value : JSON.stringify(value);
}

function ylist(items: string[], indent: string): string {
  if (items.length === 0) return ' []';
  return `\n${items.map((item) => `${indent}  - ${yq(item)}`).join('\n')}`;
}

/**
 * Renders a commented foundation.yaml. Deterministic: fixed key order, fixed
 * comments. Round-trips through `parseFoundationYamlText`.
 */
export function renderFoundationYaml(config: FoundationConfig): string {
  const p = config.pillars;
  const lines = [
    '# USA foundation intent — what this project is and what it promises.',
    '# Deterministic input to readiness auditing: the coordinator turns',
    '# project.intents[] into intent:<value> facts. Hand-edit freely, but keep',
    '# it parseable — a broken file fails the audit loudly, never silently.',
    `version: ${FOUNDATION_VERSION}`,
    '',
    '# Who this project is for and what it wants to be.',
    'project:',
    `  name: ${yq(config.project.name)}`,
    `  vision: ${yq(config.project.vision)}`,
    `  # One or more of: ${INTENT_OPTIONS.join(', ')}.`,
    `  intents:${ylist(config.project.intents, '  ')}`,
    '',
    `# Stage target: ${STAGE_OPTIONS.join('|')}.`,
    config.stage === undefined ? '# stage: prototype' : `stage: ${yq(config.stage)}`,
    '',
    'pillars:',
    '  # Files the docs pillar requires to exist.',
    `  docs:\n    required:${ylist(p.docs.required, '    ')}`,
    '  # Governance files the project promises to keep.',
    '  governance:',
    `    codeOfConduct: ${p.governance.codeOfConduct}`,
    `    contributing: ${p.governance.contributing}`,
    `    securityPolicy: ${p.governance.securityPolicy}`,
    `    license: ${p.governance.license}`,
    '  # AI posture: may assistants read, and may they write?',
    '  ai:',
    `    readable: ${p.ai.readable}`,
    `    writable: ${p.ai.writable}`,
    '  # Where tests live and the coverage bar (0-100).',
    '  testing:',
    `    dirs:${ylist(p.testing.dirs, '    ')}`,
    `    minCoverage: ${p.testing.minCoverage === undefined ? 'null' : p.testing.minCoverage}`,
    '  # Env exemplars contributors copy.',
    `  environment:\n    files:${ylist(p.environment.files, '    ')}`,
    '  # Local package scripts and CI workflow paths.',
    '  pipelines:',
    `    local:${ylist(p.pipelines.local, '    ')}`,
    `    ci:${ylist(p.pipelines.ci, '    ')}`,
    '  # Standards catalogues and spec documents (empty when none).',
    `  standards:${ylist(p.standards, '  ')}`,
    `  specs:${ylist(p.specs, '  ')}`,
    '',
  ];
  return lines.join('\n');
}

/* --------------------------------------------------------------- summary -- */

/**
 * Human-readable rendering of the effective intent plus the exact facts it
 * would assert. Used by `usa foundation show`. Pure.
 */
export function summarizeFoundation(config: FoundationConfig): string {
  const p = config.pillars;
  const facts = config.project.intents
    .map((entry) => sanitizeIntent(entry))
    .filter((f): f is string => f !== undefined);
  const gov = (
    [
      ['code-of-conduct', p.governance.codeOfConduct],
      ['contributing', p.governance.contributing],
      ['security-policy', p.governance.securityPolicy],
      ['license', p.governance.license],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([name]) => name);
  const out = [
    `# Foundation: ${config.project.name || '(unnamed)'}`,
    `vision: ${config.project.vision || '(none)'}`,
    `stage: ${config.stage ?? '(none)'}`,
    `intents: ${config.project.intents.length ? config.project.intents.join(', ') : '(none)'}`,
    'facts this intent would assert:',
    ...(facts.length ? facts.map((f) => `  ${f}`) : ['  (none — no usable intents)']),
    'pillars:',
    `  docs.required: ${p.docs.required.length ? p.docs.required.join(', ') : '(none)'}`,
    `  governance: ${gov.length ? gov.join(', ') : '(none)'}`,
    `  ai: ${p.ai.readable ? 'readable' : 'not readable'}, ${p.ai.writable ? 'writable' : 'not writable'}`,
    `  testing: ${p.testing.dirs.length ? p.testing.dirs.join(', ') : '(none)'}${p.testing.minCoverage === undefined ? '' : ` @ >=${p.testing.minCoverage}%`}`,
    `  environment: ${p.environment.files.length ? p.environment.files.join(', ') : '(none)'}`,
    `  pipelines.local: ${p.pipelines.local.length ? p.pipelines.local.join(', ') : '(none)'}`,
    `  pipelines.ci: ${p.pipelines.ci.length ? p.pipelines.ci.join(', ') : '(none)'}`,
    `  standards: ${p.standards.length ? p.standards.join(', ') : '(none)'}`,
    `  specs: ${p.specs.length ? p.specs.join(', ') : '(none)'}`,
  ];
  return out.join('\n');
}

/* ---------------------------------------------------------------- driver -- */

export type AskFn = (prompt: string) => string | null;
export type PrintFn = (line: string) => void;

/**
 * Blocking stdin line reader (see module note). Returns one line without the
 * trailing newline, or null on EOF. The prompt is written as-is to stdout.
 */
export function createStdinAsk(
  fd = 0,
  write: (text: string) => void = (text) => process.stdout.write(text),
): AskFn {
  const one = Buffer.alloc(1);
  return (prompt: string): string | null => {
    write(prompt);
    const chunks: Buffer[] = [];
    for (;;) {
      let n: number;
      try {
        n = fs.readSync(fd, one, 0, 1, null);
      } catch {
        return null;
      }
      if (n === 0) return chunks.length === 0 ? null : Buffer.concat(chunks).toString('utf8');
      const byte = one[0];
      if (byte === 10) return Buffer.concat(chunks).toString('utf8');
      if (byte !== 13) chunks.push(Buffer.from([byte as number]));
    }
  };
}

export interface FoundationInitOptions {
  dir: string;
  nonInteractive: boolean;
  ask?: AskFn;
  print?: PrintFn;
  error?: PrintFn;
  projectName?: string;
}

export interface FoundationShowOptions {
  dir: string;
  print?: PrintFn;
  error?: PrintFn;
}

/** `usa foundation init`: interview (or defaults) → commented YAML. Sync. */
export function runFoundationInit(opts: FoundationInitOptions): number {
  const print = opts.print ?? ((line: string) => console.log(line));
  const error = opts.error ?? ((line: string) => console.error(line));
  const dir = path.resolve(opts.dir);
  const file = foundationFile(dir);
  try {
    if (fs.existsSync(file)) {
      error(`${file} already exists — leaving it alone.`);
      return 0;
    }
    const projectName = opts.projectName ?? path.basename(dir);
    let config = defaultFoundation(projectName);
    if (!opts.nonInteractive) {
      const ask = opts.ask ?? createStdinAsk();
      print(`Capturing foundation intent for ${projectName} (empty answers keep defaults).`);
      for (const question of INTERVIEW_QUESTIONS) {
        for (;;) {
          const raw = ask(formatQuestionPrompt(question, config));
          if (raw === null) {
            print('(EOF — keeping defaults for the remaining questions.)');
            break;
          }
          try {
            config = applyInterviewAnswer(config, question.id, raw);
            break;
          } catch (err) {
            error((err as Error).message);
          }
        }
      }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderFoundationYaml(config), 'utf8');
    print(`created ${file}`);
    return 0;
  } catch (err) {
    error((err as Error).message);
    return 2;
  }
}

/** `usa foundation show`: effective intent + asserted facts. Sync. */
export function runFoundationShow(opts: FoundationShowOptions): number {
  const print = opts.print ?? ((line: string) => console.log(line));
  const error = opts.error ?? ((line: string) => console.error(line));
  const file = foundationFile(path.resolve(opts.dir));
  if (!fs.existsSync(file)) {
    error(`no foundation file at ${file} — run \`usa foundation init\` first.`);
    return 1;
  }
  try {
    const config = parseFoundationYamlText(fs.readFileSync(file, 'utf8'), file);
    print(summarizeFoundation(config));
    return 0;
  } catch (err) {
    error((err as Error).message);
    return 2;
  }
}
