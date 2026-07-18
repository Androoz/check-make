# Rule evidence audit and validation plan

Date: 2026-07-14
Scope: `rules/mvp-rules.yaml`, local model analysis, geometry-derived inputs, and rule confidence reporting.

## Outcome

The current 50-rule catalog is deterministic and reviewable, but it is not yet an evidence-calibrated manufacturing model. External sources support many directional claims, while none of the exact MVP thresholds or confidence numbers have been validated for Check Make's supported printers, materials, and geometries.

All rules are therefore classified as provisional in `rules/rule-evidence.yaml`. Source records and their limitations are in `rules/evidence-sources.yaml`.

Evidence levels are intentionally conservative:

- **A:** replicated Check Make validation in the declared scope, including a held-out confirmation set;
- **B:** relevant primary experimental research;
- **C:** authoritative manufacturer or software-maintainer guidance;
- **D:** expert assumption without a directly supporting source.

A source can support the direction of a claim without validating its exact threshold or action. For example, manufacturer guidance supports using a brim for a tall object with a small base, but does not validate `bedContactAreaMm2 < 400` or a fixed 8 mm brim.

## Main audit findings

### 1. Unknown use is converted into demanding requirements

`localModelAnalysis` defaults an unknown STL to medium impact, static load, and either strength or finish priority. The medium-impact default activates PETG, four walls, and at least 20 percent infill. These are presented as recommendations even though the STL contains no impact evidence.

Required change after validation design: represent unknown as unknown, preserve uncertainty through the rule context, and ask a consequential question rather than silently selecting a demanding category.

### 2. Local follow-up answers do not update the decision variables

The local refinement path replaces the likely-purpose text but does not recalculate environment, load, impact, heat, priority, or support allowance. `inferBrief` contains a broader keyword mapping but is not connected to the current application flow.

Required change: introduce one traceable inference step that emits value, evidence, provenance, and an explicit unknown option for every decision variable.

### Naming clues are useful but unverified

The STL importer now extracts a sanitized clue from the file name, the ASCII `solid` name, or the 80-byte binary STL header. Generic exporter text, revision suffixes, UUID-like names, email-like values, and directory/user path segments are filtered. The local hypothesis exposes the clue and its source, and the connected-AI prompt receives the same structured provenance.

These labels can improve object identification, but they are not proof of function. A name such as `wall_bracket_v2.stl` may be stale, copied, mistranslated, or describe only one component in a larger assembly. Naming clues must remain visible as unverified evidence and must not alone establish material, load, impact, or operating environment. Richer future 3MF import should preserve the same provenance distinction for model metadata, object names, and part numbers.

### 3. Confidence is manually assigned, not calibrated

Rule confidence values and local-analysis confidence values have no labeled evaluation set, calibration curve, uncertainty interval, or empirical interpretation. The engine takes the minimum confidence of every matched rule, including rules whose action was later overwritten.

Required change: do not display these numbers as statistical confidence. Until calibration exists, expose evidence level and validation status. Later probabilistic confidence must be tied to a declared target event and evaluated with calibration metrics such as reliability curves and Brier score.

### 4. Geometry risk uses absolute and global proxies

Current support and adhesion decisions use total overhang-area ratio and absolute bed-contact area. Source guidance indicates that support need also depends on local span, mass, center of gravity, bed motion, material, cooling, bridging, and feature accessibility. Brim need also depends on height, base shape, warping tendency, plate, and process conditions.

Required change: move from global thresholds to feature-level and normalized risk features. At minimum include:

- oriented bounding dimensions and actual printer volume;
- base area divided by projected XY area;
- height-to-base and center-of-mass leverage proxies;
- connected overhang regions, local angle, unsupported span, and bridge classification;
- material, layer height, extrusion width, cooling, enclosure, and plate class;
- critical-surface and support-removal constraints supplied by the user.

### 5. Orientation is a multi-objective problem

Only six axis-aligned orientations are scored. The score uses fixed weights for contact, height, and overhang. Research supports multi-objective orientation planning, but not these candidates or weights. Mechanical load direction, critical surfaces, support removability, build-volume feasibility, and anisotropy are absent.

Required change: generate more candidates, reject infeasible candidates first, and present a Pareto-ranked explanation rather than one opaque weighted score.

### 6. Material families are treated as universal grades

PLA, PETG, ASA, TPU, and PA-CF contain grades with different thermal, mechanical, moisture, UV, hardness, and processing behavior. One temperature pair per family is not a safe universal setting.

The highest-risk material rule is M10. The current rule selects PA-CF for strength plus high impact. Manufacturer guidance says fiber-filled materials can improve stiffness, dimensional stability, and tensile yield strength while reducing Charpy impact resistance and layer adhesion. M10 is classified `provisional-contested` and must not be promoted without grade-specific impact and interlayer testing.

Required change: separate properties such as stiffness, tensile strength, toughness, fatigue, creep, heat resistance, UV resistance, moisture sensitivity, and flexibility. Material selection must reference a specific material profile or a bounded grade family.

### 7. Rule merging obscures the active rationale

Later `set` actions overwrite earlier values, while reasons and rule IDs from all matches remain attached. The displayed rationale can therefore include a superseded PLA rule next to a final PETG or ASA value. The minimum confidence can also come from a rule that did not determine the final value.

Required change: retain a full decision trace, but distinguish active, constraining, superseded, and conflicting rules in both data and UI.

## Evidence coverage snapshot

The machine-readable mapping is authoritative. At this review:

- every one of the 50 rule IDs has an evidence record;
- every referenced source has a catalog entry and URL;
- all exact decision boundaries remain provisional;
- rules with no direct source remain level D;
- M10, Q09, and Q10 require critical review before behavioral expansion.

Passing the evidence-coverage test means the catalog is complete and internally consistent. It does **not** mean the manufacturing recommendation is correct.

## Prioritized validation program

### P0 — Inference and decision-trace safety

Purpose: prevent unsupported defaults and misleading confidence from driving recommendations.

1. Build a labeled scenario set containing at least unknown, decorative, fit-critical, structural, cyclic, impact, outdoor, hot, flexible, and support-forbidden cases.
2. Include contradictory and incomplete descriptions and models whose function cannot be inferred from geometry.
3. Measure category accuracy, false-positive rate, abstention rate, and calibration separately for local and connected-AI paths.
4. Add golden decision traces that identify which rule produced, constrained, superseded, or conflicted with each setting.

Promotion gate:

- unknown evidence remains unknown;
- no demanding material or structural setting is selected solely from an arbitrary fallback;
- each recommendation exposes the exact observation or user answer that activated it;
- numerical confidence is hidden until its target event and calibration are documented.

### P1 — Geometry, overhang, support, and adhesion

Purpose: replace 8 percent, 20 percent, 400 mm2, 150 mm, and 220 mm thresholds with measured risk models.

Test artifacts:

- analytical meshes for normals, area, contact, transforms, and bounding dimensions;
- overhang coupons with controlled angle, connected area, curvature, and unsupported span;
- bridge coupons with controlled span and direction;
- towers with controlled base area, aspect ratio, center-of-mass offset, and height;
- representative part-like artifacts with enclosed or hard-to-remove support regions.

Controlled factors:

- material grade and lot;
- printer and kinematic class;
- nozzle and extrusion width;
- layer height, temperature, cooling, acceleration, enclosure, plate, and surface preparation;
- candidate orientation and brim width.

Responses:

- completion/failure and detachment;
- corner lift and dimensional warp;
- overhang sag, underside roughness, dimensional deviation, and support-removal time;
- print time, material use, and operator-rated removal damage.

Promotion gate: derive scoped models with uncertainty intervals and confirm them on held-out geometries. Do not convert a coupon result into a universal threshold.

### P2 — Structural shell, infill, and orientation

Purpose: replace fixed wall and infill counts with load- and process-aware recommendations.

Use ASTM D638 or ISO 527-2 for tensile characterization and ASTM D790 for flexural characterization, with ASTM F2971 reporting. Add part-like brackets and fastener-bearing specimens so coupon findings are checked against relevant failure modes.

Factors should include:

- specific material grade and conditioning;
- raster/build orientation relative to load;
- wall thickness in millimeters, not only loop count;
- infill density and pattern;
- layer height, extrusion temperature, cooling, and print speed;
- static, flexural, cyclic, and impact-relevant load cases as separate experiments.

Responses should include modulus, yield/ultimate load where applicable, strain at failure, energy absorption, failure location/mode, mass, and print time.

Use randomized blocked designs, replicate enough to estimate within-condition variance, and choose final replication through power analysis after a pilot. Never use one specimen or one filament brand to set a family-wide rule.

Promotion gate: a rule must declare its material, printer/process, geometry, and load scope and outperform the simpler baseline on a held-out confirmation set.

### P3 — Dimensional accuracy and surface quality

Purpose: validate layer height, wall order, seam, and speed recommendations.

Use an ISO/ASTM 52902-style geometric artifact plus targeted holes, shafts, snap fits, thin walls, sloped surfaces, and seam-sensitive cylinders.

Measure:

- XYZ dimensional error and repeatability;
- hole/shaft and mating-fit error;
- flatness, cylindricity, and wall-thickness error where equipment permits;
- surface roughness or a documented optical proxy;
- seam prominence and local dimensional disturbance;
- print time.

Promotion gate: distinguish Z resolution from dimensional accuracy, scope wall-order advice by geometry, and require the user or geometry analysis to identify a critical/visible surface before assigning seam placement.

### P4 — Environment and long-term behavior

Purpose: validate material selection for outdoor, heat, cyclic load, moisture, and weather sealing.

Separate short-term printing success from service performance. Test grade-specific heat deflection/creep, moisture conditioning, UV/weather exposure, cyclic loading, and leakage where the claim concerns sealing. Record conditioning and aging protocols and do not infer long-term outdoor suitability from nozzle temperature or a generic material-family label.

Promotion gate: environmental recommendations state the tested exposure range, duration, load, material grade, and uncertainty.

## Minimum experiment record

Following ASTM F2971's traceability intent, every run should record:

- experiment and specimen IDs, hypothesis, preregistered analysis, and date;
- model revision, orientation, units, and source geometry hash;
- printer serial/profile, firmware, slicer and version, nozzle, plate, and enclosure state;
- filament manufacturer, product, color, lot, diameter, conditioning, and moisture handling;
- every effective slicer parameter, not only Check Make's canonical values;
- ambient/chamber conditions and plate preparation;
- raw measurements, instrument and calibration, failure mode, photos, and operator notes;
- exclusions with reasons and all failed prints;
- derived metrics, uncertainty intervals, analysis code version, and reviewer.

Raw observations must be append-only. Corrections should create a new revision with a reason rather than rewriting prior data.

## Rule lifecycle

1. **Proposed:** claim and intended scope exist; no source review.
2. **Source-backed:** direction is supported and source limitations are recorded.
3. **Pilot-tested:** Check Make has internal data but no held-out confirmation.
4. **Validated:** exact action and boundary pass a preregistered held-out test within a declared scope.
5. **Monitored:** production outcomes are tracked for drift by material, printer, slicer, and firmware version.
6. **Deprecated:** evidence is contradicted, scope is obsolete, or a safer replacement exists.

Rule changes must include source IDs, rationale, affected scope, expected failure modes, validation evidence, and a versioned changelog entry. A source citation alone is not sufficient to change a threshold.

## Immediate implementation order

1. Keep behavior unchanged while this audit is reviewed.
2. Replace displayed deterministic confidence with evidence level and provisional status.
3. Add unknown states and fix the local follow-up path.
4. Add active/superseded/conflicting decision traces.
5. Build P0 golden scenarios and P1 analytical geometry fixtures.
6. Run the first physical pilot for adhesion/support and structural rules.
7. Change thresholds only after the relevant promotion gate is met.

## P0 implementation status — 2026-07-14

Implemented:

- explicit `unknown` values for environment, load, impact, heat, priority, support allowance, and material hint;
- neutral local-analysis defaults instead of implicit medium impact, PETG, strength/finish priority, and assumed support permission;
- a separate `userEvidence` channel so file names, embedded STL names, geometry labels, and AI hypotheses do not enter keyword-driven usage rules as confirmed facts;
- local refinement that converts only explicitly matched user terms into decision variables and leaves every other field unknown;
- OpenAI provider instructions and normalization that preserve unknown rather than filling gaps with typical defaults;
- active, supporting, superseded, and conflict-marked rule traces for every recommendation;
- active-rule rationale separated from the complete matched-rule audit trail;
- evidence level and provisional status in the manufacturing UI instead of numerical deterministic confidence;
- visible warnings when recommendations still use neutral baselines because requirements are unknown;
- golden tests proving that a suggestive file name alone does not trigger structural, impact, or material requirements.

Not changed in P0:

- the numeric thresholds and actions in `mvp-rules.yaml`;
- the provisional evidence classification of those rules;
- the physical validation requirements and promotion gates described above.

## P1 measurement status — 2026-07-14

Implemented groundwork:

- normalized bed coverage and a height-to-contact-width leverage proxy;
- an area-weighted surface-centroid offset relative to the bed-contact centroid;
- edge-connected overhang regions with area, projected span, Z range, normal-angle, and horizontal-area measurements;
- exclusion of first-layer bed-contact faces from unsupported-overhang area;
- identical measurements for every orientation candidate;
- analytical fixtures with known geometry and expected measurements;
- an append-only physical-pilot record schema and preregistration-oriented pilot plan.
- 18 deterministic physical screening coupons covering adhesion/stability, inclined overhangs, and known bridge spans;
- SHA-256 artifact identity, seeded run randomization, mandatory scope locking, record templates, append-only capture, and automated verification.

Still provisional:

- bridge classification remains explicitly `not-evaluated`;
- the 45-degree facet convention is not a universal support boundary;
- G02–G09 retain their existing provisional thresholds until scoped physical data pass the P1 promotion gate.
- the generated screening stage is ready, but no physical observations exist until a real printer, filament lot, process, environment, and measurement system are locked and the jobs are run.

Detailed definitions and the physical pilot handoff are in `docs/P1_GEOMETRY_VALIDATION.md`.
