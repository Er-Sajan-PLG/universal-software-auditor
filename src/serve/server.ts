import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { runAudit } from '../engine/audit.js';
import { loadConfig } from '../config.js';
import { renderJson } from '../report/json.js';
import { renderMarkdown } from '../report/markdown.js';
import { renderHtml } from '../report/html.js';
import { DEPTHS, MATURITIES, DEFAULT_RULES_DIR, VERSION } from '../cli-args.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  createJobManager,
  loadPersisted,
  persistJob,
  prunePersisted,
  resolveTarget,
  type ServeJob,
} from './jobs.js';
import { uiPage } from './ui.js';

/**
 * `usa serve` HTTP layer (ADR-0039): loopback only, bearer-token auth on
 * every API route, targets contained in allow-roots, one audit at a time.
 *
 * CSRF note: browsers can only reach this server cross-origin with simple
 * requests, which cannot carry the Authorization header — and no CORS
 * headers are ever sent, so preflighted reads fail closed. There are no
 * cookies and no ambient authority; the token is the whole credential.
 */

const BODY_LIMIT_BYTES = 64 * 1024;
const FORMATS = ['json', 'html', 'md'] as const;

function sendJson(res: ServerResponse, code: number, obj: unknown): void {
  const body = `${JSON.stringify(obj)}\n`;
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

/** Constant-time bearer check. Length mismatch fails without throwing. */
export function checkAuth(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return false;
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const presented = Buffer.from(match[1] ?? '');
  const expected = Buffer.from(token);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > BODY_LIMIT_BYTES) {
        reject(new Error('request body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function renderJobReport(job: ServeJob): { contentType: string; body: string } {
  const format = job.options.format;
  if (!job.report || !job.profile) return { contentType: 'application/json', body: '{}' };
  if (format === 'html') {
    return { contentType: 'text/html; charset=utf-8', body: renderHtml(job.report, job.profile) };
  }
  if (format === 'md') {
    return {
      contentType: 'text/markdown; charset=utf-8',
      body: renderMarkdown(job.report, job.profile),
    };
  }
  return { contentType: 'application/json; charset=utf-8', body: renderJson(job.report) };
}

export interface ServeOptions {
  port: number;
  token: string;
  roots: string[];
  /** Injected for tests; production runs the real audit engine. */
  runner?: Parameters<typeof createJobManager>[0];
  /** Persist finished jobs here (ADR-0040); unset means memory only. */
  dataDir?: string;
  historyLimit?: number;
}

export async function startServer(opts: ServeOptions): Promise<{
  server: Server;
  port: number;
  token: string;
}> {
  const historyLimit = opts.historyLimit ?? 20;
  const dataDir = opts.dataDir === undefined ? undefined : path.resolve(opts.dataDir);
  if (dataDir !== undefined) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (err) {
      throw new Error(`serve: cannot create data dir ${dataDir}: ${(err as Error).message}`, {
        cause: err,
      });
    }
  }
  const hooks =
    dataDir === undefined
      ? {}
      : {
          onDone: (job: ServeJob) => {
            if (job.status === 'done' && job.report && job.profile) {
              job.rendered = renderJobReport(job);
            }
            persistJob(dataDir, job);
            prunePersisted(dataDir, historyLimit);
          },
        };
  const manager = createJobManager(
    opts.runner ??
      ((jobOptions, target) => {
        const config = loadConfig(target);
        const { report, profile } = runAudit({
          target,
          rulesDir: DEFAULT_RULES_DIR,
          depth: jobOptions.depth as 'quick' | 'standard' | 'deep',
          profile: jobOptions.profile as 'auto',
          config,
          allowCommands: false,
          usaVersion: VERSION,
        });
        return { report, profile };
      }),
    historyLimit,
    hooks,
  );
  if (dataDir !== undefined) manager.restore(loadPersisted(dataDir));
  type JobManager = ReturnType<typeof createJobManager>;
  const ctx: { manager: JobManager; token: string; roots: string[] } = {
    manager,
    token: opts.token,
    roots: opts.roots,
  };
  const server = createServer((req, res) => {
    handleRequest(req, res, ctx).catch((err: Error) => {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      console.error(`serve: request failed: ${err.message}`);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Loopback only — ADR-0039: remote exposure is a reverse proxy's job.
    // There is no flag to change this; serving remotely needs new code.
    server.listen(opts.port, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : opts.port;
  return { server, port, token: opts.token };
}

interface ValidBody {
  target: string;
  depth: string;
  profile: string;
  format: string;
}

function depthError(depth: unknown): string | null {
  if (typeof depth !== 'string' || !DEPTHS.includes(depth as 'quick')) {
    return `depth must be one of ${DEPTHS.join('|')}`;
  }
  return null;
}

function profileError(profile: unknown): string | null {
  if (
    typeof profile !== 'string' ||
    (profile !== 'auto' && !MATURITIES.includes(profile as 'beta'))
  ) {
    return 'profile must be auto or a maturity stage';
  }
  return null;
}

function formatError(format: unknown): string | null {
  if (typeof format !== 'string' || !(FORMATS as readonly string[]).includes(format)) {
    return `format must be one of ${FORMATS.join('|')}`;
  }
  return null;
}

function validateAuditBody(
  body: Record<string, unknown>,
): { error: string } | { options: ValidBody } {
  const target = body['target'];
  if (typeof target !== 'string' || target.length === 0) {
    return { error: 'target (string) is required' };
  }
  const depth = body['depth'] ?? 'standard';
  const profile = body['profile'] ?? 'auto';
  const format = body['format'] ?? 'json';
  for (const err of [depthError(depth), profileError(profile), formatError(format)]) {
    if (err) return { error: err };
  }
  return {
    options: {
      target,
      depth: depth as string,
      profile: profile as string,
      format: format as string,
    },
  };
}

async function handlePostAudits(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { manager: ReturnType<typeof createJobManager>; token: string; roots: string[] },
): Promise<void> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    sendJson(res, 413, { error: 'request body too large' });
    return;
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { error: 'request body must be JSON' });
    return;
  }
  const valid = validateAuditBody(body);
  if ('error' in valid) {
    sendJson(res, 400, { error: valid.error });
    return;
  }
  let resolved: string;
  try {
    resolved = resolveTarget(valid.options.target, ctx.roots);
  } catch (err) {
    const message = (err as Error).message;
    // Containment failures are authorization failures; a missing
    // path is a bad request. Different status, same static shape.
    sendJson(res, message.includes('escapes') ? 403 : 400, { error: message });
    return;
  }
  const submitted = ctx.manager.submit({ ...valid.options }, resolved);
  if ('conflict' in submitted) {
    sendJson(res, 409, { error: 'an audit is already running' });
    return;
  }
  sendJson(res, 202, { id: submitted.id, status: 'running' });
}

function jobSummary(j: ServeJob): Record<string, unknown> {
  return {
    id: j.id,
    status: j.status,
    createdAt: j.createdAt,
    ...(j.finishedAt === undefined ? {} : { finishedAt: j.finishedAt }),
    options: j.options,
    ...(j.error === undefined ? {} : { error: j.error }),
  };
}

function handleListAudits(
  res: ServerResponse,
  ctx: { manager: ReturnType<typeof createJobManager> },
): void {
  sendJson(res, 200, { audits: ctx.manager.list().map(jobSummary) });
}

function handleGetAudit(
  res: ServerResponse,
  ctx: { manager: ReturnType<typeof createJobManager> },
  id: string,
): void {
  const job = ctx.manager.get(id);
  if (!job) {
    sendJson(res, 404, { error: 'unknown audit id' });
    return;
  }
  // Restored jobs carry only the filed rendering; live jobs render.
  const rendered = job.rendered ?? (job.status === 'done' ? renderJobReport(job) : undefined);
  sendJson(res, 200, {
    ...jobSummary(job),
    ...(rendered === undefined ? {} : { contentType: rendered.contentType, report: rendered.body }),
  });
}

/** Request URL against the loopback base (the server never sees another host). */
function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://127.0.0.1');
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { manager: ReturnType<typeof createJobManager>; token: string; roots: string[] },
): Promise<void> {
  const url = requestUrl(req);
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(uiPage());
    return;
  }
  if (!checkAuth(req, ctx.token)) {
    sendJson(res, 401, { error: 'missing or invalid bearer token' });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/audits') {
    await handlePostAudits(req, res, ctx);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/audits') {
    handleListAudits(res, ctx);
    return;
  }
  const auditId = matchAuditId(url.pathname);
  if (req.method === 'GET' && auditId) {
    handleGetAudit(res, ctx, auditId);
    return;
  }
  sendJson(res, 404, { error: 'not found' });
}

/** Extract a hex audit id from /api/audits/:id, or null. */
function matchAuditId(pathname: string): string | null {
  const match = /^\/api\/audits\/([0-9a-f]+)$/.exec(pathname);
  return match?.[1] ?? null;
}
