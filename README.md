# OptimusPrint – Intelligent 3D Print Assistant

Codex-klar MVP för lokal, transparent vägledning av Bambu Studio-inställningar för funktionella STL-utskrifter med PLA/PETG på X1C/P1S.

## Starta webb-MVP:n

Krav: Node.js 20+.

```bash
npm install
npm run dev
```

Öppna `http://localhost:1420`, dra in en STL och besvara frågorna. Verifiera med `npm test` och `npm run build`.

## Starta desktopappen

Installera Rust stable och plattformsberoenden för Tauri 2, och kör:

```bash
npm install
npm run tauri dev
```

## Implementerat

- lokal binär/ASCII STL-import och Three.js-vy
- bounding box, höjd, plattkontakt- och överhängsestimat
- sju kontextfrågor
- deterministisk YAML-regelmotor med 50 grupperade regler
- alla 13 efterfrågade inställningsområden med why, regel-ID och konfidens
- Tauri 2-skal och ett första native Rust-kommando för STL-bounding box

## Placeholders och begränsningar

- M1 analyserar i TypeScript. Rustkommandot etablerar backendgränsen men är ännu inte kopplat till UI:t.
- 3MF, STEP, tunnväggar, broar, hål, heatmaps och riktig orienteringsoptimering saknas.
- Geometrimåtten är heuristiker, inte slicerresultat.
- Ingen Bambu Studio-preset/3MF skapas ännu och reglerna är inte fysiskt kalibrerade.
- AI-lagret är avsiktligt inte implementerat; regelmotorn fattar alla beslut.

Se [den tekniska MVP-specen](docs/MVP_SPEC.md).
