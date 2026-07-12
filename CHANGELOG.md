# Changelog

All notable changes to FirstMate are documented here. This file is the source
of the release notes shown in the app's updater.

## [0.1.3] - 2026-07-12

### Added
- In-app updates: FirstMate checks for a new version on launch and can download
  and install it from **Settings → Updates**, after showing you the changelog.
- A dismissible banner appears when an update is available.

### Changed
- Hardened the Windows installer so installing a new version always removes the
  previous one (no more coexisting installs).

## [0.1.2] - 2026-07-10

### Fixed
- Packaged app crashed on launch (`__dirname is not defined in ES module scope`);
  the main and preload processes are now built as CommonJS.

## [0.1.1] - 2026-07-09

### Fixed
- Packaged app opened no visible window; the renderer is now served over a custom
  `app://` scheme.

## [0.1.0] - 2026-07-08

### Added
- First release: EVE SSO login (PKCE), Dashboard, Economy, Mining, Exploration,
  Combat, and the AI Advisor.
