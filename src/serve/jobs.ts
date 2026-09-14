import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
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

export function createJobManager(
  runner: JobRunner,
  historyLimit = 20,
): {
  submit: (options: ServeJobOptions, target: string) => { id: string } | { conflict: true };
  get: (id: string) => ServeJob | undefined;
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
          }
        })();
      });
      return { id: job.id };
    },

    get(id: string): ServeJob | undefined {
      return jobs.get(id);
    },
  };
}
