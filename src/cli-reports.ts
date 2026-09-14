import fs from 'node:fs';
import { diffReports } from './engine/diff.js';
import { parseTrailer } from './report/markdown.js';
import {
  parseDetachedSignature,
  verifyDetachedSignature,
  type DetachedSignature,
} from './report/signature.js';
import { bool, dryRunWrites, str, type Args } from './cli-args.js';
import { writeTextFile } from './util/files.js';

/** Report operations: diffing two reports, verifying a signed report. */
/* ------------------------------------------------------------------- diff -- */

export function cmdDiff(args: Args): number {
  const beforePath = args._[1] as string | undefined;
  const afterPath = args._[2] as string | undefined;
  if (!beforePath || !afterPath) {
    console.error('Usage: usa diff <before.md> <after.md> [--out DIFF.md] [--dry-run]');
    return 2;
  }
  // CLI-003: preview before reading or comparing anything.
  const diffOut = str(args, 'out');
  if (!dryRunWrites(args, diffOut ? [diffOut] : [])) return 0;
  const readTrailer = (file: string) => {
    const text = fs.readFileSync(file, 'utf8');
    return parseTrailer(text) ?? text; // tolerate a raw YAML trailer file
  };
  try {
    const md = diffReports(readTrailer(beforePath), readTrailer(afterPath));
    if (diffOut) writeTextFile(diffOut, md);
    console.log(md);
    return 0;
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
}

/* -------------------------------------------------------- verify-report -- */

/** Reads a text input, or reports it loudly and returns null (exit 2). */
function readTextInput(file: string, label: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    console.error(`${label} not found or unreadable: ${file}`);
    return null;
  }
}

export function cmdVerifyReport(args: Args): number {
  const reportPath = args._[1] as string | undefined;
  const bundlePath = str(args, 'bundle');
  if (!reportPath || !bundlePath) {
    console.error(
      'Usage: usa verify-report <AUDIT.md> --bundle <sidecar.sig.json> [--key <pubkey>] [--cosign-binary <path>] [--quiet]',
    );
    return 2;
  }
  const markdown = readTextInput(reportPath, 'Report file');
  if (markdown === null) return 2;
  const sidecarRaw = readTextInput(bundlePath, 'Signature sidecar');
  if (sidecarRaw === null) return 2;
  const trailerYaml = parseTrailer(markdown);
  if (!trailerYaml || !trailerYaml.trim()) {
    console.error(`Report has no machine-readable trailer: ${reportPath}`);
    return 2;
  }
  let signature;
  try {
    signature = parseDetachedSignature(sidecarRaw);
  } catch (err) {
    console.error(`Signature sidecar is malformed (${bundlePath}): ${(err as Error).message}`);
    return 2;
  }
  // Payload bytes are exactly canonicalReportBytes(report) for the report
  // that rendered this trailer: the trailer projection plus '\n'. The CLI
  // only ever sees rendered bytes, so it reconstructs them from the parsed
  // trailer rather than re-deriving a report object.
  const payload = Buffer.from(`${trailerYaml}\n`, 'utf8');
  return runSignatureVerify(args, reportPath, payload, signature);
}

/**
 * Runs the cosign verification and maps the outcome onto the gate
 * convention: 0 verified, 1 mismatch/failed, 2 environment refusal (an
 * absent cosign binary throws — a loud error, never a fake pass).
 */
function runSignatureVerify(
  args: Args,
  reportPath: string,
  payload: Buffer,
  signature: DetachedSignature,
): number {
  const quiet = bool(args, 'quiet');
  const cosignBinary = str(args, 'cosign-binary');
  let result;
  try {
    result = verifyDetachedSignature(payload, signature, {
      publicKeyPath: str(args, 'key') ?? '',
      ...(cosignBinary === undefined ? {} : { cosignBinary }),
    });
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
  if (result.ok) {
    if (!quiet) console.log(`Signature verified: ${reportPath}`);
    return 0;
  }
  // Gate convention: the mismatch detail goes to stderr, suppressed by
  // --quiet; the exit code alone carries the verdict then.
  if (!quiet) console.error(`Signature verification failed for ${reportPath}: ${result.detail}`);
  return 1;
}

/* -------------------------------------------------------------- bootstrap -- */
