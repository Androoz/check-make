# Wave-overhang source derivation

Source: Mendeley Data version 2, DOI `10.17632/xhw8xkjyc2.2`, CC BY 4.0.

The published ZIP is not duplicated in the repository. Its download URL and SHA-256 are recorded in the dataset catalog and generated import manifest. `scan-summary.csv` is a deterministic replicate-level summary of the 18 published Zeiss Inspect CSV files. Generate it from an extracted archive with:

```bash
npx vite-node validation/evidence/derive-wave-overhang.ts \
  --input "/path/to/3d scan files" \
  --output validation/evidence/raw/MENDELEY-WAVE-OVERHANG-2026/scan-summary.csv
```

Only rows whose `Property` is `dXYZ` are treated as point measurements. The published max/min/range/sigma summary rows are excluded. Each source file remains one experimental replicate; scan points are not promoted to independent print replicates.
