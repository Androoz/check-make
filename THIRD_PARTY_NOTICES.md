# Third-party notices

Check Make depends on open-source software and refers to third-party products
and research. The project's MIT license does not replace the licenses or terms
that apply to those materials.

## Open-source dependencies

JavaScript and Rust dependency names and pinned versions are recorded in
`package-lock.json` and `src-tauri/Cargo.lock`. Each dependency remains under
the license published by its respective author. Distributors are responsible
for preserving notices required by those licenses.

The primary runtime projects include React, Three.js, Tauri, Serde, Reqwest,
`stl_io`, `rfd`, `zip`, `quick-xml` (MIT), and Manifold (Apache-2.0). Manifold
is used only by a gated internal geometry-validation path; normal Check Make
export does not repair or boolean-union user geometry. Their inclusion does not
imply endorsement of Check Make.

## Research data redistributed in this repository

### PLA process-quality measurements

- Title: *Digital photographs and numerical dataset of hardness, surface
  roughness, and dimensional error of PLA specimens fabricated by fused
  filament fabrication under varying layer height, print speed, raster
  orientation and infill density*
- Contributors: Bhumika Patil, Rachana Barade, Poonam Girase, Purva Kapade,
  Ashmika Baviskar, Amol Badgujar, and Nilesh Salunke
- Source: Mendeley Data, version 2
- DOI: <https://doi.org/10.17632/mf76r4zxg4.2>
- License: [Creative Commons Attribution 4.0
  International](https://creativecommons.org/licenses/by/4.0/)
- Local material:
  `validation/evidence/raw/MENDELEY-PLA-PROCESS-QUALITY-2026/`
- Changes: Check Make includes an extracted measurement CSV used for
  deterministic analysis. The repository catalog records the applied scope
  limits; Check Make does not claim authorship of the source observations.

The preferred dataset citation is maintained on the linked versioned dataset
record and must be retained when redistributing the data.

### Wave-inspired horizontal-overhang measurements

- Title: *Data for: Wave-inspired path-planning strategy for support-free
  horizontal overhangs in FDM*
- Contributors: Janis Andersons, Salomé Sanchez, and Tom Vaneker
- Source: Mendeley Data, version 2
- DOI: <https://doi.org/10.17632/xhw8xkjyc2.2>
- License: [Creative Commons Attribution 4.0
  International](https://creativecommons.org/licenses/by/4.0/)
- Local material:
  `validation/evidence/raw/MENDELEY-WAVE-OVERHANG-2026/`
- Changes: `scan-summary.csv` is a deterministic replicate-level summary
  derived from the published scan CSV files. The published archive itself is
  not duplicated in this repository.

The remaining publications and dataset records in `rules/evidence-sources.yaml`
and `rules/evidence-datasets.yaml` are citations and metadata, not a blanket
redistribution of their contents. Entries marked `unknown` or restricted must
not be imported or redistributed until their terms have been reviewed.

## Third-party product names

Bambu Studio, OrcaSlicer, PrusaSlicer, UltiMaker Cura, Creality Print, their
product names, and their logos are owned by their respective projects or
companies. Check Make uses product names and identification marks only to help
users recognize compatible target applications. This does not imply
sponsorship, certification, or endorsement.

## Dashboard Icons

The locally packaged identification icons for Bambu Lab, OrcaSlicer,
PrusaSlicer, and Cura were obtained from the
[Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) collection.

- Copyright: Dashboard Icons contributors
- License: Apache License 2.0
- Source revision: `46b860c70e866212311aef2f98da3775c17f5068`
- Local material: `public/slicer-icons/`
- License copy: `licenses/Dashboard-Icons-APACHE-2.0.txt`
- Changes: filenames were changed for Check Make's target names; the raster
  artwork is otherwise unmodified.

Dashboard Icons states that product names and trademarks remain the property of
their respective owners and that icon use is for identification only.

## Creality Print icon

The locally packaged Creality Print identification icon was extracted from the
official macOS application icon in the Creality Print source repository.

- Project: [Creality Print](https://github.com/CrealityOfficial/CrealityPrint)
- Source revision: `d32f2cc1bdfa2f8a9ae170cd0e8f43d6c2659508`
- Source file: `resources/Icon.icns`
- Project license: GNU Affero General Public License 3.0
- Local material: `public/slicer-icons/creality-print.png`
- License copy: `licenses/Creality-Print-AGPL-3.0.txt`
- Changes: converted from the macOS ICNS container to PNG; the artwork is
  otherwise unmodified.

Creality Print and its icon remain the property of their respective owners.
Check Make uses the icon only to identify a compatible export target; no
sponsorship, certification, or endorsement is implied.
