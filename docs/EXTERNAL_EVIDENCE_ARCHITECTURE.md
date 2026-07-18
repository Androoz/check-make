# External evidence architecture

Date: 2026-07-18

## Purpose

Check Make reuses external experiments without treating publication, peer review, or a large row count as proof that an exact manufacturing threshold transfers to another printer, material product, geometry, or outcome.

The external evidence path is separate from runtime rule evaluation:

1. `rules/evidence-sources.yaml` records bibliographic claims and limitations.
2. `rules/evidence-datasets.yaml` records data access, source strength, license, integrity, declared scope, measured outcomes, variables, and candidate rules.
3. A mapping converts an obtained CSV, JSON, or JSONL asset into normalized observations.
4. Import writes append-only JSONL plus SHA-256 identities for the source, mapping, and normalized output.
5. The scope matcher compares process, material product/family, printer/model/kinematics, nozzle, layer height, enclosure, geometry class, and outcome.
6. Only eligible evidence may enter a model fit; rule promotion still requires held-out confirmation.

## Independent decision axes

- **Source strength:** benchmark, peer-reviewed experiment, curated dataset, manufacturer study, or community observation.
- **Access:** open raw data, restricted raw data, summary only, or metadata only.
- **Integrity:** unverified, metadata verified, or locally checksum verified.
- **License:** analysis allowed, restricted, or unresolved.
- **Outcome match:** direct, declared proxy, or none.
- **Scope match:** exact, close, partial, directional, or none.

These axes must not be collapsed into a single confidence percentage.

## Eligibility states

- `eligible-for-fit`: locally checksum-verified raw observations, analysis permitted, direct outcome, and exact/close scope.
- `eligible-as-prior`: verified observations are relevant but only partially transferable or use a declared proxy.
- `import-required`: an open raw asset appears relevant but has not been normalized and checksum verified.
- `direction-only`: useful for factor selection, test design, or qualitative rationale but not a numerical boundary.
- `excluded`: wrong process/outcome or prohibited analysis.

## Commands

Regenerate the current coverage and gap report:

```bash
npm run evidence:report
```

Import an obtained raw asset with a reviewed mapping:

```bash
npm run evidence:import -- \
  --input /path/to/source.csv \
  --mapping /path/to/mapping.yaml \
  --output validation/evidence/imported/DATASET-ID
npm run evidence:report
```

The report verifies a local import's normalized-observation checksum before upgrading its integrity at report time. Import does not edit rule thresholds or evidence levels.

## Current conclusion

Seven external dataset records are cataloged. None is currently both locally checksum verified and sufficiently matched to the default consumer-PLA reference scopes to support quantitative structural reductions. This does not create a test task for an ordinary user: Check Make issues a conservative plan after the use requirements are complete and abstains from the unsupported reduction. The external records already improve test-factor selection and explain why PC industrial benchmarks, image-only defect datasets, and summarized PLA studies must not be pooled as if they were interchangeable.

See `docs/EXTERNAL_EVIDENCE_GAP_REPORT.md` for per-target and per-rule coverage.
