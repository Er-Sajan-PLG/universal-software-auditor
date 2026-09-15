import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PROVIDER_PRESETS,
  REQUEST_TIMEOUT_MS,
  complete,
  listModels,
  loadProviderConfig,
} from '../../src/agent/providers.js';

const FAKE_KEY = 'test-fake-key-12345';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function chatPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'chatcmpl-test',
    model: 'gpt-4o-mini',
    choices: [{ message: { role: 'assistant', content: 'hello from stub' } }],
    usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    ...overrides,
  };
}

interface SeenRequest {
  url: string;
  init: RequestInit;
}

function installFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): void {
  vi.stubGlobal('fetch', (async (url: unknown, init?: RequestInit) =>
    handler(String(url), init ?? {})) as typeof fetch);
}

function captureFetch(response: Response | ((url: string, init: RequestInit) => Response)): {
  seen: SeenRequest[];
} {
  const seen: SeenRequest[] = [];
  installFetch((url, init) => {
    seen.push({ url, init });
    return typeof response === 'function' ? response(url, init) : response;
  });
  return { seen };
}

function header(init: RequestInit, name: string): string | null {
  const h = init.headers as Record<string, string>;
  return h[name] ?? null;
}

beforeEach(() => {
  // NO network: any fetch without an explicit test double fails loudly.
  installFetch((url) => {
    throw new Error(`real network egress blocked in tests: ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env['OPENAI_API_KEY'];
  delete process.env['DEEPSEEK_API_KEY'];
  delete process.env['GROQ_API_KEY'];
  delete process.env['MISTRAL_API_KEY'];
  delete process.env['TOGETHER_API_KEY'];
  delete process.env['OPENROUTER_API_KEY'];
  delete process.env['CUSTOM_TEST_API_KEY'];
});

describe('preset table sanity', () => {
  const EXPECTED_IDS = [
    'openai',
    'deepseek',
    'groq',
    'mistral',
    'nvidia',
    'together',
    'openrouter',
    'ollama',
    'lmstudio',
    'google',
    'custom',
  ];

  it('google preset points at the Gemini OpenAI-compatibility endpoint', () => {
    const google = PROVIDER_PRESETS['google'];
    expect(google?.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta/openai/');
    expect(google?.apiKeyEnv).toBe('GEMINI_API_KEY');
    expect(google?.defaultModel).toBe('gemini-3.5-flash');
    expect(google?.defaultReasoningEffort).toBeUndefined();
    expect(google?.fetchModels).toBe(true);
  });

  it('nvidia preset points at NIM with max reasoning', () => {
    const nvidia = PROVIDER_PRESETS['nvidia'];
    expect(nvidia?.baseURL).toBe('https://integrate.api.nvidia.com/v1');
    expect(nvidia?.apiKeyEnv).toBe('NVIDIA_API_KEY');
    expect(nvidia?.defaultModel).toBe('nvidia/nemotron-3-ultra-550b-a55b');
    expect(nvidia?.defaultReasoningEffort).toBe('high');
    expect(nvidia?.fetchModels).toBe(true);
  });

  it('contains exactly the expected provider ids, each unique and self-keyed', () => {
    expect(Object.keys(PROVIDER_PRESETS).sort()).toEqual([...EXPECTED_IDS].sort());
    for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
      expect(preset.id).toBe(key);
    }
    expect(new Set(Object.values(PROVIDER_PRESETS).map((p) => p.id)).size).toBe(
      EXPECTED_IDS.length,
    );
  });

  it('baseURLs are https, except localhost runtimes and custom (caller-supplied)', () => {
    for (const preset of Object.values(PROVIDER_PRESETS)) {
      if (preset.id === 'custom') {
        expect(preset.baseURL).toBe('');
        continue;
      }
      const isHttps = preset.baseURL.startsWith('https://');
      const isLocalhost = preset.baseURL.startsWith('http://localhost');
      expect(
        isHttps || isLocalhost,
        `${preset.id}: baseURL must be https or localhost, got ${preset.baseURL}`,
      ).toBe(true);
    }
  });

  it('every preset needs a key except local runtimes and custom', () => {
    expect(PROVIDER_PRESETS['openai']?.apiKeyEnv).toBe('OPENAI_API_KEY');
    expect(PROVIDER_PRESETS['ollama']?.apiKeyEnv).toBe('');
    expect(PROVIDER_PRESETS['lmstudio']?.apiKeyEnv).toBe('');
    expect(PROVIDER_PRESETS['custom']?.apiKeyEnv).toBe('');
    for (const id of [
      'deepseek',
      'groq',
      'mistral',
      'nvidia',
      'together',
      'openrouter',
      'google',
    ]) {
      expect(PROVIDER_PRESETS[id]?.apiKeyEnv, id).toMatch(/_KEY$/);
    }
  });

  it('every preset has a static default model except custom (caller-supplied)', () => {
    for (const preset of Object.values(PROVIDER_PRESETS)) {
      if (preset.id === 'custom') {
        expect(preset.defaultModel).toBe('');
        continue;
      }
      expect(preset.defaultModel.length, preset.id).toBeGreaterThan(0);
    }
  });

  it('every preset declares fetchModels as a boolean', () => {
    for (const preset of Object.values(PROVIDER_PRESETS)) {
      expect(typeof preset.fetchModels, preset.id).toBe('boolean');
    }
  });
});

describe('loadProviderConfig', () => {
  it('missing key throws fail-closed naming the variable', () => {
    delete process.env['OPENAI_API_KEY'];
    expect(() => loadProviderConfig('openai')).toThrow(/OPENAI_API_KEY/);
  });

  it('resolves key, baseURL, and model from env + preset', () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    const cfg = loadProviderConfig('openai');
    expect(cfg).toMatchObject({
      providerId: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: FAKE_KEY,
      model: 'gpt-4o-mini',
    });
  });

  it('strips trailing slashes from baseURL overrides', () => {
    process.env['CUSTOM_TEST_API_KEY'] = FAKE_KEY;
    const cfg = loadProviderConfig('custom', {
      baseURL: 'https://gateway.example.com/v1///',
      apiKeyEnv: 'CUSTOM_TEST_API_KEY',
      model: 'corp-model',
    });
    expect(cfg.baseURL).toBe('https://gateway.example.com/v1');
    expect(cfg.apiKey).toBe(FAKE_KEY);
    expect(cfg.model).toBe('corp-model');
  });

  it('local runtimes resolve without any key and send no auth', () => {
    const cfg = loadProviderConfig('ollama');
    expect(cfg.apiKey).toBeUndefined();
  });

  it('unknown provider ids throw loudly', () => {
    expect(() => loadProviderConfig('nope')).toThrow(/Unknown LLM provider "nope"/);
  });

  it('PROPOSED native transports (anthropic/vertex/bedrock) throw "not implemented"', () => {
    for (const id of ['anthropic', 'vertex', 'bedrock']) {
      expect(() => loadProviderConfig(id)).toThrow(/PROPOSED, not implemented/);
    }
  });

  it('the retired gemini alias guides to google', () => {
    expect(() => loadProviderConfig('gemini')).toThrow(/Unknown LLM provider "gemini"/);
  });

  it('custom without caller baseURL/model throws loudly', () => {
    expect(() => loadProviderConfig('custom')).toThrow(/no baseURL/);
    expect(() => loadProviderConfig('custom', { baseURL: 'https://x.example.com/v1' })).toThrow(
      /no default model/,
    );
  });
});

describe('complete', () => {
  it('posts body + auth headers to {baseURL}/chat/completions', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    const { seen } = captureFetch(jsonResponse(chatPayload()));
    const result = await complete({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.5,
      maxTokens: 10,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(seen[0]?.init.method).toBe('POST');
    expect(header(seen[0]?.init ?? {}, 'Content-Type')).toBe('application/json');
    expect(header(seen[0]?.init ?? {}, 'Authorization')).toBe(`Bearer ${FAKE_KEY}`);
    const body = JSON.parse(String(seen[0]?.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.5,
      max_tokens: 10,
    });
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(result).toMatchObject({
      text: 'hello from stub',
      model: 'gpt-4o-mini',
      usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 },
    });
  });

  it('enforces the 60s timeout via AbortSignal.timeout', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    const spy = vi.spyOn(AbortSignal, 'timeout');
    const { seen } = captureFetch(jsonResponse(chatPayload()));
    await complete({ provider: 'openai', model: 'gpt-4o-mini', messages: [] });
    expect(spy).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
    expect(REQUEST_TIMEOUT_MS).toBe(60_000);
    expect(seen[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends reasoning_effort only when reasoningEffort is set', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    const { seen } = captureFetch(() => jsonResponse(chatPayload()));
    await complete({ provider: 'openai', model: 'gpt-4o-mini', messages: [] });
    expect(JSON.parse(String(seen[0]?.init.body))).not.toHaveProperty('reasoning_effort');

    await complete({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [],
      reasoningEffort: 'high',
    });
    expect(JSON.parse(String(seen[1]?.init.body))).toMatchObject({ reasoning_effort: 'high' });
  });

  it('preset reasoning default rides along; explicit per-request effort wins', async () => {
    process.env['NVIDIA_API_KEY'] = FAKE_KEY;
    const { seen } = captureFetch(() => jsonResponse(chatPayload()));
    await complete({
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [],
    });
    expect(JSON.parse(String(seen[0]?.init.body))).toMatchObject({ reasoning_effort: 'high' });

    await complete({
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [],
      reasoningEffort: 'low',
    });
    expect(JSON.parse(String(seen[1]?.init.body))).toMatchObject({ reasoning_effort: 'low' });
  });

  it('omits temperature/max_tokens when unset (provider defaults apply)', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    const { seen } = captureFetch(jsonResponse(chatPayload()));
    await complete({ provider: 'openai', model: 'gpt-4o-mini', messages: [] });
    const body = JSON.parse(String(seen[0]?.init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('local runtimes send no Authorization header', async () => {
    const { seen } = captureFetch(jsonResponse(chatPayload({ model: 'llama3.1' })));
    await complete({ provider: 'ollama', model: 'llama3.1', messages: [] });
    expect(seen[0]?.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(header(seen[0]?.init ?? {}, 'Authorization')).toBeNull();
  });

  it('maps HTTP errors to Error with status + body snippet, never key material', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    captureFetch(new Response('invalid api key provided', { status: 401 }));
    const err = await complete({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [],
    }).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('HTTP 401');
    expect(err.message).toContain('invalid api key provided');
    expect(err.message).not.toContain(FAKE_KEY);
  });

  it('truncates long error bodies to a snippet', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    captureFetch(new Response('x'.repeat(500), { status: 500 }));
    const err = await complete({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [],
    }).catch((e: unknown) => e as Error);
    expect(err.message).toContain('HTTP 500');
    expect(err.message).toContain('x'.repeat(200));
    expect(err.message).not.toContain('x'.repeat(201));
  });

  it('throws loudly when the response has no content string', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    captureFetch(jsonResponse({ model: 'gpt-4o-mini', choices: [] }));
    await expect(
      complete({ provider: 'openai', model: 'gpt-4o-mini', messages: [] }),
    ).rejects.toThrow(/no choices\[0\]\.message\.content/);
  });

  it('falls back to the requested model when the response omits it', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    const payload = chatPayload();
    delete payload['model'];
    delete payload['usage'];
    captureFetch(jsonResponse(payload));
    const result = await complete({ provider: 'openai', model: 'gpt-4o-mini', messages: [] });
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.usage).toBeUndefined();
  });

  it('never touches real network: the egress guard rejects', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    await expect(
      complete({ provider: 'openai', model: 'gpt-4o-mini', messages: [] }),
    ).rejects.toThrow(/egress blocked/);
  });
});

describe('listModels', () => {
  it('parses the OpenAI {data:[{id}]} shape and sends auth', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    const { seen } = captureFetch(
      jsonResponse({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }),
    );
    const models = await listModels('openai');
    expect(models).toEqual([{ name: 'gpt-4o' }, { name: 'gpt-4o-mini' }]);
    expect(seen[0]?.url).toBe('https://api.openai.com/v1/models');
    expect(seen[0]?.init.method).toBe('GET');
    expect(header(seen[0]?.init ?? {}, 'Authorization')).toBe(`Bearer ${FAKE_KEY}`);
  });

  it('tolerates {name} items, bare arrays, and string items', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    const { seen } = captureFetch(jsonResponse({ data: [{ name: 'm1' }, { id: 'm2' }] }));
    expect(await listModels('openai')).toEqual([{ name: 'm1' }, { name: 'm2' }]);
    expect(seen).toHaveLength(1);

    captureFetch(jsonResponse(['a', 'b', 'a']));
    expect(await listModels('openai')).toEqual([{ name: 'a' }, { name: 'b' }]);
  });

  it('falls back to the static default on fetch failure (degraded, never empty)', async () => {
    process.env['GROQ_API_KEY'] = FAKE_KEY;
    installFetch(() => {
      throw new Error('boom');
    });
    expect(await listModels('groq')).toEqual([{ name: 'llama-3.3-70b-versatile' }]);
  });

  it('falls back on HTTP errors and empty lists', async () => {
    process.env['OPENAI_API_KEY'] = FAKE_KEY;
    captureFetch(new Response('nope', { status: 500 }));
    expect(await listModels('openai')).toEqual([{ name: 'gpt-4o-mini' }]);

    captureFetch(jsonResponse({ data: [] }));
    expect(await listModels('openai')).toEqual([{ name: 'gpt-4o-mini' }]);
  });

  it('missing key throws loudly instead of falling back', async () => {
    delete process.env['OPENAI_API_KEY'];
    await expect(listModels('openai')).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('custom without config throws loudly (no static list to fall back to)', async () => {
    await expect(listModels('custom')).rejects.toThrow(/no baseURL/);
  });

  it('custom with caller config lists via the supplied endpoint', async () => {
    process.env['CUSTOM_TEST_API_KEY'] = FAKE_KEY;
    const { seen } = captureFetch(jsonResponse({ data: [{ id: 'corp-1' }] }));
    const models = await listModels('custom', {
      baseURL: 'https://gateway.example.com/v1',
      apiKeyEnv: 'CUSTOM_TEST_API_KEY',
      model: 'corp-1',
    });
    expect(models).toEqual([{ name: 'corp-1' }]);
    expect(seen[0]?.url).toBe('https://gateway.example.com/v1/models');
  });
});
