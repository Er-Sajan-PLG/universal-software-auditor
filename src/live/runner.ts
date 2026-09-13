/**
 * Live session runner — drives the deterministic phases with optional LLM
 * turns behind an injectable `ChatFn`.
 *
 * Doctrine: the engine verifies, the model only proposes. Without a
 * configured provider (`chat` undefined) every model turn prints a loud skip
 * line and the session continues deterministically — conversation is lost,
 * correctness never is. A throwing `chat` degrades the same way (loud line,
 * deterministic continuation), never a crash.
 *
 * Read-only seam: foundation builders and `runAudit` are imported, never
 * modified. Types for the LLM call come from `src/agent` only.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AuditReport } from '../types.js';
import type { MaturityProfile } from '../engine/maturity.js';
import type { ChatRequest } from '../agent/types.js';
import { runAudit } from '../engine/audit.js';
import { renderMarkdown } from '../report/markdown.js';
import {
  INTERVIEW_QUESTIONS,
  applyInterviewAnswer,
  formatQuestionPrompt,
  type InterviewQuestion,
} from '../foundation/interview.js';
import { defaultFoundation, type FoundationConfig } from '../foundation/types.js';
import { sanitizeIntent } from '../foundation/loader.js';
import { advance, initialSession, renderTranscript } from './session.js';
import type { AskFn, ChatFn, PrintFn, SessionState, TranscriptEntry } from './types.js';

export type { AskFn, ChatFn, PrintFn } from './types.js';
export type { ChatRequest };

/** Loud marker printed whenever a model turn is skipped (deterministic-only). */
export const DETERMINISTIC_SKIP_PREFIX = 'LLM skipped (deterministic-only mode)';

export interface LiveSessionOptions {
  dir: string;
  ask: AskFn;
  print: PrintFn;
  chat?: ChatFn;
  transcriptPath?: string;
  provider?: string;
  model?: string;
}

interface LiveContext {
  state: SessionState;
  report?: AuditReport;
  profile?: MaturityProfile;
}

const SYSTEM_PROMPT = 'You are the USA live audit assistant. Propose, never decide.';

/** Triage walks at most this many UNKNOWN findings; the rest stay queued. */
const TRIAGE_CAP = 50;

/**
 * Runs foundation → audit → triage → report → done.
 * Exit codes mirror the CLI gate convention: 0 done, 2 broken input.
 */
export async function runLiveSession(opts: LiveSessionOptions): Promise<number> {
  const dir = path.resolve(opts.dir);
  if (!isUsableDir(dir)) {
    opts.print(`live: target not found or not a directory: ${opts.dir}`);
    return 2;
  }
  const ctx: LiveContext = { state: initialSession() };
  let code = 0;
  try {
    await runFoundationStep(opts, ctx);
    await runAuditStep(opts, ctx);
    await runTriageStep(opts, ctx);
    await runReportStep(opts, ctx);
    ctx.state = advance(ctx.state, 'done');
    opts.print('Live session complete.');
  } catch (err) {
    opts.print(`live: ${(err as Error).message}`);
    code = 2;
  }
  if (opts.transcriptPath) code = writeTranscript(opts, ctx, code);
  return code;
}

function isUsableDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Transcript is the artifact: always written at the end when requested. */
function writeTranscript(opts: LiveSessionOptions, ctx: LiveContext, code: number): number {
  try {
    const file = path.resolve(opts.transcriptPath as string);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderTranscript(ctx.state), 'utf8');
    opts.print(`Transcript written to ${opts.transcriptPath}.`);
    return code;
  } catch (err) {
    opts.print(`live: cannot write transcript: ${(err as Error).message}`);
    return 2;
  }
}

function appendTool(ctx: LiveContext, text: string): void {
  const entry: TranscriptEntry = { phase: ctx.state.phase, kind: 'tool', text };
  ctx.state = { ...ctx.state, transcript: [...ctx.state.transcript, entry] };
}

/* --------------------------------------------------------------- model -- */

async function modelTurn(
  opts: LiveSessionOptions,
  ctx: LiveContext,
  tag: string,
  user: string,
): Promise<void> {
  if (!opts.chat) {
    const line =
      `${DETERMINISTIC_SKIP_PREFIX}: no provider configured — ` +
      `continuing without model input (${tag}).`;
    opts.print(line);
    appendTool(ctx, line);
    return;
  }
  const req: ChatRequest = {
    provider: opts.provider ?? 'usa-live',
    model: opts.model ?? 'usa-live',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
  };
  try {
    const res = await opts.chat(req);
    opts.print(res.text);
    const entry: TranscriptEntry = { phase: ctx.state.phase, kind: 'model', text: res.text };
    ctx.state = { ...ctx.state, transcript: [...ctx.state.transcript, entry] };
  } catch (err) {
    const line = `LLM unavailable (${(err as Error).message}) — continuing deterministically (${tag}).`;
    opts.print(line);
    appendTool(ctx, line);
  }
}

/* ---------------------------------------------------------- foundation -- */

async function runFoundationStep(opts: LiveSessionOptions, ctx: LiveContext): Promise<void> {
  ctx.state = advance(ctx.state, 'foundation');
  opts.print('Foundation: capturing project intent (empty answers keep defaults).');
  let config = defaultFoundation(path.basename(path.resolve(opts.dir)) || 'project');
  for (const question of INTERVIEW_QUESTIONS) {
    const raw = await opts.ask(formatQuestionPrompt(question, config));
    if (raw === null) {
      opts.print('(EOF — keeping defaults for the remaining questions.)');
      break;
    }
    config = await applyWithRetries(opts, question, config, raw);
  }
  const facts = intentFacts(config);
  ctx.state = { ...ctx.state, facts: [...ctx.state.facts, ...facts] };
  const summary = `Foundation captured: ${facts.length > 0 ? facts.join(', ') : '(no usable intents)'}.`;
  opts.print(summary);
  appendTool(ctx, summary);
  await modelTurn(opts, ctx, 'foundation', `[foundation] facts: ${facts.join(', ') || '(none)'}.`);
}

/** Intent entries that sanitize become `intent:<value>` facts; the rest assert nothing. */
function intentFacts(config: FoundationConfig): string[] {
  const facts: string[] = [];
  for (const intent of config.project.intents) {
    const flag = sanitizeIntent(intent);
    if (flag !== undefined) facts.push(flag);
  }
  return facts;
}

/** Invalid answers re-prompt (bounded); then the default stands, loudly. */
async function applyWithRetries(
  opts: LiveSessionOptions,
  question: InterviewQuestion,
  config: FoundationConfig,
  firstRaw: string,
): Promise<FoundationConfig> {
  let raw = firstRaw;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return applyInterviewAnswer(config, question.id, raw);
    } catch (err) {
      opts.print((err as Error).message);
    }
    const retry = await opts.ask(formatQuestionPrompt(question, config));
    if (retry === null) return config;
    raw = retry;
  }
  opts.print(`Keeping the default for ${question.id} after repeated invalid answers.`);
  return config;
}

/* --------------------------------------------------------------- audit -- */

async function runAuditStep(opts: LiveSessionOptions, ctx: LiveContext): Promise<void> {
  ctx.state = advance(ctx.state, 'audit');
  const { report, warnings, profile } = runAudit({ target: path.resolve(opts.dir) });
  for (const warning of warnings) opts.print(`warning: ${warning}`);
  ctx.report = report;
  ctx.profile = profile;
  const summary = auditSummary(report);
  opts.print(summary);
  appendTool(ctx, summary);
  await modelTurn(opts, ctx, 'audit', `[audit] ${summary}`);
}

function auditSummary(report: AuditReport): string {
  const unknown = report.score.counts.UNKNOWN ?? 0;
  return (
    `Audit: ${report.score.overall}/100 — ${report.findings.length} finding(s), ` +
    `${unknown} to review (${report.score.automationCoverage}% verified automatically).`
  );
}

/* -------------------------------------------------------------- triage -- */

async function runTriageStep(opts: LiveSessionOptions, ctx: LiveContext): Promise<void> {
  ctx.state = advance(ctx.state, 'next');
  const report = ctx.report as AuditReport;
  const unknowns = report.findings.filter((f) => f.status === 'UNKNOWN');
  const capped = unknowns.slice(0, TRIAGE_CAP);
  let recorded = 0;
  for (const finding of capped) {
    const raw = await opts.ask(
      `Evidence for ${finding.ruleId} (${finding.title}) — file:line or empty to skip: `,
    );
    const answer = (raw ?? '').trim();
    if (answer === '') continue;
    recorded++;
    const entry: TranscriptEntry = {
      phase: ctx.state.phase,
      kind: 'decision',
      text: `${finding.ruleId}: ${answer}`,
    };
    ctx.state = {
      ...ctx.state,
      transcript: [...ctx.state.transcript, entry],
      facts: [...ctx.state.facts, `${finding.ruleId}@${answer}`],
    };
  }
  if (unknowns.length > capped.length) {
    appendTool(
      ctx,
      `${unknowns.length - capped.length} finding(s) left queued (triage cap ${TRIAGE_CAP}).`,
    );
  }
  const summary = `Triage: ${recorded} evidence note(s) recorded over ${capped.length} finding(s) walked.`;
  opts.print(summary);
  appendTool(ctx, summary);
  await modelTurn(opts, ctx, 'triage', `[triage] recorded ${recorded} evidence note(s).`);
}

/* -------------------------------------------------------------- report -- */

async function runReportStep(opts: LiveSessionOptions, ctx: LiveContext): Promise<void> {
  ctx.state = advance(ctx.state, 'next');
  const report = ctx.report as AuditReport;
  const profile = ctx.profile as MaturityProfile;
  const markdown = renderMarkdown(report, profile);
  const summary =
    `Report rendered (${markdown.length} chars): ` +
    `${report.score.overall}/100, ${report.findings.length} finding(s).`;
  opts.print(summary);
  appendTool(ctx, summary);
  await modelTurn(opts, ctx, 'report', `[report] score ${report.score.overall}/100.`);
}
