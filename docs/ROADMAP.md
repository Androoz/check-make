# Check Make roadmap

## Priority 3 — clearer and smarter results

Check Make 0.2.5 established one coherent Recommended plan, adaptive requirement questions, deterministic readiness gating, compact key/all-settings presentation, and technical evidence on demand. The 0.2.6 preference slice adds versioned application defaults and project overrides for Balanced, Faster, Visual quality, Fit & accuracy, and Structural margin, all derived from the same Balanced baseline.

The following work is deliberately deferred beyond 0.2.5 rather than blocking the release:

- [ ] Add printer-compatible material upgrade candidates to Strength / performance, supported by reviewed product-specific material profiles.
- [ ] Reintroduce Lower cost and Lower weight only with a stable toolpath-aware estimator that accounts for walls, infill, shells, support, and brim without launching an external slicer in the background.
- [x] Expose supported non-cost preferences with deterministic setting deltas, explicit blockers, application defaults, project overrides, and persistence in Check Make projects and export metadata.
- [ ] Compare every alternative against Recommended with consistent deltas for print time, material use, finished mass, estimated cost, and the affected performance assumptions.
- [ ] Add scoped external evidence before allowing an optimization to reduce walls, infill, or shell thickness while claiming equivalent performance.
- [ ] Complete the final result-view usability pass and automated smoke coverage for the full import → interpretation → recommendation → export path.

These are retained as Priority 3 follow-up items. They are not represented as implemented capabilities in 0.2.5.

## Interpretation v3 — object and context understanding

Interpretation v3 is a cross-cutting prerequisite for Priority 4. More advanced material and process alternatives must not amplify a weak interpretation of the object or the user's Context description.

### Context understanding

- [x] Start phrase-aware deterministic interpretation with explicit evidence per inferred manufacturing requirement.
- [x] Keep ambiguous or conflicting requirements unresolved instead of choosing a convenient keyword match.
- [x] Recognize common English negations for decision-changing phrases. Swedish-language interpretation is outside the Check Make product scope.
- [x] Interpret explicit Celsius values and ranges into the existing normal, warm, and hot requirement bands.
- [x] Expand the English controlled vocabulary for UV, water, moisture, chemicals, food contact, fatigue, load direction, fit type, critical surfaces, intended lifetime, and safety consequence.
- [x] Add reviewed English compound, inflection, and typo normalization without allowing loose fuzzy matches to confirm safety-relevant requirements.
- [x] Separate object function, operating environment, desired property, failure consequence, and manufacturing preference in the interpretation result.
- [x] Surface conflicts and ambiguous phrases beside the Context field and turn them into targeted follow-up questions.

### Object understanding

- [x] Combine available mesh proportions, topology/components, filename metadata, Context text, and optional multi-view AI evidence into one object hypothesis. Hole, thread, local-feature, and wall-thickness classification remain explicitly marked as not evaluated rather than inferred.
- [x] Record provenance and confidence separately for geometry observations, topology/components, user statements, filename clues, deterministic language matches, and AI hypotheses.
- [x] Distinguish an object's identity from its purpose; neither is treated as confirmed solely because the other is known.
- [x] Extend the Context-backed mating-feature, mechanical-demand, and critical-surface hypotheses with geometric localization of mating features, load-bearing regions, visible surfaces, and critical thin features. Interpretation v3.5 uses deterministic candidates plus explicit user confirmation; it remains a risk and relevance assessment rather than structural simulation.
- [x] Ask the user to confirm or reject consequential AI object-purpose hypotheses before those hypotheses can affect material, orientation, or structure. Explicit Context statements remain user-sourced evidence; unconfirmed hypotheses remain explanatory only.

### Validation and acceptance

- [x] Add deterministic English regression cases for negation, explicit temperature, conflicting statements, inflections, compounds, and reviewed typo variants.
- [x] Build a versioned English Context corpus with expected inferences, expected unknowns, corrections, safety cues, and required follow-up questions.
- [x] Add versioned broad object-family reference cases with expected geometry evidence and allowed hypothesis ranges.
- [x] Measure false-confirmation rate separately from coverage; missing an inference is safer than confirming the wrong manufacturing requirement.
- [x] Preserve user confirmations and corrections in the saved Check Make project without automatically turning them into shared rules.

### Interpretation v3.4 — decision bridge

- [x] Introduce one versioned `ManufacturingIntent` contract for function, environment, temperature, mechanical demand, interfaces, critical surfaces, failure consequence, lifetime, and manufacturing preferences.
- [x] Preserve status, confidence, provenance, and evidence IDs for every intent fact that can affect a manufacturing decision.
- [x] Make the deterministic rule engine consume `ManufacturingIntent`; remove the legacy raw-purpose keyword parser from the rule-evaluation path.
- [x] Gate semantic rule values so hypothesized, conflicted, or rejected facts cannot activate manufacturing rules.
- [x] Generate targeted questions for conflicting fit types, unspecified chemical exposure, food contact, and safety-critical use.
- [x] Abstain from exportable recommendations when confirmed safety-critical, food-contact, or chemical-compatibility requirements exceed the connected evidence scope.
- [x] Pass confirmed intent constraints into orientation comparison. Support-free intent changes scoring; load direction, mating geometry, and critical surfaces remain explicitly unresolved until localized on the mesh.
- [x] Attach interpretation evidence IDs to matched-rule traces and expose them in the technical recommendation details.
- [x] Add end-to-end regression cases for outdoor/UV, snap fit and visible surfaces, repeated bending, vague heat/sun Context, and safety-critical abstention.

The remaining object-understanding item above is intentionally not closed by v3.4: geometric localization or user marking of load axes, mating faces, visible faces, and critical thin regions is required before those constraints may influence orientation beyond the support-free weighting.

### Interpretation v3.5 — spatial manufacturing intent

Interpretation v3.5 closes the remaining object-understanding gap without presenting heuristic geometry as structural simulation. Geometry analysis may propose spatial candidates, but only user-confirmed regions and directions may change deterministic manufacturing decisions.

#### 3.5a — spatial contract and persistence

- [x] Add a versioned spatial-intent contract for load axes, load-bearing regions, mating surfaces, visible surfaces, and critical thin regions.
- [x] Preserve status, confidence, provenance, evidence IDs, source-mesh coordinates, and stable triangle references for every spatial fact.
- [x] Save and restore confirmed spatial intent in Check Make projects without promoting project-specific confirmation into a shared rule.

#### 3.5b — deterministic candidate analysis

- [x] Generate explainable planar-surface candidates from mesh connectivity, area, normal, and location.
- [x] Generate conservative local-thickness candidates where opposing mesh intersections provide a usable estimate; report unevaluated coverage rather than filling gaps.
- [x] Offer model-space axis choices for confirmed mechanical demand without inferring where force is applied from object appearance alone.

#### 3.5c — 3D confirmation workflow

- [x] Visualize proposed and confirmed functional regions directly on the model.
- [x] Let users mark or replace mating, visible, load-bearing, and critical-thin regions by selecting model faces.
- [x] Let users confirm a model-space load axis and show which evidence-backed requirement makes the localization consequential.

#### 3.5d — decision integration and validation

- [x] Allow only confirmed spatial intent to affect orientation scoring and deterministic rule traces.
- [x] Keep export blocked when a confirmed consequential requirement still needs spatial localization, while allowing users to explicitly state that localization is not applicable.
- [x] Store spatial evidence in exported Check Make metadata and add end-to-end regressions for persistence, gating, orientation effects, rejected candidates, and legacy projects without spatial data.

#### 3.5e — user-facing constraints and important areas

- [x] Treat removable supports as a geometry-driven recommendation rather than a mandatory permission question.
- [x] Keep support out of the initial Context form unless the user states a support constraint naturally.
- [x] Present Check Make's geometry-driven support assessment in step 2, let the user override it there, and immediately recalculate orientation and process settings.
- [x] Evaluate support need against the selected orientation rather than the imported orientation.
- [x] Consolidate Functional Regions and Important Model Areas into one **Important areas** workflow that explains how each marked region changes orientation, support/seam contact, or wall strategy.
- [x] Consolidate Local Semantic AI and OpenAI vision into **Extended AI Analysis**; choose its local or cloud provider in Application Settings while retaining **Local Analysis** as the deterministic option.
- [x] Separate automatically detected geometry from user-confirmed functional importance, highlight the selected area in the model, explain the affected decisions, and hide triangle/sampling counts under technical details.

Interpretation v3.5 is a geometric relevance and risk assessment, not FEM or a safe-load calculation. STEP import, arbitrary-angle orientation optimization, product-specific material alternatives, toolpath quantity estimation, provider expansion, and shared learning remain outside this slice.

### Interpretation v3.6 — assumption-led review

- [x] Build a coherent local world-model hypothesis from Context, filename clues, object-purpose interpretation, and measured geometry instead of waiting for exact keywords.
- [x] Prefill environment, heat, load, impact, and priority with conservative assumptions when direct evidence is missing.
- [x] Distinguish direct Context interpretation from Check Make assumptions in the review UI and preserve confidence, provenance, and evidence.
- [x] Require the user to review assumptions before they can activate deterministic manufacturing rules; confirmed Context facts remain immediately traceable.
- [x] Keep genuinely safety-critical, food-contact, chemical, and materially ambiguous requirements unresolved rather than guessing.
- [x] Make support a geometry-led recommendation with a step-2 override that recalculates the same Recommended baseline.
- [x] Keep the Context field neutral and non-blocking: show interpretations, ambiguities, and any missing-purpose clarification only in Prepare.
- [x] Replace the technical object-hypothesis presentation with a concise **Check Make’s understanding** explanation in plain English.
- [x] Accept reviewed noun-phrase descriptions such as “Parasol base distance for outside use” without requiring the user to rewrite them as a verb-led specification.

This closes the launch-critical semantic interaction slice. Later AI providers may improve the quality of the hypothesis, but the deterministic rule engine remains authoritative and no unreviewed assumption is exported as a confirmed fact.

### Interpretation v3.7 — broader English semantics and one provider contract

- [x] Add relation-aware English interpretation for object identity, function, and target instead of relying only on isolated keywords.
- [x] Expand common functional object families and verb forms, including corrections and negated identities/functions.
- [x] Extend the semantic vocabulary and `ManufacturingIntent` bridge for service exposure, freezing conditions, load magnitude, wear, pressure, electrical insulation, lifetime, cost preference, and weight preference.
- [x] Preserve reviewed checklist answers over later semantic inferences and migrate older saved manufacturing-intent objects with safe defaults for newly added fields.
- [x] Make deterministic Local Analysis emit the same versioned semantic contract used by Extended AI Analysis.
- [x] Make local llama.cpp and cloud OpenAI providers return the same schema-validated result and pass through the same grounding, conflict, confirmation, and rule-activation gate.
- [x] Use schema-locked Structured Outputs for OpenAI responses; AI remains an interpretation provider and cannot return material or process decisions.
- [x] Enrich AI input with topology, proportions, connected overhang regions, bed contact, and all measured axis-aligned orientation ranges while retaining explicit geometry-to-purpose limits.
- [x] Add an English deterministic corpus with at least 100 phrasings across 20 common functional object families, plus correction, service, cold, wear, and quantified-load regressions.
- [x] Add a release acceptance matrix covering 30 diverse descriptions and 133 deterministic checks, with zero tolerated forbidden facts or missed critical questions.
- [x] Add a provider-comparison runner that scores deterministic, llama.cpp, and OpenAI implementations through the same typed corpus and reports unavailable providers honestly.
- [ ] Benchmark selected real local and cloud models against the checked-in live-provider corpus. Automated schema/integration tests do not establish model quality.

Interpretation v3.7 improves semantic coverage without relaxing Check Make's trust boundary: only explicit grounded Context facts, confirmed user decisions, and deterministic measurements may activate manufacturing rules.

### Interpretation v3.8 — parent-system and usage context

- [x] Separate the printed object, its direct function, and its surrounding product or assembly in the semantic contract.
- [x] Recognize “spacer for camping chair” as a spacing component used within a camping/folding-chair system.
- [x] Use parent-system knowledge to prefill reviewable assumptions for environment, service pattern, cyclic/static loading, impacts, and optimization priority.
- [x] Treat person load, pressure retention, safety consequence, and other consequential parent-system conclusions as hypotheses requiring targeted confirmation.
- [x] Let explicit Context such as “used indoors”, “not load-bearing”, or “failure is only inconvenient” override broader product knowledge.
- [x] Add deterministic profiles for camping/seating, outdoor furniture, dishwashers, bicycles, vehicles, doors/drawers, plumbing, electronics, tools, toys, and luggage.
- [x] Add a 26-case parent-system corpus covering common assemblies, specificity, explicit overrides, unknown systems, and false-positive protection.
- [x] Include the recognized parent system in Check Make’s plain-English understanding shown during Prepare.

Interpretation v3.8 does not assert that every component inherits every property of the complete product. Parent-system facts remain assumptions until reviewed, and the deterministic rules engine continues to consume only grounded or confirmed manufacturing intent.

## Priority 4 — fine-tuning and alternatives

Priority 4 begins from the same Recommended plan and must never silently discard the confirmed use, load, environment, printer, or evidence constraints. Some foundations shipped in 0.2.5, but the priority as a whole remains open.

### 4.1 Plan preferences for time, quality, accuracy, and structural margin — partially implemented

- [x] Keep Recommended as the stable baseline for every alternative.
- [x] Re-run deterministic rules for a Faster alternative.
- [x] Re-run deterministic rules for Visual quality, Fit & accuracy, and Structural margin at process-setting level.
- [x] Add a versioned application default and a per-project override without replacing confirmed part requirements.
- [x] Persist the inherited, requested, and applied preference in Check Make projects and export metadata.
- [x] Show setting-level changes from Balanced and explain when a preference is unavailable.
- [ ] Restore Lower cost only when a stable toolpath-aware estimator can account for walls, infill, shells, support, brim, and user-provided filament price without launching an external slicer in the background.
- [ ] Restore Lower weight using the same toolpath-aware quantity model rather than mesh bounding volume or solid volume alone.
- [ ] Show which confirmed requirements and safety margins constrain each optimization.

### 4.2 Material alternatives with explicit trade-offs — family-level UI implemented

- [x] Offer conservative material-family candidates for easier printing, outdoor use, impact resistance, heat margin, stiffness, dimensional stability, and flexible function.
- [x] Filter every displayed candidate through confirmed requirements and the selected printer's nozzle temperature, bed temperature, enclosure, and nozzle wear resistance.
- [ ] Use reviewed product-specific material profiles instead of treating all products in one polymer family as equivalent.
- [ ] Let users select a filament manufacturer and product profile, then derive nozzle and build-plate starting temperatures from that reviewed profile and the selected printer; retain clearly labelled material-family values only as a fallback.
- [x] Explain improvements, disadvantages, printer requirements, and evidence scope for every displayed material change.
- [x] Keep Recommended as the stable baseline, persist a selected compatible material override, and include its material-family starting settings in project export.
- [x] Present alternatives inside Key Settings → Material, including why the simpler Recommended material was selected and what trade-offs each alternative introduces.

The first 4.2 slice is intentionally family-level. It does not claim that all products within PLA, PETG, ASA, TPU, or PA-CF have equivalent properties. Product-specific selection and reviewed manufacturer profiles remain required before Priority 4.2 can be considered complete.

### 4.3 Comparable alternative print plans — setting-level comparison implemented

- [x] Present Balanced, Faster, Visual quality, Fit & accuracy, and Structural margin as selections derived from the same base requirements.
- [x] Show which manufacturing settings differ from Balanced.
- [ ] Add consistent deltas for sliced print time, material use, finished mass, estimated cost, and affected performance assumptions when trustworthy quantities are available.
- [ ] Separate measured quantities, deterministic rule effects, and qualitative trade-off statements in the comparison.
- [ ] Prevent an alternative from being presented as better when its relevant outcome cannot be quantified or supported.

### 4.4 Post-print feedback and revisions — not started

- [ ] Let users record outcomes such as warping, poor fit, stringing, weak layers, support damage, surface defects, and print failure.
- [ ] Store the exact model, printer, material product, process settings, orientation, app/rule version, and user observation with the feedback.
- [ ] Generate a traceable revised recommendation for the same project without automatically generalizing one observation to all users.
- [ ] Support correction and deletion of user-entered observations.
- [ ] Define promotion gates before local feedback can influence shared rules or evidence levels.

## Priority 5 — AI platform and long-term learning

Priority 5 expands the intelligence layer only after deterministic requirements, privacy boundaries, and feedback provenance are explicit. AI may interpret and explain; deterministic code remains responsible for manufacturing decisions and export validation.

### 5.1 Common interface for multiple AI providers — foundation implemented

- [x] Use a provider-neutral model-intelligence result contract.
- [x] Support local preliminary analysis and optional OpenAI analysis.
- [x] Add Local Semantic Interpreter v3 with a versioned English request/result vocabulary, parent-system context, strict schema validation, provenance, abstention, and a confirmation gate before `ManufacturingIntent`.
- [x] Add a configurable loopback-only `llama.cpp` provider with timeout, cancellation, invalid-output handling, and manual fallback. Model download and runtime bundling remain deferred.
- [x] Generalize the semantic contract across deterministic Local Analysis, local llama.cpp, and cloud OpenAI analysis.
- [ ] Add Claude as an optional direct API provider.
- [ ] Benchmark Qwen3 4B and other small GGUF candidates against the checked-in English semantic corpus.
- [ ] Evaluate local Ollama and MLX adapters after the `llama.cpp` benchmark establishes a baseline.
- [ ] Package a selected local runtime/model only after benchmark, license, checksum, disk-size, update, and hardware requirements are approved.
- [ ] Add a Tauri sidecar lifecycle and complete Windows acceleration, firewall, installer, and fallback validation.
- [ ] Evaluate a Check Make MCP server as an additional host integration, not as the only provider mechanism and not as a way to reuse consumer AI subscriptions silently.
- [ ] Add provider capability detection and graceful fallback when vision, structured output, or context limits differ.

### 5.2 Explicit privacy and consent controls — partially implemented

- [x] Offer a local analysis mode.
- [x] Keep the OpenAI API key in memory rather than saving it in Check Make projects.
- [x] Explain that connected analysis sends a rendered model montage and deterministic mesh measurements.
- [ ] Require explicit consent immediately before the first external transfer for each provider.
- [ ] Preview exactly which images, geometry measurements, filenames, metadata, and user text will be transmitted.
- [ ] Allow users to exclude model images, identifying metadata, or optional context where the provider can still operate meaningfully.
- [ ] Show provider-specific retention and processing information without making unsupported privacy guarantees.
- [ ] Provide a persistent fully-local preference and a clear indication whenever the current action leaves the device.

### 5.3 Controlled learning from print outcomes — not started

- [ ] Make participation voluntary and disabled by default.
- [ ] Define anonymization and minimization rules before collecting shared observations.
- [ ] Version printer, material product, model/geometry class, process, rules, app build, and outcome schema for every record.
- [ ] Add validation, duplicate detection, correction, deletion, and provenance controls for contributed observations.
- [ ] Keep personal project adjustments separate from candidate shared evidence.
- [ ] Require reviewed scope matching, sufficient observations, held-out validation, and an auditable promotion decision before learned results can change production rules.
- [ ] Provide users with clear controls to inspect, export, and withdraw contributed data where applicable.

## Recommended development order after 0.2.5

1. [x] Interpretation v3.5a–e: spatial contract, candidates, confirmation, decision integration, and user-facing important-area/support constraints.
2. [x] Local Semantic Interpreter v3 contract, parent-system context, confirmation gate, configurable llama.cpp provider, and shared OpenAI schema.
3. [x] Printer-compatible material-family alternatives with explicit trade-offs integrated into Key Settings → Material.
4. [ ] Consistent comparison between Recommended and each supported alternative.
5. [ ] Real-model benchmark and provider capability/fallback report for Local Semantic Interpreter candidates and the cloud provider.
6. [ ] Versioned post-print feedback and revision data model using the same spatial-region references for localized outcomes.
7. [ ] Explicit privacy and consent controls before external providers receive spatial annotations or annotated model views.
8. [ ] Additional AI providers using the provider-neutral semantic and spatial contracts.
9. [ ] Controlled shared learning only after the feedback and privacy foundations are validated.

Lower cost and Lower weight remain deferred until Check Make has a stable toolpath-aware quantity source. They must not be reintroduced using bounding-box estimates or by launching an installed slicer invisibly.

## First public release focus

After the 0.2.6 material-alternatives test slice, development should pivot from feature breadth to launch hardening. The first public release should prove Check Make's differentiating path from intended use to a model-bound, validated slicer project before adding more optimization modes.

### Release-critical

- [ ] Add automated smoke coverage for import → Context interpretation → required decisions → Recommended plan → material selection → native export.
- [ ] Run the installed-slicer integration suite and round-trip representative projects through each slicer claimed by the release build; reduce the first release's advertised adapter scope if a target cannot be verified.
- [ ] Build a small versioned real-model acceptance suite covering outdoor use, impact, heat, fit, visible surfaces, support conflicts, incompatible printers, and abstention.
- [ ] Complete a safety-focused rule review so unsupported numerical precision is removed, softened, or clearly presented as a conservative starting point.
- [ ] Require explicit, provider-specific consent and a payload preview before any OpenAI transfer, or remove cloud analysis from the first public build.
- [ ] Add release-grade error recovery for missing slicers, stale source files, invalid saved projects, failed package validation, and incompatible material overrides.
- [ ] Complete focused usability and accessibility testing of the current Inspect → Prepare → Export workflow without adding new result modes.
- [ ] Sign and notarize the macOS application, test the DMG on a clean supported Mac, and document the supported macOS versions. Treat Windows packaging and installation validation as the next platform release rather than a blocker for a macOS-first launch.

### Differentiators to preserve in the first release

- [x] Adaptive interpretation and consequential follow-up questions with deterministic readiness gating.
- [x] Explainable geometry analysis, orientation comparison, build-plate preview, and confirmed important model areas.
- [x] One stable Recommended plan with visible assumptions, rule evidence, and conservative abstention.
- [x] Model-bound native 3MF export with mapped settings and structural validation.
- [x] Printer-capability gating and clearly bounded material-family alternatives.

### Post-launch unless validation exposes a dependency

- Product-specific filament catalogs beyond a small reviewed starter set.
- Lower cost and Lower weight estimates.
- Post-print feedback, shared learning, and community evidence ingestion.
- Additional cloud or local AI providers and bundled local model runtimes.
- Broad tier-2 printer coverage, Linux, mobile companion experiences, STEP import, arbitrary-angle optimization, and full mesh repair.

## Product experience — implemented foundation

- [x] Rebuild the application shell around one continuous model-first desktop workspace while preserving import, analysis, geometry, uncertainty, settings, printer selection, evidence, and slicer export.
- [x] Derive the visible **Inspect → Prepare → Export** process from loaded model data, decision readiness, explicit plan acceptance, and export availability instead of treating the steps as navigation pages.
- [x] Keep model, printer, recommended material, and analysis status visible in a persistent project-context panel.
- [x] Keep Risk map and Compare directly above the 3D model, place uncertainty beside the affected recommendation, and expose evidence as expandable detail.
- [x] Move global analysis-provider settings behind the toolbar gear and project Open/Save into the native application menu with standard shortcuts.

The current visual direction is captured in [GUI concept v4](../assets/mockups/check-make-gui-concept-v4.png). It presents **Inspect → Prepare → Export** as a state-driven process indicator rather than navigation: input and analysis complete Inspect, required decisions keep Prepare active, and accepted recommendations unlock Export. The application remains one continuous workspace with persistent project context, model visualization, and contextual evidence and uncertainty. [GUI concept v3](../assets/mockups/check-make-gui-concept-v3.png), [v2](../assets/mockups/check-make-gui-concept-v2.png), and the [original v1](../assets/mockups/check-make-gui-concept-v1.png) are retained for comparison. These are non-functional mockups for product direction only; controls, navigation, layout, and status presentation are not implemented yet.

## Printer support

Check Make models a printer as a manufacturer, family, and exact variant. Variants may share slicer-profile conventions while retaining their own build volume, temperature limits, enclosure state, nozzle capabilities, and compatible materials.

## In progress

- [x] Group printer profiles by family and variant in the data model and printer picker.
- [x] Add Creality Ender-3 V3 SE and Ender-3 V3 KE hardware profiles.
- [x] Validate native Ender-3 V3 SE/KE project exports in OrcaSlicer, Creality Print, and UltiMaker Cura.

## Printer coverage tier 1 — broad current-market coverage

- [ ] Bambu Lab P2S
- [ ] Prusa CORE One+
- [ ] Creality K2 Plus and K2 Pro
- [x] Creality Ender-3 V3 SE and Ender-3 V3 KE
- [ ] ELEGOO Centauri Carbon and Centauri Carbon 2
- [ ] Anycubic Kobra S1
- [ ] Flashforge Adventurer 5M, Adventurer 5M Pro, and AD5X
- [ ] Bambu Lab H2S and H2D
- [ ] Creality Hi and SparkX i7

## Printer coverage tier 2 — extended family coverage

- [ ] Bambu Lab H2C and H2D Pro
- [ ] Prusa XL and CORE One L
- [ ] Creality K1 Max, Ender-3 V3 Plus, and Ender-3 V4
- [ ] ELEGOO Neptune 4, Neptune 4 Plus, Neptune 4 Max, and Centauri 2
- [ ] Anycubic Kobra S1 Max, Kobra X, and Kobra 3 Max
- [ ] Sovol SV06 ACE and SV08
- [ ] QIDI Plus4 and Q2

## Separate track

Resin printers require a different analysis and export pipeline and are intentionally outside the current FDM/FFF profile model.
