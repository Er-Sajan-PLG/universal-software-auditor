import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AuditReport } from '../types.js';
import { trailer } from './markdown.js';

/**
 * Verify-side support for detached report signatures (Sigstore/cosign).
 *
 * ADR-0011 boundary: USA ships NO signer. There is deliberately no
 * `signReport()` here — minting a signature would cross the charter
 * constraint ("no signer") and must re-open ADR-0011 first. This module only
 * consumes evidence produced elsewhere: it builds the deterministic payload
 * bytes a report signs over, parses a `.sig.json` sidecar, and shells out to
 * an external `cosign` binary to verify it — the same opt-in posture as
 * `command` checks (absent binary = explicit error, NEVER a fake pass).
 *
 * Deterministic/offline core: everything here is pure bytes except the
 * explicitly-invoked local `cosign verify-blob` subprocess. No network calls.
 */

export const SIGNATURE_SCHEMA = 'usa-report-sig-v1';
export const SIDECAR_SUFFIX = '.sig.json';
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Deterministic payload bytes of a report: the single canonical trailer
 * projection from `markdown.ts`, UTF-8 encoded with a trailing newline.
 * No second canonicalization is invented here — whatever `usa diff` parses
 * is exactly what a signature binds to.
 */
export function canonicalReportBytes(report: AuditReport): Buffer {
  return Buffer.from(`${trailer(report)}\n`, 'utf8');
}

/** Lowercase hex SHA-256 of bytes (or a UTF-8 string). */
export function sha256Hex(data: Uint8Array | string): string {
  const h = createHash('sha256');
  h.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
  return h.digest('hex');
}

/**
 * Detached-signature sidecar (the `.sig.json` file beside a report).
 * `bundle` is the base64-encoded Sigstore bundle as written by
 * `cosign sign-blob --bundle` — kept base64 so the sidecar stays plain JSON.
 */
export interface DetachedSignature {
  schema: typeof SIGNATURE_SCHEMA;
  /** Hex SHA-256 of `canonicalReportBytes(report)` at signing time. */
  payloadSha256: string;
  /** Base64-encoded Sigstore bundle binding the payload to a key. */
  bundle: string;
  keyHint?: string;
  createdAt?: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/=\s]+$/;

function assertSidecarSchema(s: Record<string, unknown>): void {
  if (s['schema'] !== SIGNATURE_SCHEMA) {
    throw new Error(
      `unsupported signature schema ${JSON.stringify(s['schema'])} — expected ${JSON.stringify(SIGNATURE_SCHEMA)}`,
    );
  }
}

function assertSidecarHash(s: Record<string, unknown>): void {
  if (typeof s['payloadSha256'] !== 'string' || !HEX64.test(s['payloadSha256'])) {
    throw new Error(
      'signature sidecar has no valid payloadSha256 (expected 64 lowercase hex chars)',
    );
  }
}

function decodedBundleLength(bundle: string): number {
  try {
    return Buffer.from(bundle, 'base64').length;
  } catch {
    return 0;
  }
}

function assertSidecarBundle(s: Record<string, unknown>): void {
  if (typeof s['bundle'] !== 'string' || s['bundle'].length === 0 || !BASE64.test(s['bundle'])) {
    throw new Error('signature sidecar has no valid bundle (expected non-empty base64)');
  }
  if (decodedBundleLength(s['bundle']) === 0) {
    throw new Error('signature sidecar bundle decodes to zero bytes');
  }
}

function assertSidecarShape(sig: unknown): asserts sig is DetachedSignature {
  if (typeof sig !== 'object' || sig === null || Array.isArray(sig)) {
    throw new Error('signature sidecar must be a JSON object, got a non-object');
  }
  const s = sig as Record<string, unknown>;
  assertSidecarSchema(s);
  assertSidecarHash(s);
  assertSidecarBundle(s);
  if (s['keyHint'] !== undefined && typeof s['keyHint'] !== 'string') {
    throw new Error('signature sidecar keyHint must be a string when present');
  }
  if (s['createdAt'] !== undefined && typeof s['createdAt'] !== 'string') {
    throw new Error('signature sidecar createdAt must be a string when present');
  }
}

/**
 * Parses a `.sig.json` sidecar. Fail-closed: anything malformed throws —
 * a corrupt sidecar is an operator error, never something to verify past.
 */
export function parseDetachedSignature(raw: string): DetachedSignature {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('signature sidecar is not valid JSON');
  }
  assertSidecarShape(parsed);
  return parsed;
}

/** Serializes a sidecar to prettier-stable JSON (trailing newline). */
export function formatDetachedSignature(sig: DetachedSignature): string {
  assertSidecarShape(sig);
  return `${JSON.stringify(sig, null, 2)}\n`;
}

/** True when the external `cosign` binary runs. Never throws. */
export function isCosignAvailable(cosignBinary = 'cosign'): boolean {
  try {
    execFileSync(cosignBinary, ['version'], {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

export interface VerifyOptions {
  /** Path to the PEM-encoded public key the bundle is verified against. */
  publicKeyPath: string;
  /** Override the `cosign` binary (tests, custom installs). */
  cosignBinary?: string;
  /** Subprocess timeout in ms (default 60 s, mirroring `command` checks). */
  timeoutMs?: number;
}

export interface VerifyResult {
  ok: boolean;
  detail: string;
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

/** Returns a fail-closed refusal detail, or null when the key file is usable. */
function checkPublicKey(publicKeyPath: string): string | null {
  if (!publicKeyPath) {
    return 'no public key supplied — cannot verify a signature without one';
  }
  let isFile: boolean;
  try {
    isFile = fs.statSync(publicKeyPath).isFile();
  } catch {
    return `public key not found at ${publicKeyPath} — refusing to pass an unverifiable report`;
  }
  return isFile
    ? null
    : `public key at ${publicKeyPath} is not a file — refusing to pass an unverifiable report`;
}

/**
 * Runs the single allowed external touch: the local `cosign verify-blob`
 * subprocess. Cosign rejections come back as `{ ok: false }`; only an
 * absent binary throws (explicitly — never a fake pass).
 */
function runCosignVerify(
  binary: string,
  publicKeyPath: string,
  bundlePath: string,
  payloadPath: string,
  timeoutMs: number,
): VerifyResult {
  try {
    const out = execFileSync(
      binary,
      ['verify-blob', '--key', publicKeyPath, '--bundle', bundlePath, payloadPath],
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 1 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return { ok: true, detail: truncate(out, 200) || 'signature verified' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT/i.test(msg)) {
      // Same posture as `command` checks: the tool is absent, so the check
      // is explicitly un-runnable — throw rather than return ok:false, so
      // no caller can mistake this for a completed verification.
      throw new Error(
        `cosign binary not found (${binary}) — install cosign to verify report signatures; refusing to pass an unverified report`,
        { cause: err },
      );
    }
    return {
      ok: false,
      detail: `cosign verify-blob rejected the signature: ${truncate(msg, 300)}`,
    };
  }
}

/**
 * Verifies a report's detached signature against a public key.
 *
 * Fail-closed contract:
 * - payload hash mismatch → `{ ok: false }` (report changed after signing);
 * - missing public key, cosign rejection, timeout → `{ ok: false }`;
 * - malformed sidecar → throws (cannot even attempt verification);
 * - absent `cosign` binary → throws an explicit error (same posture as
 *   `command` checks: an unverifiable report is NEVER reported as passing).
 *
 * The only external touch is the local `cosign verify-blob` subprocess;
 * no network calls are made from this module.
 */
export function verifyDetachedSignature(
  payload: AuditReport | Uint8Array,
  signature: DetachedSignature | string,
  options: VerifyOptions,
): VerifyResult {
  const sig = typeof signature === 'string' ? parseDetachedSignature(signature) : signature;
  assertSidecarShape(sig);
  const bytes = payload instanceof Uint8Array ? payload : canonicalReportBytes(payload);
  const binary = options.cosignBinary ?? 'cosign';

  const actual = sha256Hex(bytes);
  if (actual !== sig.payloadSha256) {
    return {
      ok: false,
      detail: `payload hash mismatch — report changed after signing (sidecar binds ${sig.payloadSha256}, payload hashes to ${actual})`,
    };
  }

  const keyRefusal = checkPublicKey(options.publicKeyPath);
  if (keyRefusal !== null) {
    return { ok: false, detail: keyRefusal };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-sig-verify-'));
  try {
    const payloadPath = path.join(dir, 'payload.bin');
    const bundlePath = path.join(dir, 'bundle.json');
    fs.writeFileSync(payloadPath, bytes);
    fs.writeFileSync(bundlePath, Buffer.from(sig.bundle, 'base64'));
    return runCosignVerify(
      binary,
      options.publicKeyPath,
      bundlePath,
      payloadPath,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
