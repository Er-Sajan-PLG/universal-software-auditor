/**
 * LLM provider layer (outside the deterministic spine: proposes, never decides).
 *
 * IMPLEMENTED: OpenAI-compatible Chat Completions over fetch.
 * PROPOSED (not implemented): Anthropic/Google-native protocols.
 */
export type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ChatUsage,
  ModelInfo,
  ProviderOverrides,
  ProviderPreset,
  ReasoningEffort,
  ResolvedConfig,
} from './types.js';
export {
  ERROR_SNIPPET_LEN,
  PROVIDER_PRESETS,
  REQUEST_TIMEOUT_MS,
  complete,
  listModels,
  loadProviderConfig,
} from './providers.js';
