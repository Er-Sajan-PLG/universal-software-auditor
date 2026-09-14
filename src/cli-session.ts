import { createStdinAsk, runFoundationInit, runFoundationShow } from './foundation/interview.js';
import { checkModelAdvertised, runLiveSession, type ChatFn } from './live/runner.js';
import { complete, listModels, loadProviderConfig } from './agent/index.js';
import { LIVE_HELP_TEXT, MODELS_HELP_TEXT } from './cli-help.js';
import { bool, dryRunWrites, str, type Args } from './cli-args.js';

/** Conversational commands: foundation init/show, live sessions, model listing. */
/* ------------------------------------------------------------ foundation -- */

export function cmdFoundation(args: Args): number {
  const sub = args._[1] as string | undefined;
  const dir = str(args, 'dir') ?? (args._[2] as string | undefined) ?? '.';
  if (sub === 'init') {
    return runFoundationInit({
      dir,
      nonInteractive: bool(args, 'non-interactive'),
      dryRun: bool(args, 'dry-run'),
    });
  }
  if (sub === 'show' || sub === undefined) {
    return runFoundationShow({ dir });
  }
  console.error(
    'Usage: usa foundation <init|show> [path] [--dir <path>] [--non-interactive] [--dry-run]',
  );
  return 2;
}

/* ------------------------------------------------------------------ live -- */

/**
 * `usa live`: conversational audit session (foundation → audit → triage →
 * report). The default chat is the agent layer's `complete()`; without a
 * configured provider the session runs deterministically (loud skips, no
 * model calls). Async only because the LLM transport is async — every
 * deterministic step stays synchronous underneath.
 */
export async function cmdLive(args: Args): Promise<number> {
  if (bool(args, 'help')) {
    console.log(LIVE_HELP_TEXT);
    return 0;
  }
  const dir = (args._[1] as string | undefined) ?? '.';
  const providerId =
    str(args, 'provider') ?? process.env['USA_PROVIDER'] ?? process.env['USA_LIVE_PROVIDER'];
  const modelOpt = str(args, 'model') ?? process.env['USA_MODEL'];
  const transcriptPath = str(args, 'transcript');
  const triageLimit = parseTriageLimit(str(args, 'triage-limit'));
  if (triageLimit === null) {
    console.error('--triage-limit must be a positive number');
    return 2;
  }
  // CLI-003: preview before any provider call or prompting.
  if (!dryRunWrites(args, transcriptPath ? [transcriptPath] : [])) return 0;
  const chat = await resolveLiveChatOrAnnounce(providerId, modelOpt);
  return runLiveSession({
    dir,
    ask: createStdinAsk(),
    print: (line: string) => console.log(line),
    chat,
    transcriptPath,
    provider: providerId,
    model: modelOpt,
    triageLimit: triageLimit ?? undefined,
  });
}

/**
 * Resolve the session chat, announcing deterministic-only mode when no
 * provider is configured. The pre-flight warns once up front about
 * unadvertised model ids (the classic mid-session 404); the call itself
 * stays authoritative.
 */
async function resolveLiveChatOrAnnounce(
  providerId: string | undefined,
  modelOpt: string | undefined,
): Promise<ChatFn | undefined> {
  if (providerId) return resolveLiveChat(providerId, modelOpt);
  console.log(
    'live: no provider configured (set --provider or USA_PROVIDER) — deterministic-only mode.',
  );
  return undefined;
}

/**
 * Resolve the session chat, or undefined for deterministic-only mode. The
 * pre-flight warns once up front about unadvertised model ids (the classic
 * mid-session 404); the call itself stays authoritative.
 */
async function resolveLiveChat(
  providerId: string,
  modelOpt: string | undefined,
): Promise<ChatFn | undefined> {
  try {
    const cfg = loadProviderConfig(
      providerId,
      modelOpt === undefined ? undefined : { model: modelOpt },
    );
    const provider = providerId;
    const model = modelOpt;
    const admonition = await checkModelAdvertised(providerId, cfg.model, listModels);
    if (admonition) console.error(admonition);
    return (req) => complete({ ...req, provider, ...(model === undefined ? {} : { model }) });
  } catch {
    // Deliberately a STATIC message: provider failures name key material
    // (env vars, endpoints) and even the provider id is env-derived, so a
    // transcript-adjacent CLI interpolates nothing here — neither the
    // error nor the id. The user just typed it; they know which one failed.
    console.error(
      'live: LLM provider unavailable (check its API key) — continuing in deterministic-only mode.',
    );
    return undefined;
  }
}

/** Positive integer, or null when the flag value is unusable. */
function parseTriageLimit(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * `usa models`: what the provider actually serves, so a model id can be
 * checked before a session burns calls on a 404. Read-only and side-effect
 * free beyond one GET.
 */
export async function cmdModels(args: Args): Promise<number> {
  if (bool(args, 'help')) {
    console.log(MODELS_HELP_TEXT);
    return 0;
  }
  const providerId = str(args, 'provider') ?? process.env['USA_PROVIDER'];
  if (!providerId) {
    console.error('Usage: usa models --provider <id> (or set USA_PROVIDER)');
    return 2;
  }
  let names: string[];
  try {
    // Validates the key and resolves static defaults first — same fail-closed
    // contract as the session; the static message policy applies here too.
    loadProviderConfig(providerId);
    names = (await listModels(providerId)).map((m) => m.name);
  } catch {
    console.error('live: LLM provider unavailable (check its API key).');
    return 2;
  }
  for (const name of names) console.log(name);
  return 0;
}
