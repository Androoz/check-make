# External evidence reuse and gap report

Generated: 2026-07-18

## Result

The catalog contains 7 external dataset records. Data access: raw-open: 2, metadata-only: 1, raw-restricted: 1, summary-only: 3. Integrity after local-import verification: metadata-verified: 7.

No external record is currently both locally checksum-verified and sufficiently scoped to replace Check Make's P1 confirmation. External work can already determine factor direction and test design; quantitative transfer remains gated by raw import, license review, and scope match.

The matcher deliberately separates source strength, data access, integrity, license, outcome match, and scope match. Publication alone never promotes a rule.

## P1-X1C-PLA-ADHESION

Consumer PLA adhesion screening on the default X1 Carbon reference profile

- Rules: G03, G04, G09, P07
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| ZENODO-FFF-DEFECT-IMAGES-2026 | directional | proxy | direction-only |
| FFF-BED-ADHESION-DEVICE-2022 | partial | proxy | direction-only |

## P1-X1C-PLA-OVERHANG

Consumer PLA unsupported-overhang screening on the default X1 Carbon reference profile

- Rules: G05, G06, G07, Q09, Q10
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| OVERHANG-PLA-2025-SUMMARY | partial | proxy | direction-only |

## P3-X1C-PLA-SURFACE

Consumer PLA inclined-surface quality on the default X1 Carbon reference profile

- Rules: G01, G08, Q03, Q05
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| METU-FFF-SURFACE-ROUGHNESS-2026 | partial | direct | direction-only |

## P2-X1C-PLA-TENSILE

Consumer PLA tensile behavior on the default X1 Carbon reference profile

- Rules: U01, U06, P02, Q01, Q02
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| NIST-AMB2018-03-PC-MATEX | directional | direct | direction-only |
| DAVE-PLA-TENSILE-2021-SUMMARY | partial | direct | direction-only |

## Rule coverage

| Rule | Group | External datasets | Current readiness |
|---|---|---|---|
| G01 | geometry | METU-FFF-SURFACE-ROUGHNESS-2026 | directional or import pending |
| G02 | geometry | — | no external dataset |
| G03 | geometry | ZENODO-FFF-DEFECT-IMAGES-2026, MENDELEY-FDM-DEFECT-IMAGES-2024, FFF-BED-ADHESION-DEVICE-2022 | directional or import pending |
| G04 | geometry | ZENODO-FFF-DEFECT-IMAGES-2026, MENDELEY-FDM-DEFECT-IMAGES-2024, FFF-BED-ADHESION-DEVICE-2022 | directional or import pending |
| G05 | geometry | OVERHANG-PLA-2025-SUMMARY | directional or import pending |
| G06 | geometry | OVERHANG-PLA-2025-SUMMARY | directional or import pending |
| G07 | geometry | OVERHANG-PLA-2025-SUMMARY | directional or import pending |
| G08 | geometry | METU-FFF-SURFACE-ROUGHNESS-2026 | directional or import pending |
| G09 | geometry | ZENODO-FFF-DEFECT-IMAGES-2026, MENDELEY-FDM-DEFECT-IMAGES-2024, FFF-BED-ADHESION-DEVICE-2022 | directional or import pending |
| G10 | geometry | — | no external dataset |
| U01 | usage | NIST-AMB2018-03-PC-MATEX, DAVE-PLA-TENSILE-2021-SUMMARY | directional or import pending |
| U02 | usage | — | no external dataset |
| U03 | usage | — | no external dataset |
| U04 | usage | — | no external dataset |
| U05 | usage | — | no external dataset |
| U06 | usage | NIST-AMB2018-03-PC-MATEX, DAVE-PLA-TENSILE-2021-SUMMARY | directional or import pending |
| U07 | usage | — | no external dataset |
| U08 | usage | — | no external dataset |
| U09 | usage | — | no external dataset |
| U10 | usage | — | no external dataset |
| M01 | material | — | no external dataset |
| M02 | material | — | no external dataset |
| M03 | material | — | no external dataset |
| M04 | material | — | no external dataset |
| M05 | material | — | no external dataset |
| M06 | material | — | no external dataset |
| M07 | material | — | no external dataset |
| M08 | material | — | no external dataset |
| M09 | material | — | no external dataset |
| M10 | material | — | no external dataset |
| P01 | process | — | no external dataset |
| P02 | process | NIST-AMB2018-03-PC-MATEX, DAVE-PLA-TENSILE-2021-SUMMARY | directional or import pending |
| P03 | process | — | no external dataset |
| P04 | process | — | no external dataset |
| P05 | process | — | no external dataset |
| P06 | process | — | no external dataset |
| P07 | process | ZENODO-FFF-DEFECT-IMAGES-2026, MENDELEY-FDM-DEFECT-IMAGES-2024, FFF-BED-ADHESION-DEVICE-2022 | directional or import pending |
| P08 | process | — | no external dataset |
| P09 | process | — | no external dataset |
| P10 | process | — | no external dataset |
| Q01 | quality | NIST-AMB2018-03-PC-MATEX, DAVE-PLA-TENSILE-2021-SUMMARY | directional or import pending |
| Q02 | quality | NIST-AMB2018-03-PC-MATEX, DAVE-PLA-TENSILE-2021-SUMMARY | directional or import pending |
| Q03 | quality | METU-FFF-SURFACE-ROUGHNESS-2026 | directional or import pending |
| Q04 | quality | — | no external dataset |
| Q05 | quality | METU-FFF-SURFACE-ROUGHNESS-2026, OVERHANG-PLA-2025-SUMMARY | directional or import pending |
| Q06 | quality | — | no external dataset |
| Q07 | quality | — | no external dataset |
| Q08 | quality | — | no external dataset |
| Q09 | quality | OVERHANG-PLA-2025-SUMMARY | directional or import pending |
| Q10 | quality | OVERHANG-PLA-2025-SUMMARY | directional or import pending |
| O01 | optimization | — | no external dataset |
| O02 | optimization | — | no external dataset |
| O03 | optimization | — | no external dataset |
| O04 | optimization | — | no external dataset |

## Next implementation actions

1. Obtain and inspect the METU FFF roughness tabular asset and its applicable license.
2. Import an open quantitative adhesion dataset or reproduce the open adhesion-force method.
3. Keep image-only defect datasets in the monitoring track, not the manufacturing-threshold track.
4. Use AMB2018-03 to test ingestion and structural-data provenance, not consumer PLA/PETG thresholds.
5. Generate a reduced local confirmation matrix only after raw external rows are normalized and matched to a locked target scope.
