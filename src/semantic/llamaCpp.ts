import { semanticJsonSchema, semanticOutputSchemaDescription, validateSemanticInterpretation } from './schema';
import type {
  SemanticInterpretation,
  SemanticInterpretationInput,
  SemanticInterpreter,
  SemanticProviderInfo,
} from './types';

export interface LlamaCppInterpreterOptions {
  endpoint: string;
  model?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

export class LocalSemanticProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalSemanticProviderError';
  }
}

function localEndpoint(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new LocalSemanticProviderError('The local AI endpoint is not a valid URL.'); }
  const host = url.hostname.toLocaleLowerCase('en-US');
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new LocalSemanticProviderError('The local Extended AI provider only accepts a loopback endpoint (localhost, 127.0.0.1, or ::1).');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new LocalSemanticProviderError('The local AI endpoint must use HTTP or HTTPS.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function chatEndpoint(endpoint: string) {
  const url = localEndpoint(endpoint);
  if (!url.pathname || url.pathname === '/') url.pathname = '/v1/chat/completions';
  else if (!url.pathname.endsWith('/v1/chat/completions')) url.pathname = `${url.pathname}/v1/chat/completions`;
  return url.toString();
}

function prompt(input: SemanticInterpretationInput) {
  return [
    'You are Check Make Local Semantic Interpreter v3.',
    'Build the most coherent semantic interpretation you can from the description, filename clue, geometry observations, and ordinary world knowledge.',
    'Keep the printed object separate from its parent product or assembly. Use parentSystem for the surrounding product, then infer reviewable service assumptions from how that product is normally used.',
    'Never recommend a material, printer, orientation, slicer setting, wall count, infill, temperature, or process parameter.',
    'Do not claim that geometry proves an object identity or use. Filename is always an uncertain clue.',
    'Do not wait for exact keywords. Infer likely object identity, function, environment, load pattern, impact exposure, heat exposure, interface, appearance needs, and priority when the combined evidence supports a useful assumption.',
    'Use world knowledge as strong_hypothesis or weak_hypothesis, basis world_knowledge or combined, and needsConfirmation true. State the reasoning in evidence so the user can review it.',
    'Use certainty explicit only when a short verbatim quote in the user description directly states the fact. Put that quote in evidence.',
    'Use unknown only when multiple materially different interpretations remain plausible or when an assumption would concern safety, food contact, chemical compatibility, or a precise load or temperature. Preserve negations and report conflicts.',
    'Return exactly one JSON object. Do not use markdown. Do not add fields or vocabulary values.',
    `Required output contract: ${JSON.stringify(semanticOutputSchemaDescription)}.`,
    `Input: ${JSON.stringify(input)}.`,
  ].join('\n');
}

function completionText(value: unknown) {
  if (!value || typeof value !== 'object') throw new LocalSemanticProviderError('llama.cpp returned a non-object response.');
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) throw new LocalSemanticProviderError('llama.cpp returned no completion choices.');
  const message = (choices[0] as { message?: unknown }).message;
  const content = message && typeof message === 'object' ? (message as { content?: unknown }).content : undefined;
  if (typeof content !== 'string' || !content.trim()) throw new LocalSemanticProviderError('llama.cpp returned an empty completion.');
  return content.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
}

export class LlamaCppSemanticInterpreter implements SemanticInterpreter {
  readonly provider: SemanticProviderInfo;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: LlamaCppInterpreterOptions) {
    const endpoint = localEndpoint(options.endpoint).toString().replace(/\/$/, '');
    this.provider = { kind: 'llama.cpp', endpoint, model: options.model?.trim() || 'local-model', localOnly: true };
    this.timeoutMs = Math.max(1_000, Math.min(120_000, options.timeoutMs ?? 30_000));
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async interpret(input: SemanticInterpretationInput, signal?: AbortSignal): Promise<SemanticInterpretation> {
    const timeoutController = new AbortController();
    const abort = () => timeoutController.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = globalThis.setTimeout(() => timeoutController.abort('timeout'), this.timeoutMs);
    try {
      const response = await this.fetchImplementation(chatEndpoint(this.provider.endpoint), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.provider.model,
          temperature: 0,
          response_format: { type: 'json_schema', schema: semanticJsonSchema },
          messages: [{ role: 'user', content: prompt(input) }],
        }),
        signal: timeoutController.signal,
      });
      if (!response.ok) throw new LocalSemanticProviderError(`Local llama.cpp endpoint returned HTTP ${response.status}.`);
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new LocalSemanticProviderError('Local llama.cpp endpoint returned invalid JSON.'); }
      let parsed: unknown;
      try { parsed = JSON.parse(completionText(payload)); } catch (reason) {
        if (reason instanceof LocalSemanticProviderError) throw reason;
        throw new LocalSemanticProviderError('The local model response was not valid JSON.');
      }
      return validateSemanticInterpretation(parsed);
    } catch (reason) {
      if (reason instanceof LocalSemanticProviderError) throw reason;
      if (timeoutController.signal.aborted) {
        throw new LocalSemanticProviderError(signal?.aborted ? 'Local Extended AI analysis was cancelled.' : `Local Extended AI analysis timed out after ${this.timeoutMs} ms.`);
      }
      throw new LocalSemanticProviderError(`Cannot reach the local llama.cpp endpoint: ${String(reason)}`);
    } finally {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}
