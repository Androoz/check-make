# Filament product profiles

Check Make keeps reviewed filament products in the versioned data registry
`src/material/filament-products.v1.json`. Product data must not be added directly
to React components or deterministic planning code.

## Schema version 1

Each entry contains:

- a stable product ID, manufacturer, product name, and Check Make material family;
- reviewed nozzle and build-plate ranges with one conservative starting value;
- enclosure and wear-resistant-nozzle requirements;
- an `active`, `stale`, or `retired` lifecycle state plus review-due date and
  optional replacement product;
- an explicit product variant, color scope, and reviewed nozzle diameters;
- a separate product-upgrade evidence state, supported benefits, source IDs,
  and unresolved blockers;
- bounded strengths and explicit limitations;
- an evidence source ID, source URL, and review date.

The application validates the registry at startup. It rejects unsupported schema
versions, duplicate IDs, unknown families or benefit labels, malformed sources,
review deadlines before the source review date, and starting temperatures
outside their declared ranges.

The current catalog contains ten reviewed processing profiles: one Prusament
and one Bambu Lab product for each of PLA, PETG, ASA, TPU, and PA-CF. This is
useful coverage for temperature and printer-capability checks, not a claim that
these two manufacturers represent the full market.

## Lifecycle

- `active`: selectable while its source review remains current;
- `stale`: visible as historical project data but unavailable for a new
  selection until its source is reviewed again;
- `retired`: unavailable for new plans and may point to a replacement product.

An active profile automatically becomes effectively stale after `reviewDueAt`.
This keeps manufacturer guidance changes from silently remaining current
forever.

## Recommendation boundary

The deterministic material-family model decides whether a material direction can
preserve the confirmed requirements. A selected product profile may then replace
the family-level temperature starting points and add printer compatibility checks.
It does not establish part-level strength, fatigue life, creep performance, wear,
chemical resistance, or fitness for safety-critical use.

Product-driven upgrades have a separate hard gate. A product can only replace a
family-level recommendation for a named performance benefit when it is active,
has status `qualified`, cites scoped product evidence, names the supported
benefit, and has no unresolved blocker. All current profiles are deliberately
`temperature-profile-only`; therefore no current product can trigger an
automatic strength, stiffness, toughness, heat, fatigue, or creep upgrade.

## Native project export

Export validates that a selected product's family and reviewed starting
temperatures match the active manufacturing plan before writing a project.

- Bambu Studio, OrcaSlicer, and Creality Print projects receive the product name
  as embedded filament identity plus active nozzle/build-plate overrides.
- PrusaSlicer projects receive the product name as `filament_settings_id` plus
  active nozzle/build-plate overrides. Check Make verifies both the embedded
  project and PrusaSlicer's exported effective settings.
- Cura workspaces retain the compatible installed base-material definition,
  identify the selected product in the native extruder stack, and carry active
  nozzle/build-plate values in quality changes.
- Generic Core 3MF remains slicer-neutral; product identity and recommendations
  are advisory Check Make metadata there.

Tests create and reopen Bambu-family and Prusa-format archives without a slicer
dependency. Installed-slicer integration tests additionally cover Bambu Studio,
OrcaSlicer, and PrusaSlicer where those applications are available.

## Adding a profile

1. Add an authoritative source record to `rules/evidence-sources.yaml`.
2. Add the product to `src/material/filament-products.v1.json`.
3. Keep starting temperatures inside the manufacturer range.
4. Record variant/color/nozzle scope, lifecycle state, and a future review date.
5. Record printer requirements and limitations without turning product-page
   marketing into structural evidence.
6. Leave product upgrades unqualified unless scoped performance evidence has
   passed the promotion gate.
7. Extend `src/material/products.test.ts` for new families or schema behavior.
8. Run TypeScript, Rust, and applicable installed-slicer round-trip tests.
