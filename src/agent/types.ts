/**
 * LLM provider layer — shared request/result types.
 *
 * Doctrine: the deterministic offline spine never depends on this layer.
 * The LLM only *proposes* from outside the spine; the engine verifies.
 * Every key comes from the environment (fail-closed when missing); key
 * material is never logged.
 *
 * IMPLEMENTED: OpenAI-compatible Chat Completions over `fetch`.
 * PROPOSED (not implemented — do not assume they work):
 *   - Anthropic Messages API (`anthropic-*` headers, `anthropic-version`):
 *     different auth scheme, prompt-caching headers, and message roles.
 *   - Google Gemini native `generateContent` protocol (`:generateContent`,
 *     `x-goog-api-key`): different URL shape and response envelope.
 * Both remain documented follow-ups until a contributor adds a dedicated
 * transport plus tests. Anything not listed under IMPLEMENTED does not work.
 */

/** A single turn in a chat-completions conversation. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

/**
 * Reasoning-effort hint forwarded verbatim as `reasoning_effort`.
 * Kept as a plain string: the accepted values differ per vendor
 * (OpenAI `low|medium|high`, others accept `minimal`, `xhigh`, …),
 * so this layer does not validate — the server decides.
 */
export type ReasoningEffort = string;

/** One LLM completion request against a configured provider preset. */
export interface ChatRequest {
  /** Key of {@link PROVIDER_PRESETS} (see providers.ts). */
  provider: string;
  /** Model id as advertised by the provider (e.g. `gpt-4o-mini`). */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
}

/** Token usage reported by the provider, when it reports any. */
export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** The assistant's reply plus echo of the serving model. */
export interface ChatResult {
  text: string;
  model: string;
  usage?: ChatUsage;
}

/**
 * Static description of one OpenAI-compatible endpoint.
 * `baseURL` is the API root WITHOUT a trailing path operation
 * (this layer appends `/chat/completions` and `/models`).
 */
export interface ProviderPreset {
  /** Stable key used in {@link ChatRequest.provider}. */
  id: string;
  /** Human-readable label for status/CLI output. */
  label: string;
  /** API root, e.g. `https://api.openai.com/v1`. */
  baseURL: string;
  /**
   * Environment variable holding the API key. Empty string means the
   * provider needs no key (local runtimes); such presets never throw
   * for a missing key and send no `Authorization` header.
   */
  apiKeyEnv: string;
  /**
   * Model used when the caller does not pick one. Empty string means
   * "no static default" — the caller MUST supply a model and a failed
   * `/models` fetch throws loudly instead of falling back.
   */
  defaultModel: string;
  /** Whether the vendor offers a free tier (informational only). */
  freeTier?: boolean;
  /** Whether the vendor is known to serve `GET {baseURL}/models`. */
  fetchModels: boolean;
  /**
   * Reasoning effort used when the caller does not specify one. Kept as a
   * plain string like {@link ReasoningEffort} (vendors differ; the server
   * decides what is valid). Absent means "send nothing, take the default".
   */
  defaultReasoningEffort?: ReasoningEffort;
}

/** A model id advertised via (or in place of) `GET {baseURL}/models`. */
export interface ModelInfo {
  name: string;
}

/**
 * A preset with secrets resolved. `apiKey` is `undefined` exactly when
 * the preset needs no key; it is never read from files or CLI args.
 */
export interface ResolvedConfig {
  providerId: string;
  label: string;
  baseURL: string;
  apiKey?: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
}

/** Caller-supplied overrides, used for the `custom` preset. */
export interface ProviderOverrides {
  baseURL?: string;
  apiKeyEnv?: string;
  model?: string;
}
