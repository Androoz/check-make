<img src="assets/check-make-wordmark.svg" alt="CHECK / MAKE" width="420">

**Let the model explain itself.**

Check Make is a local desktop assistant that analyzes a 3D model before asking the user to describe it. It combines deterministic mesh measurements with optional AI vision to identify likely object types and intended use, expose uncertainty, ask only consequential follow-up questions, and generate a broadly compatible Core 3MF manufacturing package.

## Desktop workflow

1. Drop or browse to an STL model. No use-case questionnaire is required.
2. Run local preliminary analysis or connect an OpenAI API key for vision-assisted analysis.
3. Review the likely object, purpose, geometric evidence, confidence, and any uncertainty-driven questions.
4. Select the target printer and review rule-validated material, orientation, and process recommendations.
5. Export either a portable Core 3MF or a slicer-native project 3MF containing the corrected model and applied settings.

## Run locally

Requires Node.js 20+, stable Rust/Cargo, and the Tauri 2 platform prerequisites.

```bash
npm install
npm run tauri dev
```

The OpenAI connection is optional. Entering an API key enables a Responses API request with mesh measurements and a rendered model view. The key is held only in application memory for the current session; it is not saved by Check Make.

## Verify and package

```bash
npm test
npm run build
cd src-tauri && cargo test
npm run tauri build
```

## Implemented in 0.2

- real macOS app-icon packaging plus visible in-app logo
- one native macOS title bar; the duplicate simulated title bar was removed
- native window-level drag-and-drop and file browser import
- local Rust STL analysis and interactive Three.js preview
- provider-neutral intelligence contract
- optional OpenAI vision analysis using a session-only user API key
- low-confidence follow-up questions instead of an up-front object questionnaire
- deterministic rules for material, orientation, compatibility, and process validation
- Core 3MF generation with millimetre units, baked orientation, removal of degenerate triangles, and Check Make analysis metadata
- an export adapter registry that detects Bambu Studio, OrcaSlicer, PrusaSlicer, and UltiMaker Cura
- Bambu Studio project export using the installed application's machine, process, and filament profiles
- deterministic mapping of layer height, walls, shells, infill, support, brim, wall generator/order, seam, and temperatures into Bambu settings
- post-export validation by reopening the generated project with Bambu Studio

## Important boundaries

- An STL does not contain semantics, load direction, environment, or intended use. AI output is therefore presented as a hypothesis with evidence and confidence.
- The current AI request uses one rendered view plus mesh measurements. Multi-view rendering and richer topology features are the next analysis milestone.
- MCP is not a mechanism for a standalone app to reuse a consumer ChatGPT or Claude subscription. Check Make currently supports direct OpenAI API access. A future Check Make MCP server could let ChatGPT or Claude use Check Make as a tool, but that is a different interaction model.
- Generic Core 3MF makes geometry, units, transforms, and metadata portable, but its process settings remain advisory. The Bambu Studio adapter creates a native project 3MF and validates it through the locally installed Bambu Studio CLI. OrcaSlicer, PrusaSlicer, and Cura are detected but their project adapters are clearly marked as planned rather than emitting misleading files.
- Native project export depends on the target slicer being installed. Bambu export currently supports the bundled 0.4 mm profiles for X1 Carbon, P1S, A1, and A1 mini.
- Bambu Studio does not expose a single portable `speed preset` setting through this export path, so that recommendation remains advisory and is reported as a warning.
- Basic export correction currently removes degenerate triangles and bakes the selected orientation. Full manifold repair, hole closing, self-intersection repair, and dimensional geometry changes remain future work.

See [the AI and 3MF architecture](docs/AI_3MF_ARCHITECTURE.md) and [Desktop MVP specification](docs/MVP_SPEC.md).

The checked-cube logo, app icon, wordmark, colors, and usage rules are documented in the [visual identity guide](docs/BRAND_GUIDE.md).
