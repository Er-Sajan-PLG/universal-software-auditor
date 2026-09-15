import { randomBytes } from 'node:crypto';
import fs, { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { AuditReport } from '../types.js';
import type { MaturityProfile } from '../engine/maturity.js';

/**
 * Audit job management for `usa serve` (ADR-0039).
 *
 * One running job at a time (a second submit gets 409), bounded history,
 * and targets contained inside explicit allow-roots with the same
 * resolve-and-verify discipline as the object store (SEC-010): `..` and
 * symlink escapes throw instead of serving. The runner is injectable so
 * tests can use slow fakes without running real audits.
 */

export interface ServeJobOptions {
  target: string;
  depth: string;
  profile: string;
  format: string;
}

export type JobStatus = 'running' | 'done' | 'error';

export interface ServeJob {
  id: string;
  status: JobStatus;
  options: ServeJobOptions;
  createdAt: string;
  finishedAt?: string;
  report?: AuditReport;
  profile?: MaturityProfile;
  /** Rendered report (set for finished jobs when persistence is on). */
  rendered?: { contentType: string; body: string };
  error?: string;
}

/**
 * Resolve a requested target against allow-roots. Throws a clean Error when
 * the target does not exist or escapes every root (after realpath, so
 * symlinks cannot smuggle it out).
 */
export function resolveTarget(raw: string, roots: string[]): string {
  const resolved = path.resolve(raw);
  if (!existsSync(resolved)) {
    throw new Error(`target does not exist: ${raw}`);
  }
  const real = realpathSync(resolved);
  // Roots are realpath'd too: comparing a lexically-resolved root against a
  // real target false-rejects on machines where tmp-style prefixes are
  // symlinks (fail-closed, but noisy). Roots must exist — the server
  // rejects missing ones at startup with a clean message.
  for (const root of roots) {
    const rel = path.relative(realpathSync(path.resolve(root)), real);
    if (rel !== '..' && !rel.startsWith(`..${path.sep}`)) return real;
  }
  throw new Error(`target escapes the allowed roots: ${raw}`);
}

export interface JobRunner {
  (
    options: ServeJobOptions,
    target: string,
  ):
    | { report: AuditReport; profile: MaturityProfile }
    | Promise<{ report: AuditReport; profile: MaturityProfile }>;
}

export interface JobHooks {
  /** Fires for every finished job (done or error), after status is set. */
  onDone?: (job: ServeJob) => void;
}

export function createJobManager(
  runner: JobRunner,
  historyLimit = 20,
  hooks: JobHooks = {},
): {
  submit: (options: ServeJobOptions, target: string) => { id: string } | { conflict: true };
  get: (id: string) => ServeJob | undefined;
  list: () => ServeJob[];
  restore: (jobs: ServeJob[]) => void;
} {
  const jobs = new Map<string, ServeJob>();
  let running = false;

  function prune(): void {
    const done = [...jobs.values()].filter((j) => j.status !== 'running');
    while (done.length > historyLimit) {
      const oldest = done.shift();
      if (oldest) jobs.delete(oldest.id);
    }
  }

  return {
    submit(options: ServeJobOptions, target: string): { id: string } | { conflict: true } {
      if (running) return { conflict: true };
      running = true;
      const job: ServeJob = {
        id: randomBytes(16).toString('hex'),
        status: 'running',
        options,
        createdAt: new Date().toISOString(),
      };
      jobs.set(job.id, job);
      // Deferred past the HTTP response flush; the sync engine still blocks
      // the loop while it runs (documented localhost limitation, ADR-0039).
      // Awaited so slow (test) runners hold the single-flight lock across
      // ticks — that is what makes the 409 path deterministic.
      setImmediate(() => {
        void (async () => {
          try {
            const { report, profile } = await runner(options, target);
            job.report = report;
            job.profile = profile;
            job.status = 'done';
          } catch (err) {
            job.status = 'error';
            job.error = (err as Error).message;
          } finally {
            job.finishedAt = new Date().toISOString();
            running = false;
            prune();
            hooks.onDone?.(job);
          }
        })();
      });
      return { id: job.id };
    },

    get(id: string): ServeJob | undefined {
      return jobs.get(id);
    },

    list(): ServeJob[] {
      return [...jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },

    restore(seed: ServeJob[]): void {
      for (const job of seed) {
        if (job.status !== 'running') jobs.set(job.id, job);
      }
      prune();
    },
  };
}

/**
 * File persistence for `--data-dir` (ADR-0040): one JSON file per finished
 * job, pruned to the same bound as memory history. Only finished jobs are
 * ever written — a crash leaves no partial record behind.
 */
export interface PersistedJob {
  id: string;
  status: JobStatus;
  options: ServeJobOptions;
  createdAt: string;
  finishedAt?: string;
  error?: string;
  rendered?: { contentType: string; body: string };
}

export function persistJob(dir: string, job: ServeJob): void {
  if (job.status === 'running') return;
  const record: PersistedJob = {
    id: job.id,
    status: job.status,
    options: job.options,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    error: job.error,
    rendered: job.rendered,
  };
  fs.writeFileSync(path.join(dir, `${job.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
}

function readRecord(dir: string, file: string): PersistedJob {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as PersistedJob;
  if (typeof raw.id !== 'string' || (raw.status !== 'done' && raw.status !== 'error')) {
    throw new Error('not a job record');
  }
  return raw;
}

function listRecordFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}

/**
 * Read back persisted jobs, skipping anything malformed with a loud
 * warning instead of refusing to start — a corrupt file must not take
 * down the server, but it must not pass silently either.
 */
export function loadPersisted(dir: string): ServeJob[] {
  const out: ServeJob[] = [];
  for (const f of listRecordFiles(dir)) {
    try {
      const raw = readRecord(dir, f);
      out.push({
        id: raw.id,
        status: raw.status,
        options: raw.options,
        createdAt: raw.createdAt,
        finishedAt: raw.finishedAt,
        error: raw.error,
        rendered: raw.rendered,
      });
    } catch (err) {
      console.error(`serve: skipping unreadable job file ${f}: ${(err as Error).message}`);
    }
  }
  return out;
}

/** Prune persisted files past the bound, oldest first (shared rule). */
export function prunePersisted(dir: string, historyLimit: number): void {
  const records: Array<{ id: string; createdAt: string }> = [];
  for (const f of listRecordFiles(dir)) {
    try {
      const raw = readRecord(dir, f);
      records.push({ id: raw.id, createdAt: raw.createdAt });
    } catch {
      // Malformed files are the loader's complaint, not the pruner's.
    }
  }
  if (records.length <= historyLimit) return;
  records.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  for (const victim of records.slice(0, records.length - historyLimit)) {
    try {
      fs.rmSync(path.join(dir, `${victim.id}.json`));
    } catch {
      // Best effort: a leftover file is untidy, not a failure.
    }
  }
}
