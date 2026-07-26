import { describe, expect, it, vi } from 'vitest';
import { LlamaCppSemanticInterpreter, LocalSemanticProviderError } from './llamaCpp';
import { validSemanticInterpretation } from './testFixtures';
import type { SemanticInterpretationInput } from './types';

const input: SemanticInterpretationInput = {
  description: 'Distance for a parasol base',
  language: 'en',
  filename: { value: 'distance.stl', certainty: 'uncertain' },
  dimensionsMm: { x: 40, y: 40, z: 8 },
  geometryObservations: ['The mesh is plate-like.'],
  confirmedManufacturingContext: { facts: [] },
};

describe('llama.cpp semantic provider', () => {
  it('calls a configurable mocked local endpoint and validates its completion', async () => {
    const mockedFetch = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      expect(body.messages[0].content).toContain('Never recommend a material');
      expect(body.messages[0].content).toContain('"filename"');
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(validSemanticInterpretation) } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const interpreter = new LlamaCppSemanticInterpreter({
      endpoint: 'http://localhost:9090',
      model: 'qwen-eval',
      fetchImplementation: mockedFetch,
    });
    const result = await interpreter.interpret(input);
    expect(mockedFetch).toHaveBeenCalledWith('http://localhost:9090/v1/chat/completions', expect.objectContaining({ method: 'POST' }));
    expect(result.candidateFacts[0].key).toBe('primary_function');
    expect(interpreter.provider).toMatchObject({ kind: 'llama.cpp', localOnly: true });
  });

  it('rejects non-loopback endpoints before sending user data', () => {
    expect(() => new LlamaCppSemanticInterpreter({ endpoint: 'https://example.com' })).toThrow(LocalSemanticProviderError);
  });

  it('turns unavailable and timed-out local calls into provider errors for manual fallback', async () => {
    const unavailable = new LlamaCppSemanticInterpreter({
      endpoint: 'http://localhost:9090',
      fetchImplementation: vi.fn<typeof fetch>(async () => { throw new TypeError('connection refused'); }),
    });
    await expect(unavailable.interpret(input)).rejects.toThrow(/Cannot reach the local llama.cpp endpoint/);

    const hangingFetch = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const timedOut = new LlamaCppSemanticInterpreter({
      endpoint: 'http://localhost:9090',
      timeoutMs: 1_000,
      fetchImplementation: hangingFetch,
    });
    await expect(timedOut.interpret(input)).rejects.toThrow(/timed out/);
  }, 2_000);

  it('handles an already-cancelled request without treating it as a timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    const interpreter = new LlamaCppSemanticInterpreter({
      endpoint: 'http://localhost:9090',
      fetchImplementation: vi.fn<typeof fetch>(async (_url, init) => {
        if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        return new Response();
      }),
    });
    await expect(interpreter.interpret(input, controller.signal)).rejects.toThrow(/cancelled/);
  });
});
