# Check Make 0.2 Desktop MVP

## Product contract

Check Make begins with the model. It must not require the user to describe an object before analysis. Geometry and optional AI produce a transparent hypothesis; the user is asked only for missing information that can materially change the manufacturing decision.

The AI layer may infer object class, likely purpose, relevant loads, uncertainty, and questions. Deterministic code remains responsible for geometry metrics, printer capability validation, rule merging, safe ranges, and 3MF package construction.

## Three-stage workflow

1. **Import model:** native drop/Browse and choice of local or connected AI analysis.
2. **Interpretation and requirement closure:** model preview, mesh evidence, object/purpose hypothesis, confidence, and up to seven structured consequential questions. The set is recalculated after each answer round, so already resolved fields are not asked again.
3. **Create 3MF:** review manufacturing parameters and export a Core 3MF with baked orientation and embedded Check Make metadata.

## Acceptance status

- Complete: duplicate internal title bar removed.
- Complete: `.icns` is explicitly bundled and referenced by `CFBundleIconFile`.
- Complete: native window drag/drop listener with DOM fallback and visible hover state.
- Complete: deterministic preliminary object-family analysis.
- Complete: optional OpenAI Responses API integration using a labelled four-view montage, deterministic mesh context, structured requirement status, evidence, and confidence.
- Complete: adaptive structured questions, provider-neutral result schema, and deterministic readiness gating. Review and export remain unavailable until every decision-changing requirement is confirmed, explicitly not applicable, or supported by a sufficiently confident evidenced inference.
- Complete: deterministic recommendation and printer compatibility validation.
- Complete: Core 3MF package generation and package-level Rust test.
- Placeholder: Claude API provider, local Ollama/MLX provider, multi-view renders, advanced topology analysis, and full mesh repair.
- Complete for listed supported printers: Bambu Studio, OrcaSlicer, PrusaSlicer, UltiMaker Cura, and Creality Print project adapters with a generic Core 3MF fallback.

## Product roadmap status

- Priority 1 complete: broader STL, 3MF, and OBJ import handling plus slicer export adapters.
- Priority 2 complete for the current scope: connected mesh regions, topology findings, overhang regions, orientation comparison, and risk visualization.
- Priority 3 release slice complete for 0.2.5: clearer and smarter result presentation. Material upgrades, toolpath-aware cost/weight estimates, quantified alternative deltas, and final result-view polish are explicitly deferred in the roadmap.

The first Priority 3 vertical slice provides one review-required recommendation, a key-settings view, grouped full settings, visible assumptions, and opt-in technical evidence. It intentionally avoids presenting a second summary plan that can drift from the detailed settings.

The second slice adds objective alternatives through a separate optimization context. **Faster** and **Strength / performance** are actionable because Check Make can re-run evidence-linked objective rules while retaining the same use, load, environment, and printer context. **Lower cost** and **Lower weight** are temporarily removed because launching OrcaSlicer for background estimates proved unstable. Check Make will not replace actual toolpath quantities with bounding-box or solid-mesh estimates that omit walls, infill, shells, support, and brim.

Interpretation v2 no longer treats every raw `unknown` field as a warning. Each requirement carries `confirmed`, `inferred`, `assumed`, `not_applicable`, or `unknown` status plus source, evidence, confidence, and affected recommendation categories. Check Make asks structured questions for purpose, priority, load, impact, environment, heat, and support allowance only while they remain consequential and unresolved. Answers update the exact fields consumed by the deterministic rule engine; free-text keyword interpretation remains only a compatibility fallback.

The user is not expected to perform a physical validation programme. Once requirements are complete, Check Make may issue a conservative rule-based plan. Reducing walls, infill, or shell thickness is an evidence-gated optimization: if Check Make lacks locally verified, scope-matched performance observations, it explicitly withholds that reduction instead of asking the user to prove it or silently guessing.

## Safety and trust

- AI statements are hypotheses, never hidden facts.
- Confidence and evidence are visible.
- The OpenAI key is held only in process memory.
- Failed AI requests fall back to local analysis and show the error.
- Export never claims structural simulation or universal slicer-setting portability.
