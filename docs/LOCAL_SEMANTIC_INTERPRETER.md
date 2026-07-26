# Local Semantic Interpreter v3

Local Semantic Interpreter v3 lets Check Make ask a locally running `llama.cpp` server to convert English free text into the same schema-validated semantic hypotheses used by cloud Extended AI Analysis. It keeps the printed object separate from its surrounding product or assembly, so a phrase such as “spacer for camping chair” can produce reviewable parent-system assumptions without claiming that every chair component carries a person. It is deliberately separated from material selection and the deterministic rules engine.

## Trust boundary

- The model receives user text, language, an explicitly uncertain filename clue, dimensions, deterministic geometry observations, and already confirmed manufacturing context.
- It does not receive raw STL/3MF/OBJ bytes or rendered images in this iteration.
- The output vocabulary is versioned and closed. Unknown fields, keys, and values are rejected.
- Model confidence never activates a rule.
- A fact can enter `ManufacturingIntent` only when it is either:
  - marked `explicit`, grounded by a verbatim excerpt that occurs in the user's description, non-conflicting, and uniquely valued; or
  - explicitly confirmed by the user in Check Make.
- Material and process settings remain deterministic rule outputs.
- Only loopback endpoints (`localhost`, `127.0.0.1`, or `::1`) are accepted by the local provider.

If the endpoint is unavailable, times out, is cancelled, or returns invalid output, Check Make reports the error and falls back to its existing manual/local preliminary flow.

## Start a compatible local server

Install `llama.cpp` separately. Check Make does not download a model or bundle `llama.cpp`.

With a local GGUF file:

```bash
llama-server \
  --model /absolute/path/to/model.gguf \
  --host 127.0.0.1 \
  --port 8080 \
  --alias local-model
```

For a development evaluation using the official Qwen3 4B GGUF repository:

```bash
llama-server \
  -hf Qwen/Qwen3-4B-GGUF:Q4_K_M \
  --host 127.0.0.1 \
  --port 8080 \
  --alias local-model
```

The server exposes the OpenAI-compatible `POST /v1/chat/completions` route. In Check Make:

1. Open Application Settings.
2. Open **Application Settings**, set **Extended AI location** to **Local AI**, and select **Extended AI Analysis** as the analysis mode.
3. Keep the endpoint at `http://localhost:8080`, or enter another loopback address.
4. Set the loaded model alias to `local-model`.
5. Select **Extended AI Analysis** in the project Analysis card and inspect the model.

The `llama.cpp` server and the official Qwen GGUF candidate are documented at:

- <https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md>
- <https://huggingface.co/Qwen/Qwen3-4B-GGUF>

Qwen3 4B Q4_K_M is an evaluation candidate, not a product dependency or validated winner.

## Automated verification

```bash
npm test
npm run build
npm run semantic:acceptance
npm run semantic:providers
```

The automated suite verifies:

- strict schema and vocabulary rejection,
- grounded-explicit and user-confirmed promotion,
- the rule-engine confirmation gate,
- loopback-only endpoint policy,
- timeout, cancellation, unavailable endpoint, and malformed-output handling,
- an OpenAI-compatible mocked llama.cpp endpoint,
- eval-corpus structure and vocabulary coverage.

The live-model corpus is `validation/semantic/local-semantic-v1-corpus.json` (the historical filename is retained so existing validation commands keep working). It is English-only. The deterministic v3.7 coverage corpus adds at least 100 phrasings across 20 common functional object families. Expectations are typed facts, conflicts, abstention, and semantic equivalence—not exact prose.

`semantic:acceptance` runs the release-oriented deterministic matrix: 30 varied descriptions and 133 identity, function, requirement, conflict, abstention, and safety-question checks. `semantic:providers` scores the smaller provider-neutral corpus against deterministic Local Analysis and, when available, a running llama.cpp server and OpenAI. Missing providers are reported as **unavailable**, never passed.

These checks do **not** establish the real quality of Qwen3 4B or any other local model. A separate benchmark run must execute every corpus case against real model builds and record accuracy, false promotion risk, latency, memory, and hardware.

With a real server running, execute the checked-in corpus with:

```bash
CHECK_MAKE_LLAMA_ENDPOINT=http://localhost:8080 \
CHECK_MAKE_LLAMA_MODEL=local-model \
npm run semantic:eval
```

To compare all available providers:

```bash
CHECK_MAKE_LLAMA_ENDPOINT=http://localhost:8080 \
CHECK_MAKE_LLAMA_MODEL=local-model \
OPENAI_API_KEY=... \
CHECK_MAKE_OPENAI_MODEL=gpt-5.4-mini \
npm run semantic:providers
```

This live command is intentionally separate from `npm test`; a mocked endpoint verifies integration deterministically, while `semantic:eval` measures the selected model and machine.

## Deliberately deferred

- benchmark runner and model-selection evidence,
- automatic model download and integrity verification,
- bundled `llama.cpp` Tauri sidecar and lifecycle management,
- Windows packaging, firewall, acceleration, and installer validation,
- local vision/image analysis,
- Ollama and MLX adapters,
- cloud proxy, accounts, and payment,
- any new material rules or automatic activation of AI hypotheses.
