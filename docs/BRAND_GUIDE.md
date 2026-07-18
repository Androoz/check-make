# Check Make visual identity

## Core idea

The symbol combines three literal ideas:

- the blueprint half is the analyzed digital design;
- the manufactured half is the physical object being made;
- the light green check mark is the verified manufacturing decision.

The check crosses the exact centre split and connects design to manufactured result.

## Name and wordmark

Use **Check Make** in prose and product metadata. Use **CHECK / MAKE** as the display wordmark. The slash describes the hand-off from checking a model to making it.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Make Green | `#35C98B` | Checks, active states, highlights |
| Action Green | `#168866` | Accessible buttons and text on light surfaces |
| Blueprint Navy | `#073A60` | Blueprint field in the app icon |
| Technical Cyan | `#8DDCFF` | Blueprint grid and construction lines |
| Technical Ink | `#171A19` | Wordmark, app-icon field, primary text |
| Warm White | `#F7F7F2` | Brand surfaces |
| Cool Canvas | `#F3F5F4` | Application background |

Make Green is the profile color, but it is not used for small text on white. Action Green provides the necessary contrast in those cases.

## Assets

- `assets/check-make-icon.png` — canonical 1024 × 1024 app-icon master; preserve this approved raster artwork exactly
- `assets/check-make-icon.svg` — editable vector approximation, not the source used for platform icons
- `assets/check-make-brand-reference.png` — supplied raster artwork containing the approved symbol and wordmark
- `assets/check-make-symbol.png` — canonical interface symbol, cropped without redrawing from the approved raster artwork
- `assets/check-make-wordmark.png` — canonical horizontal `CHECK / MAKE` display lockup, cropped without redrawing from the approved raster artwork
- `assets/check-make-symbol.svg` and `assets/check-make-wordmark.svg` — editable vector approximations retained as alternatives; they are not used by the application
- `assets/check-make-favicon.svg` — simplified source artwork for small raster icons
- `public/favicon-32.png` and `public/favicon-64.png` — raster browser icons generated from the simplified source
- `public/` — browser-ready PNG copies of the canonical symbol and wordmark assets
- `src-tauri/icons/` — generated platform assets used by Tauri bundles

Generate the native platform icon set from the approved PNG master:

```sh
npm run tauri icon assets/check-make-icon.png
```

Keep clear space around the symbol equal to at least half the width of the check-mark stroke. Do not recolor the cube green, rotate the mark, add gradients, or separate the check from the cube.
