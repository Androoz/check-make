# Adhesion evidence review for the locked X1 Carbon profile

Reviewed: 2026-07-21

## Target

- Bambu Lab X1 Carbon
- Generic PLA; no filament brand lock
- 0.4 mm nozzle
- 0.20 mm layer height
- Textured PEI plate
- Bambu Studio

## Result

No openly downloadable, strand-level adhesion-force dataset was identified that matches textured PEI, a 0.4 mm nozzle, and consumer PLA closely enough to calibrate Check Make's brim or contact-area thresholds.

The closest quantitative publications are useful for factor direction and test design, not threshold fitting:

1. Spoerk et al. tested 16 three-layer PLA strands per setting on glass and polyimide using a 0.5 mm nozzle and 0.20 mm layers. The reported aggregates show a sharp force increase across the PLA glass-transition region. From 60 to 70 C, reported mean shear-off force rose from 51 to 322 N on polyimide and from 73 to 651 N on glass. Strand-level rows were not published.
2. Laumann et al. published an open adhesion measurement device and summarized repeated tests across materials, surfaces, and bed temperatures. The linked Mendeley asset contains device design files and code, not normalized measurement rows. The reported PLA experiments use 0.8 or 1.0 mm nozzles, 0.5 mm layers, and brass, Pertinax, or borosilicate glass rather than textured PEI.

## Decision

- Keep G03, G04, G09, and P07 provisional.
- Do not infer a textured-PEI force threshold from plotted means or digitized figures.
- Use the publications to define the minimum schema for acceptable raw evidence: per-specimen force, contact geometry and area, material family, bed temperature, surface and condition, nozzle, first-layer height, print speed, removal delay, printer, slicer, and replication/order.
- Continue to abstain from reducing brim/contact safeguards until raw scope-matched observations are available.

## Next acquisition gate

The next usable input is either author-supplied raw strand observations from a published study or another openly licensed dataset containing per-specimen force measurements and explicit textured-PEI metadata. Once obtained, it must be normalized, checksum-verified, and passed through the scope matcher before any fit is permitted.
