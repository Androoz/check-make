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

The workflow uses ad-hoc signing on macOS until Apple Developer ID secrets are
configured. It does not make an unsigned build appear trusted.

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

## Publish

Before changing the draft to a public release:

1. Check filenames, release notes, version, checksums, and attached assets.
2. State signing and notarization status plainly.
3. State known platform and slicer limitations plainly.
4. Mark beta versions as prereleases.
5. Publish only after the evidence table reflects the actual result.

Git tags and public release assets are durable distribution records. Never
replace an asset silently; publish a new patch version.
