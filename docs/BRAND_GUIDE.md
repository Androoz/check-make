# Check Make visual identity

## Core idea

The symbol combines two literal ideas:

- the isometric cube is the digital 3D model and the object being made;
- the light green check mark is the verified manufacturing decision.

The check crosses and visually completes the cube. There are no decorative halves or unexplained shapes.

## Name and wordmark

Use **Check Make** in prose and product metadata. Use **CHECK / MAKE** as the display wordmark. The slash describes the hand-off from checking a model to making it.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Make Green | `#35C98B` | Checks, active states, highlights |
| Action Green | `#168866` | Accessible buttons and text on light surfaces |
| Technical Ink | `#171A19` | Wordmark, app-icon field, primary text |
| Warm White | `#F7F7F2` | Brand surfaces |
| Cool Canvas | `#F3F5F4` | Application background |

Make Green is the profile color, but it is not used for small text on white. Action Green provides the necessary contrast in those cases.

## Assets

- `assets/check-make-symbol.svg` — transparent symbol for light backgrounds
- `assets/check-make-icon.svg` — app-icon master with a dark field
- `assets/check-make-wordmark.svg` — horizontal display lockup
- `public/` — browser-ready copies used by the React application
- `src-tauri/icons/` — generated platform assets used by Tauri bundles

Keep clear space around the symbol equal to at least half the width of the check-mark stroke. Do not recolor the cube green, rotate the mark, add gradients, or separate the check from the cube.
