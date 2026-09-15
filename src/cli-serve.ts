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
interface ServeArgs {
  port: number;
  token: string;
  tokenGiven: boolean;
  roots: string[];
  dataDir: string | undefined;
}

/** Parse and validate serve flags. Returns an error string instead of throwing. */
function resolveServeArgs(args: Args): ServeArgs | { error: string } {
  const port = Number(str(args, 'port', '0') ?? '0');
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return { error: '--port must be an integer 0-65535 (0 picks an ephemeral port)' };
  }
  const roots = list(args, 'allow-root');
  const resolvedRoots = (roots.length > 0 ? roots : [process.cwd()]).map((r) => path.resolve(r));
  for (const r of resolvedRoots) {
    if (!fs.existsSync(r)) return { error: `--allow-root does not exist: ${r}` };
  }
  const given = str(args, 'token');
  const dataDirRaw = str(args, 'data-dir');
  return {
    port,
    token: given ?? randomBytes(32).toString('hex'),
    tokenGiven: given !== undefined,
    roots: resolvedRoots,
    dataDir: dataDirRaw === undefined ? undefined : path.resolve(dataDirRaw),
  };
}

export async function cmdServe(args: Args): Promise<number> {
  const resolved = resolveServeArgs(args);
  if ('error' in resolved) {
    console.error(resolved.error);
    return 2;
  }
  try {
    const { port: bound } = await startServer({
      port: resolved.port,
      token: resolved.token,
      roots: resolved.roots,
      ...(resolved.dataDir === undefined ? {} : { dataDir: resolved.dataDir }),
    });
    console.log(
      `usa serve: listening on http://127.0.0.1:${bound} (loopback only — never expose directly)`,
    );
    if (resolved.tokenGiven) {
      console.log('usa serve: using the provided bearer token for /api/*.');
    } else {
      console.log('usa serve: generated bearer token (printed once, required on /api/*):');
      console.log(resolved.token);
    }
    if (resolved.dataDir !== undefined) {
      console.log(`usa serve: persisting finished audits to ${resolved.dataDir}.`);
    }
  } catch (err) {
    console.error(`usa serve: cannot listen: ${(err as Error).message}`);
    return 2;
  }
  await new Promise<void>(() => {});
  return 0;
}
