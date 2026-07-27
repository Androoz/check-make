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

- one model mesh in millimetres;
- the chosen orientation baked into vertex positions;
- degenerate triangles removed;
- application, orientation, and Check Make analysis metadata.

Core 3MF is broadly importable, but a portable file cannot guarantee that all slicers apply identical wall, infill, support, temperature, or speed settings. Those settings are embedded as advisory metadata.

## Project adapter contract

Check Make keeps one canonical recommendation list and translates it only at the export boundary:

```text
Corrected Core 3MF + canonical recommendations
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

The OrcaSlicer adapter supports every printer exposed by the current UI through Orca's installed 0.4 mm machine profiles. Check Make supplies resolved machine, process, filament, orientation, and geometry inputs, then lets the detected OrcaSlicer build write the final native project manifest and Orca identity before reopening it and verifying effective settings. The PrusaSlicer adapter supports MK4S and CORE One, resolves the PrusaResearch profile inheritance bundled with the detected application, and asks PrusaSlicer to reopen and export the project's effective settings before saving. The UltiMaker Cura adapter supports ELEGOO Neptune 4 Pro because that is the exact UI printer present in Cura 5.13's installed library; it writes Cura's machine, extruder, material, and quality-change containers into the 3MF workspace. Its container stacks use Cura's `empty_user_changes` sentinel, and the Core 3MF build item is explicitly translated to the selected printer's build-plate center. Cura does not expose a stable headless project-settings round-trip here, so Check Make validates the workspace structure and embedded values and reports that boundary as a warning. Creality Print supports the Bambu Lab and Creality profiles present in its installed library and disables the native target for unsupported printers. Creality Print 7.2 on macOS can crash in its CLI/GUI initialization while reopening an otherwise valid project, so Check Make deliberately does not launch it during export. Instead, Check Make validates the 3MF structure, embedded settings, and active override markers and reports that validation boundary without triggering the unsafe round-trip.

Cura 5 uses its Arachne wall engine without a separate portable wall-generator setting, so the `wall_generator` recommendation is reported as inherently satisfied rather than stored as an independent Cura key. The high-level speed preset remains advisory in all adapters where no stable single process key exists.

Primary references:

- [MCP architecture](https://modelcontextprotocol.io/specification/2025-06-18/architecture)
- [OpenAI model and image-input capabilities](https://developers.openai.com/api/docs/models)
- [3MF specifications](https://3mf.io/spec/)
- [3MF compatibility matrix](https://3mf.io/compatibility-matrix/)
