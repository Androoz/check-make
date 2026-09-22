# Releasing Check Make

GitHub Releases is Check Make's distribution channel. The workflow creates
draft releases only. A green build proves packaging, not installation,
signing, slicer integration, or safe operation.

## Prepare

1. Work from a reviewed commit on `main`.
2. Synchronize the version in `package.json`, `package-lock.json`,
   `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and
   `src-tauri/tauri.conf.json`.
3. Run:

   ```sh
   npm ci
   npm test
   npm run build
   npm run semantic:acceptance
   npm run semantic:providers
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

4. Confirm that no credentials, private models, personal exports, signing
   certificates, or generated installers are tracked.
5. Review `THIRD_PARTY_NOTICES.md` when dependencies, data, icons, or bundled
   assets change.

## Build a draft

Run **Build draft release** in GitHub Actions and enter the exact version
without a `v` prefix. The workflow rejects mismatched versions, runs the
portable frontend checks, then builds native bundles on each target platform.
It creates or updates `v<version>` as a draft release.

### macOS signing and notarization

The macOS jobs sign with Developer ID and notarize automatically when the
repository secrets below are configured. When any signing secret is missing the
job falls back to an ad-hoc signature, prints a workflow warning, and records
`Signing mode: ad-hoc` in the job summary. It never makes an unsigned build
appear trusted.

| Secret | Purpose | How to obtain |
| --- | --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` export of the **Developer ID Application** certificate and its private key | Xcode → Settings → Accounts → Manage Certificates, or developer.apple.com → Certificates. Export from Keychain Access as `.p12`, then `base64 -i cert.p12 \| tr -d '\n' \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Password chosen when exporting the `.p12` | Set during the export |
| `APPLE_SIGNING_IDENTITY` | Full identity name, for example `Developer ID Application: Anders Pettersson (TEAMID)` | `security find-identity -v -p codesigning` on a Mac where the certificate is installed |
| `APPLE_ID` | Apple ID e-mail used for notarization | The Apple Developer Program account |
| `APPLE_PASSWORD` | App-specific password for that Apple ID | appleid.apple.com → Sign-In and Security → App-Specific Passwords |
| `APPLE_TEAM_ID` | Ten-character team identifier | developer.apple.com → Membership details |

Requirements and behaviour:

- A paid Apple Developer Program membership is required for a Developer ID
  certificate; a free account cannot issue one.
- The certificate must be **Developer ID Application**, not Apple Development
  or Mac App Distribution.
- Tauri imports the certificate into a temporary keychain on the runner, signs
  the app with the hardened runtime, submits it to Apple's notary service, and
  staples the ticket. Notarization typically adds two to ten minutes per job.
- Notarization requires all three of `APPLE_ID`, `APPLE_PASSWORD`, and
  `APPLE_TEAM_ID` in addition to the signing secrets. With signing secrets only,
  the job produces a signed but not notarized build and warns about it.
- The **Verify macOS signature and notarization** step runs `codesign --verify
  --deep --strict`, checks the hardened-runtime flag, validates the stapled
  ticket with `stapler validate`, and runs `spctl --assess`. Its job summary is
  the signing evidence for the release table below.
- Rotate the app-specific password and re-export the certificate if a runner
  log or secret is ever exposed. Certificates expire after five years; the
  notarization ticket remains valid for builds notarized before expiry.

## Release evidence

Record each result in the draft release notes or the release pull request:

| Target | Bundle | Build | Checksum | Signature | Install/start | Core workflow | Native slicer export |
| --- | --- | --- | --- | --- | --- | --- | --- |
| macOS Apple Silicon | DMG | required | required | Developer ID + notarization preferred | required | required | test installed slicers |
| macOS Intel | DMG | required | required | Developer ID + notarization preferred | required | required | test installed slicers |
| Windows x64 | NSIS EXE | required | required | Authenticode preferred | required | required | test installed slicers |
| Linux x64 | AppImage + DEB | required | required | document checksum/signature | required | required | currently incomplete |

Report these states separately:

- source checks passed;
- platform-specific application build completed;
- package or installer created and its checksum recorded;
- package signature/notarization status;
- installer tested on the target operating system;
- application launched;
- Inspect → Prepare → Export smoke test passed;
- installed-slicer integration tested;
- physical print validation performed, if any.

Do not describe missing evidence as passed. Remove a failed or untested asset
from the public release or label the release and limitation clearly as a
prerelease.

For a cross-platform beta, CI artifacts alone do not establish platform
verification. Record at least one observed Inspect → Prepare → Export user flow
on each advertised platform. Developer ID signing, notarization, and
Authenticode are preferred but are not beta-exit requirements; every unsigned
or ad-hoc-signed package must carry explicit installation and trust warnings.
Developer ID signing and notarization **are** requirements for the first public
stable macOS release, because Gatekeeper blocks ad-hoc-signed downloads on
current macOS versions.

## Publish

Before changing the draft to a public release:

1. Check filenames, release notes, version, checksums, and attached assets.
2. State signing and notarization status plainly.
3. State known platform and slicer limitations plainly.
4. Mark beta versions as prereleases.
5. Publish only after the evidence table reflects the actual result.

Git tags and public release assets are durable distribution records. Never
replace an asset silently; publish a new patch version.
