import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startServer } from './serve/server.js';
import { list, str, type Args } from './cli-args.js';

/**
 * `usa serve`: loopback-only audit server (ADR-0039). Binds 127.0.0.1 —
 * there is deliberately no flag to change that. Targets must exist and
 * resolve inside --allow-root (default: the working directory).
 */
export async function cmdServe(args: Args): Promise<number> {
  const portRaw = str(args, 'port', '0') ?? '0';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('--port must be an integer 0-65535 (0 picks an ephemeral port)');
    return 2;
  }
  const roots = list(args, 'allow-root');
  const resolvedRoots = (roots.length > 0 ? roots : [process.cwd()]).map((r) => path.resolve(r));
  for (const r of resolvedRoots) {
    if (!fs.existsSync(r)) {
      console.error(`--allow-root does not exist: ${r}`);
      return 2;
    }
  }
  const given = str(args, 'token');
  const token = given ?? randomBytes(32).toString('hex');
  try {
    const { port: bound } = await startServer({ port, token, roots: resolvedRoots });
    console.log(
      `usa serve: listening on http://127.0.0.1:${bound} (loopback only — never expose directly)`,
    );
    if (given === undefined) {
      console.log('usa serve: generated bearer token (printed once, required on /api/*):');
      console.log(token);
    } else {
      console.log('usa serve: using the provided bearer token for /api/*.');
    }
  } catch (err) {
    console.error(`usa serve: cannot listen: ${(err as Error).message}`);
    return 2;
  }
  await new Promise<void>(() => {});
  return 0;
}
