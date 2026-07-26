# Contributing to Check Make

By submitting a contribution, you agree that it may be distributed under the
project's [MIT license](LICENSE). Do not contribute code, models, data, images,
or other material unless you have the right to do so and can identify any
required attribution.

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
- Record the source, license, integrity, and scope of imported evidence. Do not
  commit material whose reuse terms are unknown or restricted.
- Modified distributions must follow the [Check Make trademark
  policy](TRADEMARKS.md) and preserve applicable
  [third-party notices](THIRD_PARTY_NOTICES.md).

## Pull requests

Describe the user-visible outcome, changed capability boundaries, verification performed, and any installed software or hardware required to reproduce the result. Keep unrelated worktree changes out of the pull request.

Never include API keys, signing material, private models, personal exports, or
unsanitized local paths in a pull request. Report vulnerabilities according to
[SECURITY.md](SECURITY.md).
