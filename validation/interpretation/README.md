# Interpretation validation

`context-corpus.v1.json` is the versioned deterministic baseline for English Context interpretation. Check Make does not promise Swedish-language interpretation.

Each case declares only the conclusions that the supplied text supports. `expectedUnknown` is an intentional abstention: Check Make should ask or remain unresolved instead of inventing a requirement.

Run:

```bash
npm run interpretation:report
```

The report keeps these measures separate:

- **confirmation coverage** — explicit expected requirements inferred correctly;
- **false-confirmation rate** — scored requirements assigned an unsupported or wrong non-unknown value;
- **unknown abstention rate** — intentionally unknown requirements kept unknown;
- **issue coverage** — expected ambiguity or conflict prompts produced;
- **facet coverage** — expected structured facts present and explicitly absent facts suppressed.
- **language-cue coverage** — safety-relevant misspellings surfaced for confirmation rather than silently normalized.
- **correction coverage** — reviewed English compounds, inflections, and harmless typo aliases applied as expected.

New phrase rules must add or update corpus cases. Safety-relevant expansion must not increase false confirmations merely to improve coverage.
