# AI and 3MF architecture

## Recommended AI path

Check Make renders the model and calculates deterministic features locally. The AI receives a rendered view, dimensions, triangle count, overhang/contact estimates, candidate orientations, sanitized naming clues from the file name or embedded model metadata, and any prior answers. Naming clues are explicitly unverified and cannot alone establish material, load, impact, or environment. The AI returns a constrained analysis object rather than changing the mesh directly.

```text
STL
 ├─ Rust geometry analysis ───────────────┐
 └─ Three.js rendered view ───────────────┤
                                          ▼
                               Intelligence provider
                         object + purpose + uncertainty
                                          │
                           consequential questions only
                                          ▼
                         deterministic validation/rules
                                          ▼
                              Manufacturing package
                         Core 3MF or slicer project adapter
```

The current provider contract supports a local fallback and OpenAI. Anthropic and local-model implementations can return the same `ModelIntelligence` structure.

## Why MCP is optional, not the primary provider

MCP connects an AI host to servers that expose tools, resources, and prompts. A ChatGPT or Claude application can therefore connect to a future Check Make MCP server and call geometry-analysis or 3MF-generation tools. That does not normally give this standalone desktop process permission to call the consumer product's model or reuse its subscription.

The practical desktop options are:

1. user-supplied provider API credentials;
2. a local model runtime such as Ollama or MLX;
3. a separate MCP-hosted experience where the user works in ChatGPT or Claude and Check Make runs as the tool server.

## Portable 3MF contract

The exported package follows the 3MF Core package layout and includes:

- one or more model parts in millimetres, retaining source vertex/triangle indices and material assignment when preservation is selected;
- the chosen orientation baked into vertex positions;
- degenerate triangles removed;
- application, orientation, and Check Make analysis metadata.

Core 3MF is broadly importable, but a portable file cannot guarantee that all slicers apply identical wall, infill, support, temperature, or speed settings. Those settings are embedded as advisory metadata.

For 3MF input, Check Make keeps the source package as the canonical export input. A separately flattened, non-indexed mesh is used only for preview and spatial analysis. The technical report therefore distinguishes source-indexed shells and non-manifold edges from spatially coincident edges. Normal export preserves the source geometry:

- **Preserve source:** retain original mesh parts and indices without cross-part welding.
- **Advanced shell packaging:** optionally convert disconnected indexed shells into explicit slicer parts for later material or color assignment. This changes object grouping, not mesh coordinates.

Prepare records whether reported topology is intentional, unresolved, or requires correction. Intentional and unresolved geometry can be exported with the source preserved and an appropriate status or warning. If the user confirms that the model should be one closed solid, manufacturing export is paused until a corrected source is imported. Check Make does not repair or boolean-union design geometry in the normal product flow.

The source-preservation or advanced-packaging choice and geometry-review status are stored in schema version 6 Check Make project/export metadata. Original source files are never overwritten. A gated Manifold boolean-union implementation remains available internally for controlled validation and experimentation, but is not presented as a user repair tool.

For a Bambu-family source project, preservation includes the project graph as well as mesh topology. Check Make indexes object metadata by source object ID, retains the original archive entries and `model_settings.config`, replaces the shared process profile, adds provenance metadata, and verifies plate IDs, names, object-instance assignments, identify IDs, geometry, and imported transforms after reopening. An empty plate graph is an explicit invariant: Check Make never invents or repacks build plates when the source contains no plate metadata.

When explicit source plates exist, each adapter declares one of two verified capabilities. Bambu Studio, OrcaSlicer, and Creality Print preserve one native Bambu-family multi-plate project with a shared process profile. PrusaSlicer, UltiMaker Cura, and generic Core 3MF export one native or portable project per source plate inside a ZIP bundle with a machine-readable manifest. The bundle removes only the common virtual-bed offset from each plate; relative instance placement is unchanged. An export is rejected if plate count, identity, instance mapping, geometry, or transforms cannot be verified.

## Project adapter contract

Check Make keeps one canonical recommendation list and translates it only at the export boundary:

```text
Canonical multipart Core 3MF + canonical recommendations
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
      Generic export       Slicer project adapter
   metadata is advisory    native profiles + validation
```

The implemented Bambu Studio, OrcaSlicer, PrusaSlicer, UltiMaker Cura, and Creality Print adapters:

1. resolve the installed slicer's machine, process, and filament profile inheritance;
2. overlays supported Check Make recommendations without changing the canonical rules;
3. write a native project 3MF with slicer-specific process settings;
4. validate the embedded values and, where applicable, active override markers before saving;
5. use the installed slicer's CLI where supported to verify effective settings after profile resolution.

Mapped settings are layer height, wall loops, top/bottom shells, infill pattern/density, support, brim, wall generator, wall/infill order, seam, nozzle temperature, and build-plate temperature. Build orientation is already baked into the corrected mesh. The high-level speed preset remains advisory because it is not one stable portable process key.

The OrcaSlicer adapter supports every printer exposed by the current UI through Orca's installed 0.4 mm machine profiles. For ordinary models Orca writes the final native project manifest. For explicit multi-plate sources Check Make uses copy-and-patch because Orca's headless re-export rejects that source graph; Orca still reopens the result and verifies effective settings. The PrusaSlicer adapter supports MK4S and CORE One, resolves the PrusaResearch profile inheritance bundled with the detected application, and asks PrusaSlicer to reopen and export each plate project's effective settings before adding it to the bundle. The UltiMaker Cura adapter writes Cura's machine, extruder, material, and quality-change containers into a workspace for every imported plate. Cura does not expose a stable headless project-settings round-trip here, so Check Make validates the workspace structure and embedded values and reports that boundary as a warning. Creality Print supports the Bambu Lab and Creality profiles present in its installed library. Its multi-plate path retains the source graph and validates embedded settings and active override markers without launching the slicer, because Creality Print 7.2 on macOS can crash during automated reopen.

Cura 5 uses its Arachne wall engine without a separate portable wall-generator setting, so the `wall_generator` recommendation is reported as inherently satisfied rather than stored as an independent Cura key. The high-level speed preset remains advisory in all adapters where no stable single process key exists.

Primary references:

- [MCP architecture](https://modelcontextprotocol.io/specification/2025-06-18/architecture)
- [OpenAI model and image-input capabilities](https://developers.openai.com/api/docs/models)
- [3MF specifications](https://3mf.io/spec/)
- [3MF compatibility matrix](https://3mf.io/compatibility-matrix/)
