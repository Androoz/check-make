# AI and 3MF architecture

## Recommended AI path

Check Make renders the model and calculates deterministic features locally. The AI receives a rendered view, dimensions, triangle count, overhang/contact estimates, candidate orientations, and any prior answers. It returns a constrained analysis object rather than changing the mesh directly.

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

The implemented Bambu Studio adapter:

1. resolves the installed Bambu machine, process, and filament profile inheritance;
2. overlays supported Check Make recommendations without changing the canonical rules;
3. asks Bambu Studio to create the project 3MF;
4. marks mapped keys as active project overrides, validates their values and markers before saving, and uses an integration test to verify Bambu Studio's effective settings after profile resolution.

Mapped settings are layer height, wall loops, top/bottom shells, infill pattern/density, support, brim, wall generator, wall/infill order, seam, nozzle temperature, and build-plate temperature. Build orientation is already baked into the corrected mesh. The high-level speed preset remains advisory because it is not one portable Bambu process key.

The adapter registry also detects OrcaSlicer, PrusaSlicer, and UltiMaker Cura. Those targets stay disabled until their native project writers and round-trip validators are implemented; Check Make never labels a metadata-only file as a complete native project.

Primary references:

- [MCP architecture](https://modelcontextprotocol.io/specification/2025-06-18/architecture)
- [OpenAI model and image-input capabilities](https://developers.openai.com/api/docs/models)
- [3MF specifications](https://3mf.io/spec/)
- [3MF compatibility matrix](https://3mf.io/compatibility-matrix/)
