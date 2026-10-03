# Semantic understanding roadmap

Status: Planned follow-up after the Check Make `0.2.6-beta.5` release.

## Problem statement

Check Make can currently combine Context text, filename clues, measured geometry, topology, object-family profiles, parent-system knowledge, a compositional context graph, and optional AI evidence. It still does not reliably recognize many culturally known or benchmark objects from geometry alone.

A concrete example is the 3D Benchy. A user may import the model without meaningful Context, while Check Make sees a printable mesh but does not know that the object is commonly used as an FDM printer calibration and benchmarking model. That missing semantic identity prevents the product from explaining the model's likely purpose, the features commonly inspected, or the limits of any manufacturing recommendation.

## Product goal

Improve Check Make's ability to propose a reviewable object identity, likely purpose, and relevant evaluation goals for recognized reference objects and broader object families, while preserving the existing trust boundary:

- semantic recognition may propose hypotheses;
- every consequential hypothesis keeps provenance and confidence;
- users confirm or reject purpose and usage assumptions;
- deterministic measurements and rules remain authoritative;
- unreviewed semantic guesses must not activate material, orientation, structural, safety, or export decisions.

## Interpretation v4.0 — benchmark objects and semantic recognition

### 4.0a — semantic benchmark corpus

- [ ] Add a versioned corpus of well-known printable reference objects, beginning with 3D Benchy and other deliberately selected calibration or benchmark models.
- [ ] For each reference object, define expected identity hypotheses, likely purpose, characteristic evaluation features, allowed uncertainty, forbidden conclusions, and required clarification questions.
- [ ] Store licensing-safe reference metadata, fingerprints, and derived geometric descriptors without redistributing restricted model files.
- [ ] Include altered scale, rotation, translation, filename removal, and format-conversion variants to prevent recognition from depending only on filenames or exact byte identity.
- [ ] Add visually or geometrically similar counterexamples so the recognizer can abstain instead of forcing a familiar identity.

### 4.0b — layered deterministic recognition

- [ ] Add exact or near-exact recognition where lawful fingerprints, topology signatures, component structure, and normalized geometric descriptors provide strong evidence.
- [ ] Add explainable object-family classification from measured features such as proportions, cavities, planar regions, overhang distributions, bridges, thin features, holes, connected components, symmetry, and plate structure.
- [ ] Keep benchmark identity separate from benchmark purpose; recognizing a Benchy-like model may propose calibration use but must not assert the user's actual intent.
- [ ] Surface which observations supported the hypothesis and which expected features were not evaluated.
- [ ] Abstain when evidence is weak, conflicting, or outside the checked-in benchmark corpus.

### 4.0c — optional AI semantic provider

- [ ] Evaluate multi-view vision-language models as an optional provider for long-tail objects that deterministic recognition cannot classify usefully.
- [ ] Require the AI provider to return the same schema-validated semantic contract used by Local Analysis.
- [ ] Ground AI output against measured geometry, topology, Context, filename clues, and known contradictions before presenting it.
- [ ] Treat AI identity, purpose, and evaluation suggestions as hypotheses requiring user review.
- [ ] Prevent the AI provider from directly choosing material, process, orientation, safety status, or export readiness.
- [ ] Benchmark real local and cloud models against the same corpus, measuring useful coverage, false recognition, forbidden conclusions, latency, privacy, and operating cost.

### 4.0d — Benchy-specific first vertical slice

- [ ] Recognize a verified Benchy reference or strong Benchy-like candidate without relying solely on the filename.
- [ ] Explain that 3D Benchy is commonly used as a printer and slicing benchmark, while asking the user to confirm whether that is their purpose.
- [ ] Present reviewable evaluation areas such as hull surfaces, overhangs, bridges, arches, small details, circular openings, text, first-layer footprint, and dimensional features only where geometry analysis can localize them.
- [ ] Distinguish printing a benchmark model from manufacturing a functional boat or toy.
- [ ] Avoid recommending structural, watertight, marine, food-contact, child-safety, or flotation properties from visual identity alone.
- [ ] Add end-to-end tests for confirmed benchmark use, rejected benchmark use, modified Benchy variants, misleading filenames, and similar non-Benchy models.

## Acceptance criteria

This roadmap item is ready for implementation only when a smaller milestone defines:

- a bounded first corpus and lawful reference-data strategy;
- measurable recognition and abstention targets;
- a maximum tolerated false-recognition rate;
- provenance requirements for every proposed identity and purpose;
- the user confirmation flow;
- the exact boundary between semantic hypotheses and deterministic manufacturing decisions;
- automated regression cases and a manual evaluation set.

The feature is not considered successful merely because an AI model can name a model from screenshots. Success requires calibrated uncertainty, useful explanations, reliable abstention, preservation of user authority, and no regression in deterministic decision safety.

## Recommended implementation order

1. Build the benchmark corpus and acceptance harness.
2. Implement deterministic exact/near-exact and family-level recognition.
3. Deliver the Benchy vertical slice with explicit user confirmation.
4. Measure remaining long-tail gaps.
5. Add or improve an optional AI provider only where measured gaps justify it.
6. Keep all material and manufacturing decisions in the existing deterministic, evidence-gated engine.

## Explicitly outside this roadmap item

- unrestricted internet image search during analysis;
- automatic training on private user models;
- shared learning from user confirmations without explicit consent and governance;
- AI-generated material or process decisions;
- structural simulation, certification, or safe-load claims;
- claiming object identity or purpose as fact when evidence only supports a hypothesis.
