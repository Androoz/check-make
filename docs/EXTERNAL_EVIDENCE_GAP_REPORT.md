# External evidence reuse and gap report

Generated: 2026-07-21

## Result

The catalog contains 11 external dataset records. Data access: raw-open: 4, metadata-only: 1, summary-only: 5, raw-restricted: 1. Integrity after local-import verification: metadata-verified: 9, checksum-verified: 2.

No external record is currently both locally checksum-verified and sufficiently scoped to replace Check Make's P1 confirmation. External work can already determine factor direction and test design; quantitative transfer remains gated by raw import, license review, and scope match.

The matcher deliberately separates source strength, data access, integrity, license, outcome match, and scope match. Publication alone never promotes a rule.

## Verified observation notes

Replicate-mean scan-deviation RMSE (three prints per cell): easy arc: 0.063 mm; easy wave: 0.042 mm; medium arc: 0.050 mm; medium wave: 0.051 mm; hard arc: 0.118 mm; hard wave: 0.053 mm. These descriptive means preserve print-level replication and do not establish significance or an X1 Carbon threshold.

## P1-X1C-PLA-ADHESION

Consumer PLA adhesion screening on the default X1 Carbon reference profile

- Rules: G03, G04, G09, P07
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| ZENODO-FFF-DEFECT-IMAGES-2026 | directional | proxy | direction-only |
| FFF-BED-ADHESION-DEVICE-2022 | directional | proxy | direction-only |
| SPOERK-PLA-BED-TEMP-2018 | directional | proxy | direction-only |

## P3-X1C-PLA-ADHESION-FORCE

Quantitative PLA first-layer adhesion force on the locked X1 Carbon reference profile

- Rules: G03, G04, G09, P07
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| FFF-BED-ADHESION-DEVICE-2022 | directional | direct | direction-only |
| SPOERK-PLA-BED-TEMP-2018 | directional | direct | direction-only |

## P1-X1C-PLA-OVERHANG

Consumer PLA unsupported-overhang screening on the default X1 Carbon reference profile

- Rules: G05, G06, G07, Q09, Q10
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| MENDELEY-WAVE-OVERHANG-2026 | directional | proxy | direction-only |
| OVERHANG-PLA-2025-SUMMARY | partial | proxy | direction-only |

## P3-X1C-PLA-SURFACE

Consumer PLA inclined-surface quality on the default X1 Carbon reference profile

- Rules: G01, G08, Q03, Q05
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| METU-FFF-SURFACE-ROUGHNESS-2026 | partial | direct | direction-only |
| MENDELEY-PLA-PROCESS-QUALITY-2026 | directional | direct | direction-only |

## P2-X1C-PLA-TENSILE

Consumer PLA tensile behavior on the default X1 Carbon reference profile

- Rules: U01, U06, P02, Q01, Q02
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| NIST-AMB2018-03-PC-MATEX | directional | direct | direction-only |
| DAVE-PLA-TENSILE-2021-SUMMARY | partial | direct | direction-only |

## P3-X1C-PLA-PROCESS-SURFACE

Consumer PLA process-to-surface-quality evidence on the locked X1 Carbon reference profile

- Rules: G08, P01, Q03, Q05, Q07, Q08
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| METU-FFF-SURFACE-ROUGHNESS-2026 | directional | direct | direction-only |
| MENDELEY-PLA-PROCESS-QUALITY-2026 | directional | direct | direction-only |

## P3-X1C-PLA-DIMENSIONAL

Consumer PLA dimensional-error evidence on the locked X1 Carbon reference profile

- Rules: Q03, Q04
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| MENDELEY-PLA-PROCESS-QUALITY-2026 | directional | direct | direction-only |

## P3-X1C-PLA-HORIZONTAL-OVERHANG

Support-free horizontal-overhang evidence on the locked X1 Carbon reference profile

- Rules: G05, G06, G07, Q09, Q10
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| MENDELEY-WAVE-OVERHANG-2026 | directional | direct | direction-only |

## P3-X1C-PLA-FLEXURAL

PLA flexural evidence on the locked X1 Carbon reference profile

- Rules: U06
- Best current eligibility: **direction-only**
- Action: External evidence is directional only; local screening remains required.

| Dataset | Scope | Outcome | Eligibility |
|---|---|---|---|
| KONTAXIS-X1C-PLA-FLEXURAL-2025 | partial | direct | direction-only |

## Rule coverage

| Rule | Group | External datasets | Current readiness |
|---|---|---|---|
| G01 | geometry | METU-FFF-SURFACE-ROUGHNESS-2026 | directional or import pending |
| G02 | geometry | — | no external dataset |
| G03 | geometry | ZENODO-FFF-DEFECT-IMAGES-2026, MENDELEY-FDM-DEFECT-IMAGES-2024, FFF-BED-ADHESION-DEVICE-2022, SPOERK-PLA-BED-TEMP-2018 | directional or import pending |
| G04 | geometry | ZENODO-FFF-DEFECT-IMAGES-2026, MENDELEY-FDM-DEFECT-IMAGES-2024, FFF-BED-ADHESION-DEVICE-2022, SPOERK-PLA-BED-TEMP-2018 | directional or import pending |
| G05 | geometry | MENDELEY-WAVE-OVERHANG-2026, OVERHANG-PLA-2025-SUMMARY | verified raw candidate |
| G06 | geometry | MENDELEY-WAVE-OVERHANG-2026, OVERHANG-PLA-2025-SUMMARY | verified raw candidate |
| G07 | geometry | MENDELEY-WAVE-OVERHANG-2026, OVERHANG-PLA-2025-SUMMARY | verified raw candidate |
| G08 | geometry | METU-FFF-SURFACE-ROUGHNESS-2026, MENDELEY-PLA-PROCESS-QUALITY-2026 | verified raw candidate |
| G09 | geometry | ZENODO-FFF-DEFECT-IMAGES-2026, MENDELEY-FDM-DEFECT-IMAGES-2024, FFF-BED-ADHESION-DEVICE-2022, SPOERK-PLA-BED-TEMP-2018 | directional or import pending |
| G10 | geometry | — | no external dataset |
| U01 | usage | NIST-AMB2018-03-PC-MATEX, DAVE-PLA-TENSILE-2021-SUMMARY | directional or import pending |
| U02 | usage | — | no external dataset |
| U03 | usage | — | no external dataset |
| U04 | usage | — | no external dataset |
| U05 | usage | — | no external dataset |
| U06 | usage | NIST-AMB2018-03-PC-MATEX, KONTAXIS-X1C-PLA-FLEXURAL-2025, DAVE-PLA-TENSILE-2021-SUMMARY | directional or import pending |
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
| P01 | process | MENDELEY-PLA-PROCESS-QUALITY-2026 | verified raw candidate |
| P02 | process | NIST-AMB2018-03-PC-MATEX, DAVE-PLA-TENSILE-2021-SUMMARY | directional or import pending |
| P03 | process | — | no external dataset |
| P04 | process | — | no external dataset |
| P05 | process | — | no external dataset |
| P06 | process | — | no external dataset |
| P07 | process | ZENODO-FFF-DEFECT-IMAGES-2026, MENDELEY-FDM-DEFECT-IMAGES-2024, FFF-BED-ADHESION-DEVICE-2022, SPOERK-PLA-BED-TEMP-2018 | directional or import pending |
| P08 | process | — | no external dataset |
| P09 | process | — | no external dataset |
| P10 | process | — | no external dataset |
| Q01 | quality | NIST-AMB2018-03-PC-MATEX, DAVE-PLA-TENSILE-2021-SUMMARY | directional or import pending |
| Q02 | quality | NIST-AMB2018-03-PC-MATEX, DAVE-PLA-TENSILE-2021-SUMMARY | directional or import pending |
| Q03 | quality | METU-FFF-SURFACE-ROUGHNESS-2026, MENDELEY-PLA-PROCESS-QUALITY-2026 | verified raw candidate |
| Q04 | quality | MENDELEY-PLA-PROCESS-QUALITY-2026 | verified raw candidate |
| Q05 | quality | METU-FFF-SURFACE-ROUGHNESS-2026, MENDELEY-PLA-PROCESS-QUALITY-2026, OVERHANG-PLA-2025-SUMMARY | verified raw candidate |
| Q06 | quality | — | no external dataset |
| Q07 | quality | MENDELEY-PLA-PROCESS-QUALITY-2026 | verified raw candidate |
| Q08 | quality | MENDELEY-PLA-PROCESS-QUALITY-2026 | verified raw candidate |
| Q09 | quality | MENDELEY-WAVE-OVERHANG-2026, OVERHANG-PLA-2025-SUMMARY | verified raw candidate |
| Q10 | quality | MENDELEY-WAVE-OVERHANG-2026, OVERHANG-PLA-2025-SUMMARY | verified raw candidate |
| O01 | optimization | — | no external dataset |
| O02 | optimization | — | no external dataset |
| O03 | optimization | — | no external dataset |
| O04 | optimization | — | no external dataset |

## Next implementation actions

1. Use the imported wave-overhang observations for path-strategy and geometry-difficulty interaction only, not a standard X1 Carbon support threshold.
2. Seek raw specimen rows for the exact-scope X1 Carbon PLA flexural study or another CoreXY study with nozzle and build-surface metadata.
3. Treat the Spoerk and Laumann adhesion studies as test-design evidence only: their quantitative results are aggregates and their build surfaces do not match textured PEI.
4. Seek author-supplied strand-level rows or another open quantitative adhesion dataset with textured-PEI surface metadata before fitting the first-layer track.
5. Keep image-only defect datasets in the monitoring track, not the manufacturing-threshold track.
6. Generate a reduced confirmation matrix only after raw external rows are normalized and sufficiently matched to the locked target scope.
