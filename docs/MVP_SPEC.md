# OptimusPrint – teknisk MVP-specifikation

## Produktmål

OptimusPrint är en lokal Mac/Windows-app som omvandlar modellgeometri och användarens avsikt till spårbara rekommendationer för Bambu Studio. MVP:n stöder funktionella utskrifter, STL, PLA/PETG och X1C/P1S. Högst sju frågor används. Regelmotorn fattar besluten; framtida AI får endast förklara, upptäcka konflikter och formulera följdfrågor.

M1 lyckas när användaren kan importera en STL, se basrisker och få alla 13 inställningsområden med regel-ID, motivering och konfidens. Att skriva en 3MF eller starta Bambu Studio ingår inte.

## Arkitektur

```text
STL -> GeometryAnalyzer -> ModelAnalysis ┐
                                         ├-> RuleEngine -> PrintPlan -> React UI
7 svar -> Questionnaire -----------------┘
                                                    └-> ExplanationPort (senare AI)
```

- React/TypeScript äger flöde, formulär, 3D-vy och presentation.
- `GeometryAnalyzer` ska slutligt implementeras i Rust/Tauri. M1:s webbfallback använder Three.js `STLLoader` och samma kontrakt.
- `RuleEngine` är ren och deterministisk TypeScript. Den läser YAML och har ingen AI- eller nätverkskoppling.
- Regler sorteras stigande på `priority`; senare `set` vinner. Numeriska `min`/`max` sammanfogas. Alla bidragande regel-ID:n bevaras.
- `ExplanationPort` får läsa plan och evidens men aldrig ändra ett värde eller lägga till ett beslut.

## Repositorystruktur

```text
src/          React-app, geometriwebbfallback och domänkod
rules/        versionsstyrd YAML-regelkatalog
src-tauri/    Tauri-skal och Rust geometry boundary
docs/         spec och framtida valideringsunderlag
```

## Datamodeller och portar

Kanoniska kontrakt finns i `src/types.ts`: `ModelAnalysis`, `Questionnaire`, `Rule`, `RuleCondition`, `RuleAction` och `Recommendation`.

```ts
interface GeometryAnalyzer { analyze(input: ArrayBuffer): Promise<ModelAnalysis> }
interface RulesEngine { evaluate(rules: Rule[], model: ModelAnalysis, intent: Questionnaire): Recommendation[] }
interface ExplanationPort { explain(plan: Recommendation[], evidence: ModelAnalysis): Promise<Explanation[]> }
interface ProjectExporter { export3mf(plan: Recommendation[], source: File): Promise<Blob> }
```

Längder är mm, areor mm² och kvoter 0–1. `confidence` beskriver evidensens kvalitet, inte sannolikheten att utskriften lyckas.

## Modellanalys i M1

- Bounding box/höjd räknas exakt över trianglarnas koordinater.
- Plattkontakt summerar nästan horisontella trianglar nära min-Z. Det är inte slicerns första lager.
- Överhäng summerar nedåtvända trianglar över 45°. Vindningsfel, bryggor och lokalt stöd beaktas inte.
- Modellen stannar lokalt som en Three.js `BufferGeometry`.

M2 ska använda BVH/raycasting för lokala tjocklekar, komponenter, brokandidater och orienteringssökning.

## Frågor och regelkatalog

De sju svaren är skrivare, material, högsta prioritet, slagbelastning, kritisk passning, utomhusbruk och om support tillåts. Senare följdfrågor får ersätta irrelevanta frågor men totalen förblir högst sju.

`rules/mvp-rules.yaml` innehåller exakt 50 regler: G01–G10 geometry, U01–U10 usage, M01–M10 material, P01–P10 printer och Q01–Q10 quality. De täcker orientation, layer height, wall loops, top/bottom layers, infill type/%, support, brim, wall generator, wall order, seam och speed preset. Heuristikerna måste kalibreras med testkuponger. Temperatur, flöde och materialtorkning ingår inte.

## Riskregister

| Risk | Konsekvens | Åtgärd |
|---|---|---|
| STL saknar enheter | Fel skala | Visa mått; lägg senare till skaldialog |
| Fel triangelvindning | Fel överhäng | Märk estimat; inför mesh repair |
| Kontaktarea är inte första lagret | Falsk brim-signal | Låg konfidens; validera mot slicer |
| Råd uppfattas som facit | Misslyckad utskrift | Visa why, evidens och regel-ID |
| YAML-regler motsäger varandra | Instabil plan | Deterministisk policy; bygg konfliktlint |
| Bambu-fältnamn ändras | Exportfel | Versionsmappa exporter |
| Native/webb skiljer sig | Obegripliga råd | Golden meshes och kontraktstest |
| Stor STL blockerar UI | Dålig UX | Native worker, progress och cancel i M2 |

## Milestones

1. **M0:** domänkontrakt, 50 regler, Tauri/React-scaffold.
2. **M1 (nu):** STL, 3D-vy, bbox/höjd/kontakt/överhäng, sju frågor, plan.
3. **M2:** Rust som enda analyskälla, meshvalidering, progress/cancel, golden fixtures.
4. **M3:** 3MF, flera objekt, orienteringskandidater och heatmaps.
5. **M4:** fysisk testmatris X1C/P1S × PLA/PETG och preset/3MF-export.
6. **M5:** valfritt AI-förklaringslager bakom strikt schema; offline är standard.

## Acceptanskriterier M1

- Binär/ASCII STL kan dras in och visas utan nätverksanrop.
- Fem analysvärden visas och matar regelmotorn.
- Exakt sju kontextfält påverkar relevanta regler.
- Planen innehåller samtliga 13 inställningsområden.
- Regelmotorn testas separat och sammanfogar numeriska minimum deterministiskt.
