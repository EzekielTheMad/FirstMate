# Changelog

All notable changes to FirstMate are documented here. This file is the source
of the release notes shown in the app's updater.

## [0.1.4] - 2026-07-13

### Fixed
- **Industry** now shows only your **active** jobs (in progress or ready to
  deliver) instead of a history of everything you've crafted — delivered jobs no
  longer appear, and finished jobs are labeled "Ready to deliver" rather than
  "Ready." Countdowns tick down live and jobs flip to ready at their end time on
  their own. (Jobs you start or deliver in-game still reflect at EVE's ~5-minute
  data refresh, or immediately via the ↻ button.)

## [0.1.3] - 2026-07-12

### Added
- **In-app updates**: FirstMate checks for a new version on launch and can
  download and install it from **Settings → Updates**, after showing you the
  changelog. A dismissible banner appears when an update is available.
- **Assets view**: your current ore, mineral, and ice holdings grouped by
  location, with raw market value and reprocessed (refined) value, plus
  hover tooltips showing each ore's mineral composition.
- **Industry view**: active manufacturing, research, reaction, and other jobs
  with time remaining and a "Ready" indicator for finished jobs.
- **Clones view**: your active pod implants and jump clones (with their
  implants and locations).
- **Full skill queue** on the Dashboard: every queued skill with finish times,
  total time remaining, and a warning when the queue is empty or ends soon.
- **AI Advisor history**: each answer is saved locally so you can re-read past
  advice without spending API calls; browse, expand, delete, or clear it.
- **Wallet balance trend** sparkline in the Economy view.
- **EVE (UTC) clock** in the top bar.
- **Text size** control (80–150%, also Ctrl +/-/0) and an optional
  **auto-refresh** interval for data views, in Settings.

### Changed
- New **left icon-rail navigation** replaces the tab strip, scaling cleanly to
  all views.
- Data views now show when they were last updated.
- Mining no longer shows a misleading lifetime "by ore" total; the ledger is
  clearly labeled as the recent (~30 day) mining history. Use the new Assets
  view for current ore holdings.
- Hardened the Windows installer so installing a new version always removes the
  previous one (no more coexisting installs).

### Security
- The EVE SSO access token is now cryptographically verified (JWKS signature,
  issuer, audience, and expiry) before it is trusted, per EVE's guidance.

### Fixed
- Item and location names occasionally showed as raw numeric ids when a single
  unresolvable id (e.g. a player structure) caused the whole name lookup to
  fail; name resolution is now resilient to that.

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
