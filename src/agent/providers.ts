/**
 * LLM provider layer — one transport: OpenAI-compatible Chat Completions
 * over `fetch`.
 *
 * Covers OpenAI, DeepSeek, Groq, Mistral, Together, OpenRouter, Ollama,
 * LM Studio, vLLM, and custom endpoints — all of which speak
 * `POST {baseURL}/chat/completions` and (hosted ones plus most local ones)
 * `GET {baseURL}/models`.
 *
 * IMPLEMENTED: OpenAI-compatible Chat Completions (`complete`) and model
 * listing (`listModels`) as described above.
 * PROPOSED (not implemented — do not assume they work):
 *   - Anthropic-native Messages API transport (distinct auth headers,
 *     `anthropic-version`, prompt-caching blocks, thinking blocks).
 *   - Google Gemini-native `generateContent` transport (distinct URL shape,
 *     `x-goog-api-key`, distinct response envelope and safety metadata).
 * Honesty discipline: only the OpenAI-compatible transport exists. Any
 * caller asking for `anthropic` / `google-native` must fail loudly with
 * "not implemented", never silently emulate.
 *
 * Security rules enforced here:
 *   - API keys come ONLY from environment variables. Never from files,
 *     CLI args, or defaults. A missing key throws naming the variable
 *     (fail-closed); the caller disables LLM features on that error.
 *   - Key material is NEVER logged. Tests assert the `Authorization`
 *     header shape with a fake key, never a real one.
 */

import type {
  ChatRequest,
  ChatResult,
  ModelInfo,
  ProviderOverrides,
  ProviderPreset,
  ResolvedConfig,
} from './types.js';

/** Request timeout: 60s per attempt, enforced via `AbortSignal.timeout`. */
export const REQUEST_TIMEOUT_MS = 60_000;

/** Max characters of an error body included in thrown HTTP errors. */
export const ERROR_SNIPPET_LEN = 200;

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    fetchModels: true,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    fetchModels: true,
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    freeTier: true,
    fetchModels: true,
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    baseURL: 'https://api.mistral.ai/v1',
    apiKeyEnv: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-small-latest',
    freeTier: true,
    fetchModels: true,
  },
  together: {
    id: 'together',
    label: 'Together AI',
    baseURL: 'https://api.together.xyz/v1',
    apiKeyEnv: 'TOGETHER_API_KEY',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    fetchModels: true,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'openai/gpt-4o-mini',
    freeTier: true,
    fetchModels: true,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    baseURL: 'http://localhost:11434/v1',
    apiKeyEnv: '',
    defaultModel: 'llama3.1',
    freeTier: true,
    fetchModels: true,
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    baseURL: 'http://localhost:1234/v1',
    apiKeyEnv: '',
    defaultModel: 'local-model',
    freeTier: true,
    fetchModels: true,
  },
  custom: {
    id: 'custom',
    label: 'Custom OpenAI-compatible endpoint',
    // Empty on purpose: the caller MUST supply baseURL (and usually
    // apiKeyEnv/model) via overrides. Any vLLM / text-generation-webui /
    // corporate-gateway endpoint works as long as it speaks the
    // OpenAI-compatible Chat Completions dialect.
    baseURL: '',
    apiKeyEnv: '',
    defaultModel: '',
    fetchModels: false,
  },
};

/** Names of explicitly PROPOSED-but-unimplemented native transports. */
const UNIMPLEMENTED_TRANSPORTS = new Set(['anthropic', 'google', 'gemini', 'vertex', 'bedrock']);

/**
 * Resolve a provider id to a concrete config, reading the API key from
 * the environment. Fail-closed: a missing key throws naming the variable;
 * the caller disables LLM features on that error. Never logs key material.
 */
export function loadProviderConfig(
  providerId: string,
  overrides?: ProviderOverrides,
): ResolvedConfig {
  if (UNIMPLEMENTED_TRANSPORTS.has(providerId)) {
    throw new Error(
      `LLM provider "${providerId}" is PROPOSED, not implemented: ` +
        `only OpenAI-compatible Chat Completions transports are available ` +
        `(${Object.keys(PROVIDER_PRESETS).join(', ')}).`,
    );
  }
  const preset = PROVIDER_PRESETS[providerId];
  if (!preset) {
    throw new Error(
      `Unknown LLM provider "${providerId}". Known providers: ${Object.keys(PROVIDER_PRESETS).join(', ')}.`,
    );
  }
  const baseURL = overrides?.baseURL ?? preset.baseURL;
  if (!baseURL) {
    throw new Error(
      `LLM provider "${providerId}" has no baseURL: supply one via overrides.baseURL ` +
        `(custom endpoints must always provide a baseURL).`,
    );
  }
  const apiKeyEnv = overrides?.apiKeyEnv ?? preset.apiKeyEnv;
  let apiKey: string | undefined;
  if (apiKeyEnv) {
    const raw = process.env[apiKeyEnv];
    if (!raw) {
      throw new Error(
        `LLM provider "${providerId}" needs an API key: environment variable ${apiKeyEnv} ` +
          `is missing or empty. Set it, or disable LLM features.`,
      );
    }
    apiKey = raw;
  }
  const model = overrides?.model ?? preset.defaultModel;
  if (!model) {
    throw new Error(
      `LLM provider "${providerId}" has no default model: supply one via overrides.model ` +
        `or ChatRequest.model.`,
    );
  }
  const resolved: ResolvedConfig = {
    providerId: preset.id,
    label: preset.label,
    baseURL: baseURL.replace(/\/+$/, ''),
    model,
  };
  if (apiKey !== undefined) resolved.apiKey = apiKey;
  return resolved;
}

function authHeaders(apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey !== undefined) headers['Authorization'] = `Bearer ${apiKey}`;
  return headers;
}

async function readSnippet(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, ERROR_SNIPPET_LEN);
  } catch {
    return '<unreadable body>';
  }
}

interface ChatCompletionsResponse {
  id?: unknown;
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
}

function numOrUndefined(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Run one OpenAI-compatible Chat Completions request. Optional fields
 * (`temperature`, `max_tokens`, `reasoning_effort`) are sent ONLY when set,
 * so provider defaults apply otherwise. Non-2xx responses throw an `Error`
 * carrying the HTTP status plus a body snippet (never key material).
 */
export async function complete(req: ChatRequest): Promise<ChatResult> {
  const cfg = loadProviderConfig(req.provider, { model: req.model });
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (req.temperature !== undefined) body['temperature'] = req.temperature;
  if (req.maxTokens !== undefined) body['max_tokens'] = req.maxTokens;
  if (req.reasoningEffort !== undefined) body['reasoning_effort'] = req.reasoningEffort;

  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(cfg.apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const snippet = await readSnippet(res);
    throw new Error(`Chat completions request failed: HTTP ${res.status} ${snippet}`);
  }
  let json: ChatCompletionsResponse;
  try {
    json = (await res.json()) as ChatCompletionsResponse;
  } catch (err) {
    throw new Error(
      `Chat completions request failed: unreadable JSON response (${(err as Error).message})`,
      {
        cause: err,
      },
    );
  }
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(
      'Chat completions request failed: response has no choices[0].message.content string',
    );
  }
  const result: ChatResult = {
    text: content,
    model: typeof json.model === 'string' && json.model ? json.model : cfg.model,
  };
  const promptTokens = numOrUndefined(json.usage?.prompt_tokens);
  const completionTokens = numOrUndefined(json.usage?.completion_tokens);
  const totalTokens = numOrUndefined(json.usage?.total_tokens);
  if (promptTokens !== undefined || completionTokens !== undefined || totalTokens !== undefined) {
    result.usage = {};
    if (promptTokens !== undefined) result.usage.promptTokens = promptTokens;
    if (completionTokens !== undefined) result.usage.completionTokens = completionTokens;
    if (totalTokens !== undefined) result.usage.totalTokens = totalTokens;
  }
  return result;
}

/** Extract model names tolerantly from a `GET /models` payload. */
function parseModelList(json: unknown): string[] {
  const names: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === 'string' && v) names.push(v);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const cand = o['name'] ?? o['id'];
      if (typeof cand === 'string' && cand) names.push(cand);
    }
  };
  if (Array.isArray(json)) {
    for (const item of json) push(item);
  } else if (json && typeof json === 'object') {
    const data = (json as Record<string, unknown>)['data'];
    if (Array.isArray(data)) {
      for (const item of data) push(item);
    }
  }
  return [...new Set(names)];
}

/**
 * List models via `GET {baseURL}/models` (OpenAI shape `{data:[{id}]}` or
 * tolerant variants). Degraded-never-empty: any fetch/HTTP/parse failure
 * falls back to the preset's static default model. If the preset has no
 * static default (custom without a caller-supplied model... which is
 * rejected earlier) and the fetch fails, the error is rethrown loudly —
 * never an empty guess.
 */
export async function listModels(
  providerId: string,
  overrides?: ProviderOverrides,
): Promise<ModelInfo[]> {
  const cfg = loadProviderConfig(providerId, overrides);
  try {
    const res = await fetch(`${cfg.baseURL}/models`, {
      method: 'GET',
      headers: authHeaders(cfg.apiKey),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: unknown = await res.json();
    const names = parseModelList(json);
    if (names.length === 0) throw new Error('empty model list');
    return names.map((name) => ({ name }));
  } catch {
    if (!cfg.model) {
      throw new Error(
        `Could not list models for provider "${providerId}" and no static default exists: ` +
          `supply overrides.model.`,
      );
    }
    return [{ name: cfg.model }];
  }
}
