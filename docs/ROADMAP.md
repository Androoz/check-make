# Check Make roadmap

## Priority 3 — clearer and smarter results

Check Make 0.2.5 ships the completed release slice: one coherent Recommended plan, adaptive requirement questions, deterministic readiness gating, compact key/all-settings presentation, technical evidence on demand, and rule-backed Faster and Strength / performance alternatives.

The following work is deliberately deferred beyond 0.2.5 rather than blocking the release:

- [ ] Add printer-compatible material upgrade candidates to Strength / performance, supported by reviewed product-specific material profiles.
- [ ] Reintroduce Lower cost and Lower weight only with a stable toolpath-aware estimator that accounts for walls, infill, shells, support, and brim without launching an external slicer in the background.
- [ ] Compare every alternative against Recommended with consistent deltas for print time, material use, finished mass, estimated cost, and the affected performance assumptions.
- [ ] Add scoped external evidence before allowing an optimization to reduce walls, infill, or shell thickness while claiming equivalent performance.
- [ ] Complete the final result-view usability pass and automated smoke coverage for the full import → interpretation → recommendation → export path.

These are retained as Priority 3 follow-up items. They are not represented as implemented capabilities in 0.2.5.

## Product experience

- [ ] Rebuild the entire application GUI after the current Priority 3 result-presentation work. The redesign must preserve the implemented import, analysis, geometry, uncertainty, settings, printer-selection, evidence, and slicer-export capabilities while reorganizing them into a clearer model-first desktop workflow.

The current visual direction is captured in [GUI concept v2](../assets/mockups/check-make-gui-concept-v2.png), with the [original GUI concept v1](../assets/mockups/check-make-gui-concept-v1.png) retained for comparison. These are non-functional mockups for product direction only; controls, navigation, layout, and status presentation are not implemented yet.

## Printer support

Check Make models a printer as a manufacturer, family, and exact variant. Variants may share slicer-profile conventions while retaining their own build volume, temperature limits, enclosure state, nozzle capabilities, and compatible materials.

## In progress

- [x] Group printer profiles by family and variant in the data model and printer picker.
- [x] Add Creality Ender-3 V3 SE and Ender-3 V3 KE hardware profiles.
- [x] Validate native Ender-3 V3 SE/KE project exports in OrcaSlicer, Creality Print, and UltiMaker Cura.

## Priority 1 — broad current-market coverage

- [ ] Bambu Lab P2S
- [ ] Prusa CORE One+
- [ ] Creality K2 Plus and K2 Pro
- [x] Creality Ender-3 V3 SE and Ender-3 V3 KE
- [ ] ELEGOO Centauri Carbon and Centauri Carbon 2
- [ ] Anycubic Kobra S1
- [ ] Flashforge Adventurer 5M, Adventurer 5M Pro, and AD5X
- [ ] Bambu Lab H2S and H2D
- [ ] Creality Hi and SparkX i7

## Priority 2 — extended family coverage

- [ ] Bambu Lab H2C and H2D Pro
- [ ] Prusa XL and CORE One L
- [ ] Creality K1 Max, Ender-3 V3 Plus, and Ender-3 V4
- [ ] ELEGOO Neptune 4, Neptune 4 Plus, Neptune 4 Max, and Centauri 2
- [ ] Anycubic Kobra S1 Max, Kobra X, and Kobra 3 Max
- [ ] Sovol SV06 ACE and SV08
- [ ] QIDI Plus4 and Q2

## Separate track

Resin printers require a different analysis and export pipeline and are intentionally outside the current FDM/FFF profile model.
