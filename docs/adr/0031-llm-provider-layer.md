# 31. LLM providers: one compatible transport, presets, no keys in files

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

The live phase (ADR-0030) needs model access with provider choice, tunable
parameters, live model listing, and custom endpoints. The naive design is a
per-provider SDK sprawl — one client per vendor, each with its own auth,
errors, and parameter names. That sprawl would put vendor quirks inside the
agent layer forever, and every new provider would be a new dialect to test.

## Decision

**One OpenAI-compatible Chat Completions transport plus a preset table.**

- `src/agent/providers.ts` speaks a single dialect: POST
  `{baseURL}/chat/completions` with Bearer auth, 60 s timeout, non-2xx
  errors carrying status plus a 200-char body snippet (never key material).
  Optional fields (`temperature`, `max_tokens`, `reasoning_effort`) send ONLY
  when set, so provider defaults apply otherwise.
- `PROVIDER_PRESETS` covers OpenAI, DeepSeek, Groq, Mistral, Together,
  OpenRouter, Ollama and LM Studio (keyless localhost), plus `custom`
  (caller-supplied baseURL/key/model — any vLLM/TGWUI/corporate gateway).
  Anthropic/Google-native transports are explicitly PROPOSED: requesting one
  throws a "PROPOSED, not implemented" error, never a silent wrong-dialect
  call.
- Keys live in environment only (`apiKeyEnv` per preset); a missing key
  throws naming the variable, and the caller disables LLM features loudly.
- `listModels` fetches `GET {baseURL}/models` tolerantly and falls back to
  the preset default — degraded, never an empty guess.

## Rationale

1. **One dialect to test.** The entire transport is 29 stubbed-fetch tests;
   a per-vendor sprawl would multiply that surface without adding capability.
2. **Honest boundaries.** The PROPOSED list is executable documentation: the
   error message _is_ the roadmap entry, so nobody discovers the gap at 2am.
3. **No key handling.** Env-only keys with fail-closed absence keeps secrets
   out of files, logs, and transcripts by construction.

## Consequences

**Good:** provider choice (including local and corporate endpoints) with no
lock-in; live model listing where supported; parameters explicit, never
hidden defaults.

**Bad:** Anthropic/Google-native users wait — the compatible transport does
not serve them, and the throw is the whole story until a native client lands.

**Neutral:** `complete`/`listModels` are async (the only async boundary in
the codebase); everything downstream must treat model output as untrusted
input, per ADR-0030's claim-not-fact contract.
