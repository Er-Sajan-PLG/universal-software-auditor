import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { makeProject, auditAt } from '../helpers.js';
import { startServer, checkAuth } from '../../src/serve/server.js';
import { createJobManager, resolveTarget } from '../../src/serve/jobs.js';
import { uiPage } from '../../src/serve/ui.js';

/**
 * `usa serve` (ADR-0039): localhost HTTP with bearer auth, contained
 * targets, single-flight jobs. Servers bind 127.0.0.1 ephemeral ports and
 * close after each test; the fake runner serves one real audit result for
 * every submit so response shapes are genuine without re-auditing per call.
 */
const TOKEN = 'test-token-never-sent';
const servers: Server[] = [];
const tmpRoots: string[] = [];

afterEach(async () => {
  while (servers.length) {
    const s = servers.pop()!;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
  while (tmpRoots.length) fs.rmSync(tmpRoots.pop()!, { recursive: true, force: true });
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-serve-'));
  tmpRoots.push(dir);
  return dir;
}

function fixtureTarget(): string {
  const { root, cleanup } = makeProject({
    'package.json': JSON.stringify({ name: 'served', version: '0.0.1' }),
    'index.js': 'const x = 1;\n',
  });
  tmpRoots.push(root);
  void cleanup;
  return root;
}

type Runner = Parameters<typeof createJobManager>[0];

async function startTest(opts?: {
  roots?: string[];
  token?: string;
  runner?: Runner;
}): Promise<{ base: string; token: string }> {
  const roots = opts?.roots ?? [tmpDir()];
  const token = opts?.token ?? TOKEN;
  const runner: Runner =
    opts?.runner ??
    ((jobOptions, target) =>
      auditAt(target, { depth: jobOptions.depth as 'quick' | 'standard' | 'deep' }));
  const { server, port } = await startServer({
    port: 0,
    token,
    roots,
    manager: createJobManager(runner),
  });
  servers.push(server);
  return { base: `http://127.0.0.1:${port}`, token };
}

async function api(
  base: string,
  method: string,
  path_: string,
  token?: string,
  body?: unknown,
): Promise<{ code: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${base}${path_}`, {
    method,
    headers: {
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Non-JSON bodies (the landing page) stay as text.
  }
  return { code: res.status, json, text };
}

async function waitDone(base: string, token: string, id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 100; i++) {
    const got = await api(base, 'GET', `/api/audits/${id}`, token);
    expect(got.code).toBe(200);
    if (got.json['status'] !== 'running') return got.json;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('job never finished');
}

describe('serve auth (ADR-0039)', () => {
  it('serves the landing page without auth, guards every API route', async () => {
    const { base } = await startTest();
    const page = await api(base, 'GET', '/', undefined);
    expect(page.code).toBe(200);
    expect(page.text).toContain('<form');
    expect(await api(base, 'POST', '/api/audits', undefined, {}).then((r) => r.code)).toBe(401);
    expect(await api(base, 'POST', '/api/audits', 'wrong', {}).then((r) => r.code)).toBe(401);
    expect(await api(base, 'GET', '/api/audits/abc', undefined).then((r) => r.code)).toBe(401);
  });

  it('rejects malformed and wrong-length bearer tokens without throwing', () => {
    expect(checkAuth({ headers: {} } as never, TOKEN)).toBe(false);
    expect(checkAuth({ headers: { authorization: 'Token x' } } as never, TOKEN)).toBe(false);
    expect(checkAuth({ headers: { authorization: 'Bearer short' } } as never, TOKEN)).toBe(false);
    expect(checkAuth({ headers: { authorization: `Bearer ${TOKEN}` } } as never, TOKEN)).toBe(true);
  });

  it('the UI builds DOM without innerHTML (untrusted report content)', () => {
    expect(uiPage()).not.toContain('innerHTML');
  });
});

describe('serve validation', () => {
  it('rejects bad bodies, depths, formats, and missing targets', async () => {
    const { base, token } = await startTest();
    const bad = { target: 42 };
    expect((await api(base, 'POST', '/api/audits', token, bad)).code).toBe(400);
    // '.' exists but lives outside the allow-roots: containment, not input shape.
    expect((await api(base, 'POST', '/api/audits', token, { target: '.' })).code).toBe(403);
    const dir = tmpDir();
    const depth = await api(base, 'POST', '/api/audits', token, { target: dir, depth: 'nope' });
    expect(depth.code).toBe(400);
    const format = await api(base, 'POST', '/api/audits', token, { target: dir, format: 'pdf' });
    expect(format.code).toBe(400);
    const missing = await api(base, 'POST', '/api/audits', token, {
      target: path.join(dir, 'ghost'),
    });
    expect(missing.code).toBe(400);
  });

  it('refuses targets outside the allow-roots, including symlink escapes', async () => {
    const root = tmpDir();
    const { base, token } = await startTest({ roots: [root] });
    const outside = tmpDir();
    const escaped = await api(base, 'POST', '/api/audits', token, { target: outside });
    expect(escaped.code).toBe(403);
    const link = path.join(root, 'sneaky');
    fs.symlinkSync(outside, link);
    const sneaky = await api(base, 'POST', '/api/audits', token, { target: link });
    expect(sneaky.code).toBe(403);
  });

  it('resolveTarget contains .. and symlinks, passes real paths', () => {
    const root = tmpDir();
    const sub = path.join(root, 'sub');
    fs.mkdirSync(sub);
    expect(resolveTarget(sub, [root])).toBe(fs.realpathSync(sub));
    // An existing sibling reached via `..` escapes even though it exists.
    const outside = tmpDir();
    expect(() => resolveTarget(path.join(root, '..', path.basename(outside)), [root])).toThrow(
      /escapes/,
    );
    expect(() => resolveTarget(path.join(root, 'ghost'), [root])).toThrow(/does not exist/);
  });

  it('404s unknown ids and routes', async () => {
    const { base, token } = await startTest();
    expect((await api(base, 'GET', '/api/audits/0'.repeat(32), token)).code).toBe(404);
    expect((await api(base, 'GET', '/nope', token)).code).toBe(404);
  });
});

describe('serve jobs', () => {
  it('runs an audit and returns the report', async () => {
    const target = fixtureTarget();
    const { base, token } = await startTest({ roots: [path.dirname(target)] });
    const started = await api(base, 'POST', '/api/audits', token, { target });
    expect(started.code).toBe(202);
    const id = started.json['id'];
    expect(typeof id).toBe('string');
    const done = await waitDone(base, token, id as string);
    expect(done['status']).toBe('done');
    expect(typeof done['report']).toBe('string');
    expect((done['report'] as string).length).toBeGreaterThan(0);
  });

  it('refuses a second audit while one runs (409)', async () => {
    const target = fixtureTarget();
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 1500));
      return auditAt(target);
    };
    const { base, token } = await startTest({ roots: [path.dirname(target)], runner: slow });
    const first = await api(base, 'POST', '/api/audits', token, { target });
    expect(first.code).toBe(202);
    const second = await api(base, 'POST', '/api/audits', token, { target });
    expect(second.code).toBe(409);
    await waitDone(base, token, first.json['id'] as string);
  });
});
