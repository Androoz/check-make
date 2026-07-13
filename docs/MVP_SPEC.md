# Check Make 0.2 Desktop MVP

## Product contract

Check Make begins with the model. It must not require the user to describe an object before analysis. Geometry and optional AI produce a transparent hypothesis; the user is asked only for missing information that can materially change the manufacturing decision.

The AI layer may infer object class, likely purpose, relevant loads, uncertainty, and questions. Deterministic code remains responsible for geometry metrics, printer capability validation, rule merging, safe ranges, and 3MF package construction.

## Three-stage workflow

1. **Import model:** native drop/Browse and choice of local or connected AI analysis.
2. **AI analysis:** model preview, mesh evidence, object/purpose hypothesis, confidence, and at most three consequential follow-up questions.
3. **Create 3MF:** review manufacturing parameters and export a Core 3MF with baked orientation and embedded Check Make metadata.

## Acceptance status

- Complete: duplicate internal title bar removed.
- Complete: `.icns` is explicitly bundled and referenced by `CFBundleIconFile`.
- Complete: native window drag/drop listener with DOM fallback and visible hover state.
- Complete: deterministic preliminary object-family analysis.
- Complete: optional OpenAI Responses API integration using one rendered view and mesh context.
- Complete: uncertainty questions and provider-neutral result schema.
- Complete: deterministic recommendation and printer compatibility validation.
- Complete: Core 3MF package generation and package-level Rust test.
- Placeholder: Claude API provider, local Ollama/MLX provider, multi-view renders, advanced topology analysis, and full mesh repair.
- Placeholder: slicer-specific setting adapters.

## Safety and trust

- AI statements are hypotheses, never hidden facts.
- Confidence and evidence are visible.
- The OpenAI key is held only in process memory.
- Failed AI requests fall back to local analysis and show the error.
- Export never claims structural simulation or universal slicer-setting portability.
