# Check Make 0.2.5

## Highlights

- Rebuilt the desktop shell as one continuous **Inspect → Prepare → Export** workspace.
- Replaced page-like workflow navigation with progress derived from the loaded model, completed analysis, unresolved decisions, explicit plan acceptance, and export readiness.
- Kept model, printer, recommended material, and analysis status visible in a persistent project-context panel.
- Kept Selected, Risk map, and Compare controls directly above the 3D model.
- Placed uncertainty beside the recommendation it can change and moved technical evidence into expandable detail.
- Kept every export adapter visible while separating installation status from target-printer compatibility.
- Added format, printer, material, recommendation, and setting iconography in the Check Make visual language.
- Added recognizable slicer application icons and vendor colors throughout Export.
- Moved the part-and-use description into Inspect alongside model and printer selection, and included it in the initial local or AI analysis.
- Removed material from the Inspect project context; material now appears only as a completed recommendation.
- Let explicit words in the Inspect description prefill matching Prepare decisions without overwriting manual choices.
- Kept Top Recommendations, Key Settings, and full plan alternatives hidden until the reviewed decisions have been applied.
- Replaced the duplicated Top Recommendations and Key Settings summaries with one grouped Recommended Key Settings view.
- Preserved the Key settings / All settings detail switch inside the consolidated recommendation view.
- Restored the previous readable sizing for group descriptions, setting rationale, and technical evidence.
- Moved per-setting rationale and optional technical evidence into Recommended Key Settings and removed the separate Evidence & rationale drawer.
- Renamed the former full-plan drawer to Trade-off alternatives and limited it to Fine-Tune optimization choices.
- Advanced keyboard focus to the next unanswered decision after each selection.
- Added native Open Project and Save Project application-menu commands with standard shortcuts.
- Added deterministic tests for workflow-state transitions, description-driven decision suggestions, and export unlocking.

## Verification

- Frontend production build passes.
- 84 TypeScript tests pass.
- 11 Rust tests pass; 9 installed-slicer integration tests remain intentionally ignored unless their external applications are present.
- The macOS DMG is built from the complete current worktree and verified with `hdiutil verify` before release.

## Important boundaries

- Check Make does not perform FEM or structural simulation.
- Manufacturing rules remain evidence-linked but provisional where validation scope is incomplete.
- Native slicer projects require the corresponding installed slicer and an implemented printer profile.
- Generic Core 3MF keeps process recommendations as Check Make metadata rather than a universally portable slicer-setting schema.
