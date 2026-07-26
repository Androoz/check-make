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
`stl_io`, `rfd`, and `zip`. Their inclusion does not imply endorsement of Check
Make.

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
companies. Check Make uses product names only to identify compatible target
applications and uses neutral text marks in its target picker. This does not
imply sponsorship, certification, or endorsement.
