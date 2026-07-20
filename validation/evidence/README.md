# External evidence ingestion

External publications enter Check Make in two separate steps:

1. `rules/evidence-datasets.yaml` records source quality, access, license, declared scope, outcomes, limitations, and candidate rules.
2. `evidence:import` converts an obtained raw asset into normalized append-only JSONL observations with source, mapping, and output SHA-256 identities.

Example:

```bash
npm run evidence:import -- \
  --input /path/to/source.csv \
  --mapping /path/to/mapping.yaml \
  --upstream /path/to/original-source.xlsx \
  --output validation/evidence/imported/DATASET-ID
npm run evidence:report
```

Import does not promote a rule. The dataset must additionally pass license review, integrity verification, outcome matching, scope matching, model validation, and held-out confirmation.

When a published workbook must first be flattened to CSV, pass the untouched workbook with `--upstream`. The manifest then records both the reviewed tabular extract and the original published asset by SHA-256.
