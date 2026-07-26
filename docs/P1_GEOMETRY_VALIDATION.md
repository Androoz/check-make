# P1 geometry validation

Date: 2026-07-14

## Implemented measurement layer

Check Make now records the following values for the imported orientation and every generated orientation candidate:

- XY bounding-footprint area;
- bed-contact area divided by the bounding footprint;
- height divided by the square root of bed-contact area;
- XY offset between the area-weighted surface centroid and bed-contact centroid;
- connected overhang regions, including area, projected span, Z range, mean downward-normal angle, and horizontal-area fraction.

The first-layer contact face is excluded from overhang area. This corrects the former behavior where a normal box could count its build-plate face as unsupported geometry.

Analytical fixtures in `src/geometry/p1-fixtures.test.ts` verify known boxes, first-layer exclusion, connected-region grouping, and orientation parity.

## Definitions and limitations

These are deterministic geometry measurements, not calibrated failure probabilities.

- **Bed coverage** uses the XY bounding rectangle as its denominator. It is scale-normalized but can understate coverage for non-rectangular silhouettes.
- **Height-to-contact-width ratio** uses `sqrt(contact area)` as an equivalent width. It is a leverage proxy, not a stability limit.
- **Surface-centroid offset** is area-weighted. It is not a true center of mass for non-uniform, open, self-intersecting, or non-manifold meshes.
- **Connected overhang regions** join triangles that share a quantized mesh edge. Nearby but disconnected shells remain separate.
- **Projected span** is the largest XY extent of a region, not a slicer-derived unsupported extrusion length.
- **Bridge classification** remains `not-evaluated`. A bridge claim requires layer-, direction-, attachment-, material-, cooling-, and process-aware analysis.
- The current 45-degree facet classification is retained only as a provisional measurement convention. It is not a universal support threshold.

The implementation follows the source-backed direction that support planning depends on local geometry and process context, and that build orientation is multi-objective. PrusaSlicer's support guidance explicitly considers center of mass, supported weight, bed movement, adhesion, material, and bridging in addition to an overhang threshold. Shen et al. model orientation against support demand, surface quality, efficiency, and mechanical properties rather than one global area ratio.

Sources:

- Prusa Research, *Paint-on supports*: https://help.prusa3d.com/article/paint-on-supports_168584
- Shen et al., *Building Orientation Determination Based on Multi-Objective Optimization for Additive Manufacturing*, DOI 10.1089/3dp.2019.0106: https://pmc.ncbi.nlm.nih.gov/articles/PMC9586232/
- ASTM F2971-13R21, *Standard Practice for Reporting Data for Test Specimens Prepared by Additive Manufacturing*: https://store.astm.org/f2971-13r21.html

## First physical pilot

The physical screening pilot is implemented under `validation/p1/`. It contains 18 deterministic binary STL specimens:

- six adhesion/stability towers varying base width, height, and top offset;
- seven inclined-overhang coupons varying angle and projected span;
- five known bridge coupons with 5–40 mm clear spans.

Each specimen is one print job. This avoids treating several objects printed on one plate as independent observations and reduces interactions caused by travel, cooling, or one detached object. The generated manifest preserves each specimen's design factors, Check Make measurements, triangle count, dimensions, and SHA-256 identity.

The screening stage deliberately uses support off, brim off, and as-imported orientation. Its purpose is to locate transition regions, not to promote a rule. A later confirmation stage will select conditions around those regions, add replicated controls and interventions, and determine replication using the observed variance.

The pilot definition is machine-readable in `validation/p1/pilot-plan.yaml`. Each observation is appended as one JSON object following `validation/p1/experiment-record.schema.json`. Raw records are append-only; corrections create a new record with `supersedesRecordId` and a reason.

### Commands

```bash
npm run p1:generate
cp validation/p1/scope.template.json validation/p1/scope.json
# Fill every REQUIRED field, then lock the scope:
npm run p1:prepare -- --scope validation/p1/scope.json
npm run p1:verify
# After a print and measurement, complete its generated record template:
npm run p1:record -- --file path/to/completed-record.json
npm run p1:summary
```

`p1:prepare` refuses an incomplete scope and writes a deterministic randomized run order plus one record template per job. `p1:record` refuses unknown or modified geometry, duplicate IDs, records outside the run plan, incomplete printer/material/process provenance, mutually inconsistent outcomes, and missing family-specific measurements.

The pilot separates two response families:

1. **Adhesion/stability:** detachment, completion, corner lift, dimensional warp, and visible oscillation.
2. **Unsupported geometry:** completion, sag, underside deviation/roughness, support-removal time, and removal damage.

At minimum, the data must vary base coverage, height-to-contact-width ratio, centroid offset, overhang angle, connected region area, projected span, and bridge/non-bridge geometry while blocking by printer, material grade and lot, nozzle, layer height, cooling, plate, and enclosure state.

## Promotion gate

No existing G02–G09 threshold is changed by this measurement work alone. A replacement model must:

1. declare material, printer, process, plate, and geometry scope;
2. be fitted on a preregistered training set with uncertainty intervals;
3. outperform the current simpler baseline on held-out geometries;
4. report false-negative rates separately for detachment and unsupported-feature failure;
5. preserve `unknown` or manual review outside its validated scope.
