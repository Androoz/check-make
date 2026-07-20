<img src="assets/check-make-wordmark.svg" alt="CHECK / MAKE" width="420">

**Let the model explain itself.**

Check Make is a local desktop assistant that analyzes a 3D model before asking the user to describe it. It combines deterministic mesh measurements with optional AI vision to identify likely object types and intended use, expose uncertainty, ask only consequential follow-up questions, and generate a broadly compatible Core 3MF manufacturing package.

## Desktop workflow

Check Make stays in one continuous model-first workspace. Its process indicator is derived from project state rather than acting as page navigation:

1. **Inspect:** drop or browse to an STL, 3MF, or OBJ model, select the target printer, and run local or optional OpenAI-assisted interpretation.
2. **Prepare:** review the geometry, likely purpose, evidence, uncertainty, material, orientation, and process plan; answer only questions that can materially change the recommendation.
3. **Export:** explicitly accept a ready plan, then create a portable Core 3MF or compatible slicer-native project with validated settings.

Changing the model, printer, or a decision that affects the plan returns the workflow to the appropriate earlier state instead of silently exporting stale recommendations.

## Run locally

Requires Node.js 20+, stable Rust/Cargo, and the Tauri 2 platform prerequisites.

```bash
npm install
npm run tauri dev
```

The OpenAI connection is optional. Entering an API key enables a Responses API request with mesh measurements and a labelled four-view model montage. The key is held only in application memory for the current session; it is not saved by Check Make.

## Verify and package

```bash
npm test
npm run build
cd src-tauri && cargo test
npm run tauri build
```

Maintainers can generate and check the optional physical P1 geometry pilot with `npm run p1:generate` and `npm run p1:verify`; ordinary users are not expected to run it. External observations are cataloged and scope-matched with `npm run evidence:report`; see the [external evidence architecture](docs/EXTERNAL_EVIDENCE_ARCHITECTURE.md) and [generated gap report](docs/EXTERNAL_EVIDENCE_GAP_REPORT.md). See [P1 geometry validation](docs/P1_GEOMETRY_VALIDATION.md) before locking a printer/material scope or recording observations.

## Implemented in 0.2

- one continuous branded **Inspect → Prepare → Export** workspace with state-derived progress, persistent project context, contextual uncertainty, expandable evidence, and gated export
- native application-menu commands for opening and saving `.checkmake` projects with standard macOS shortcuts
- real macOS app-icon packaging plus visible in-app logo
- one native macOS title bar; the duplicate simulated title bar was removed
- native window-level drag-and-drop and file browser import
- STL, 3MF, and OBJ mesh import with normalized local analysis and interactive Three.js preview
- save and reopen `.checkmake` project files that preserve the source model, analysis state, printer, answers, and export target
- provider-neutral intelligence contract
- optional OpenAI vision analysis using a session-only user API key
- adaptive structured follow-up questions instead of an up-front object questionnaire; review and export stay gated until all decision-changing requirements are resolved
- P1 geometry measurements for normalized bed coverage, leverage proxies, centroid offset, and connected overhang regions
- P2 mesh topology findings, disconnected-part detection, visual geometry-risk overlays, printer-sized build plate, XYZ axes, fixed camera views, and explainable six-orientation comparison
- deterministic rules for material, orientation, compatibility, and process validation
- Core 3MF generation with millimetre units, baked orientation, removal of degenerate triangles, and Check Make analysis metadata
- export targets for OrcaSlicer, PrusaSlicer, UltiMaker Cura, and Creality Print, plus installed-slicer detection
- direct Bambu Studio project export using the installed application's machine, process, and filament profiles without launching the slicer
- native OrcaSlicer project export for every printer in the UI, with installed profile resolution and effective-setting validation
- native PrusaSlicer project export for MK4S and CORE One, using the bundled Prusa profiles and effective-setting validation in PrusaSlicer
- native UltiMaker Cura workspace export for ELEGOO Neptune 4 Pro and Creality Ender-3 V3 SE/KE, with installed machine/material/nozzle profiles and embedded-setting validation
- native Creality Print project export for compatible installed profiles, with embedded setting and active-override validation
- deterministic mapping of layer height, walls, shells, infill, support, brim, wall generator/order, seam, and temperatures into Bambu Studio, OrcaSlicer, PrusaSlicer, and Creality Print settings
- active Bambu project-override markers so mapped values survive profile loading instead of reverting to system defaults
- structural and setting-level validation before the generated project is saved, plus an integration test of Bambu Studio's effective settings
- post-export reopening with a visible validation report for package structure, geometry, units, placement, provenance, and native settings entries
- direct “Open in Bambu Studio” using a temporary project, alongside permanent “Save project…” export

## Important boundaries

- An STL does not contain semantics, load direction, environment, or intended use. AI output is therefore presented as a hypothesis with evidence and explicit unknown states.
- Interpretation v2 uses a four-view montage plus deterministic mesh measurements and records status, source, evidence, and confidence per manufacturing requirement. Arbitrary-angle orientation search remains a future analysis milestone.
- Lower cost and Lower weight are temporarily removed. Reliable estimates require complete slicer toolpaths for walls, infill, shells, support, and brim; mesh-volume or bounding-box estimates would imply false precision. OrcaSlicer export remains available, but Check Make no longer launches OrcaSlicer to calculate these alternatives.
- MCP is not a mechanism for a standalone app to reuse a consumer ChatGPT or Claude subscription. Check Make currently supports direct OpenAI API access. A future Check Make MCP server could let ChatGPT or Claude use Check Make as a tool, but that is a different interaction model.
- Generic Core 3MF export makes geometry, units, transforms, and metadata portable, but its process settings remain advisory. The Bambu Studio, OrcaSlicer, PrusaSlicer, UltiMaker Cura, and Creality Print adapters write native project structures and validate mapped settings before saving.
- Native project export depends on the target slicer being installed. Bambu export supports X1 Carbon, P1S, A1, and A1 mini; OrcaSlicer supports all twelve 0.4 mm printer profiles shown in the UI; PrusaSlicer supports MK4S and CORE One; UltiMaker Cura supports ELEGOO Neptune 4 Pro and Creality Ender-3 V3 SE/KE; Creality Print supports the Bambu Lab and Creality profiles available in its installed library.
- Bambu Studio does not expose a single portable `speed preset` setting through this export path, so that recommendation remains advisory and is reported as a warning.
- Basic export correction currently removes degenerate triangles and bakes the selected orientation. Full manifold repair, hole closing, self-intersection repair, and dimensional geometry changes remain future work.
- STEP/STP import is intentionally deferred because CAD boundary-representation data requires a separately evaluated tessellation engine; it is not treated as a mesh-format variation.

See [P2 model analysis](docs/P2_MODEL_ANALYSIS.md), [the printer support roadmap](docs/ROADMAP.md), [the AI and 3MF architecture](docs/AI_3MF_ARCHITECTURE.md), and [Desktop MVP specification](docs/MVP_SPEC.md).

Manufacturing rules are currently provisional. See the [rule evidence audit and validation plan](docs/RULE_EVIDENCE_AUDIT.md), [P1 geometry validation](docs/P1_GEOMETRY_VALIDATION.md), the [per-rule evidence mapping](rules/rule-evidence.yaml), and the [source catalog](rules/evidence-sources.yaml).

The checked-cube logo, app icon, wordmark, colors, and usage rules are documented in the [visual identity guide](docs/BRAND_GUIDE.md).
