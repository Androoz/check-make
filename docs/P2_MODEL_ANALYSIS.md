# P2 model analysis

Date: 2026-07-18

## Scope

Priority 2 improves the evidence Check Make can extract from a triangle mesh before AI interpretation or print-rule evaluation. The implementation remains deterministic and does not change the manufacturing-rule thresholds.

For STL, 3MF, and OBJ mesh imports, Check Make now provides:

- disconnected-component detection with per-component triangle count, surface area, and bounds;
- boundary-edge, non-manifold-edge, and degenerate-triangle counts;
- a watertightness observation based on the measured edge topology;
- connected overhang-region and bed-contact findings with explicit confidence labels;
- a vertex-colored preview of regular surfaces, measured bed contact, provisional overhang facets, and near-horizontal downward faces;
- side-by-side original and selected-orientation previews;
- a printer-profile-sized build plate that can be shown or hidden;
- printer-coordinate XYZ axes and isometric, top, front, back, bottom, left, and right camera presets;
- relative stability, support-exposure, and height scores for six axis-aligned build orientations.

The selected preview orientation is deliberately separate from export. Clicking an alternative candidate lets the user inspect it without overriding the rule engine. Export continues to use the rule engine's recommended orientation.

The preview uses printer coordinates even though Three.js is Y-up internally: printer X is red, printer Y is green, and printer Z is blue and vertical. The bottom camera makes the build plate translucent; hiding the plate also refits the camera and axis marker around the model.

## Risk-map colors

| Color | Meaning |
| --- | --- |
| Green | No current geometry flag |
| Blue | Planar face measured at the build plate |
| Orange | Downward facet beyond the provisional 45-degree convention |
| Red | Near-horizontal downward face |

The colors describe facet geometry in the selected orientation. They do not predict print failure, support success, surface quality, or structural strength.

## Orientation comparison

Check Make evaluates only these six rigid, axis-aligned candidates: as imported, upside down, left side, right side, front side, and back side. Scores are relative to those candidates and are weighted by the interpreted priority:

- stability combines normalized base coverage, height-to-contact-width leverage, and surface-centroid offset;
- support exposure combines overhang ratio and connected-region count;
- height compares the candidate height with the tallest of the six candidates.

The result is an explainable shortlist, not a continuous orientation optimizer. Arbitrary rotations, support painting, layer-by-layer bridges, and local surface priorities remain future work.

## Explicit analysis limits

Check Make marks these properties as unavailable instead of inferring them from insufficient data:

- local wall thickness;
- load direction, load paths, and structural stress;
- true bridge classification;
- critical visible, mating, or tolerance surfaces.

Wall thickness requires ray casting or a volumetric thickness field. Structural claims require load and constraint information and ultimately a validated mechanical model. Bridge behavior requires layer direction, attachment, material, cooling, and process context. Critical surfaces require user input or a clearly evidenced AI hypothesis.

## Verification

`src/geometry/p2-analysis.test.ts` covers closed meshes, open boundaries, disconnected components, risk-color geometry, orientation transforms, and six-candidate comparison. It runs as part of `npm test`.
