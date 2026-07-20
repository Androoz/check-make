# Contributing to Check Make

## Local setup

Check Make requires Node.js 20+, stable Rust/Cargo, and the Tauri 2 platform prerequisites.

```bash
npm install
npm run tauri dev
```

## Required verification

Before proposing a change, run the checks relevant to its scope:

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Installed-slicer integration tests are ignored by default and should be run only when the exact external application and profile library required by the test are available.

## Product and evidence rules

- Keep AI interpretation separate from deterministic geometry, compatibility, recommendation, and export decisions.
- Do not present heuristic thresholds as validated facts.
- Preserve evidence level, validation status, rule identifiers, and decision trace when changing recommendation logic.
- Do not claim FEM, load-path analysis, universal slicer-setting portability, or full mesh repair unless that capability has been implemented and validated.
- Keep export adapters visible even when the current printer is incompatible; distinguish compatibility from installation status.
- Add or update focused tests for changed behavior.

## Pull requests

Describe the user-visible outcome, changed capability boundaries, verification performed, and any installed software or hardware required to reproduce the result. Keep unrelated worktree changes out of the pull request.
