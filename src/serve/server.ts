import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { runAudit } from '../engine/audit.js';
import { loadConfig } from '../config.js';
import { renderJson } from '../report/json.js';
import { renderMarkdown } from '../report/markdown.js';
import { renderHtml } from '../report/html.js';
import { DEPTHS, MATURITIES, DEFAULT_RULES_DIR, VERSION } from '../cli-args.js';
import { createJobManager, resolveTarget, type ServeJob } from './jobs.js';
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
  manager?: ReturnType<typeof createJobManager>;
}

export async function startServer(opts: ServeOptions): Promise<{
  server: Server;
  port: number;
  token: string;
}> {
  const manager =
    opts.manager ??
    createJobManager((jobOptions, target) => {
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
    });

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(uiPage());
        return;
      }
      if (!checkAuth(req, opts.token)) {
        sendJson(res, 401, { error: 'missing or invalid bearer token' });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/audits') {
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
        const target = body['target'];
        const depth = body['depth'] ?? 'standard';
        const profile = body['profile'] ?? 'auto';
        const format = body['format'] ?? 'json';
        if (typeof target !== 'string' || target.length === 0) {
          sendJson(res, 400, { error: 'target (string) is required' });
          return;
        }
        if (typeof depth !== 'string' || !DEPTHS.includes(depth as 'quick')) {
          sendJson(res, 400, { error: `depth must be one of ${DEPTHS.join('|')}` });
          return;
        }
        if (
          typeof profile !== 'string' ||
          (profile !== 'auto' && !MATURITIES.includes(profile as 'beta'))
        ) {
          sendJson(res, 400, { error: 'profile must be auto or a maturity stage' });
          return;
        }
        if (typeof format !== 'string' || !(FORMATS as readonly string[]).includes(format)) {
          sendJson(res, 400, { error: `format must be one of ${FORMATS.join('|')}` });
          return;
        }
        let resolved: string;
        try {
          resolved = resolveTarget(target, opts.roots);
        } catch (err) {
          const message = (err as Error).message;
          // Containment failures are authorization failures; a missing
          // path is a bad request. Different status, same static shape.
          sendJson(res, message.includes('escapes') ? 403 : 400, { error: message });
          return;
        }
        const submitted = manager.submit({ target, depth, profile, format }, resolved);
        if ('conflict' in submitted) {
          sendJson(res, 409, { error: 'an audit is already running' });
          return;
        }
        sendJson(res, 202, { id: submitted.id, status: 'running' });
        return;
      }
      const auditMatch = /^\/api\/audits\/([0-9a-f]+)$/.exec(url.pathname);
      if (req.method === 'GET' && auditMatch) {
        const job = manager.get(auditMatch[1] as string);
        if (!job) {
          sendJson(res, 404, { error: 'unknown audit id' });
          return;
        }
        const rendered = job.status === 'done' ? renderJobReport(job) : undefined;
        sendJson(res, 200, {
          id: job.id,
          status: job.status,
          createdAt: job.createdAt,
          ...(job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt }),
          options: job.options,
          ...(job.error === undefined ? {} : { error: job.error }),
          ...(rendered === undefined
            ? {}
            : { contentType: rendered.contentType, report: rendered.body }),
        });
        return;
      }
      sendJson(res, 404, { error: 'not found' });
    })().catch((err: Error) => {
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
