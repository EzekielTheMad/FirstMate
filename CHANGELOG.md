# Changelog

All notable changes to FirstMate are documented here. This file is the source
of the release notes shown in the app's updater.

## [0.1.14] - 2026-07-16

### Added
- Wormhole signatures marked **EOL** now record when the status was set and
  show elapsed time plus the conservative four-hour collapse window.

### Fixed
- **Explore → + System** now uses an in-app form instead of Electron's
  unsupported browser prompt, so systems can actually be added in packaged
  builds.
- Explore deletions now use an in-app confirmation, and local chain load/save
  failures are shown instead of failing silently.

## [0.1.13] - 2026-07-16

### Added
- The AI Advisor is now optional and provider-neutral, with support for a local
  or remote **Hermes Agent**, Anthropic, OpenAI, and custom OpenAI-compatible
  endpoints.
- AI settings now include encrypted per-provider credentials, custom server
  URLs, Hermes session scoping, and a connection test.

### Changed
- New installations start with AI disabled. Existing installations with an
  Anthropic key automatically keep Anthropic selected.
- Advisor character context is built once through a provider-independent data
  service, so every provider uses the same ESI data pipeline.

## [0.1.12] - 2026-07-14

### Added
- **Assets & Materials** now have a **By Type / By Location** toggle. "By
  Location" groups everything under the station or structure it's sitting in, so
  you can see where your stuff is scattered at a glance.
- A **Net Worth** breakdown on the Assets page: your total value split across
  **Gear**, **Materials**, and **Ships** — so you can see how much is tied up in
  each without mixing ships into the item list.

## [0.1.11] - 2026-07-13

### Fixed
- **Critical:** in-app updates could *uninstall* the app (and remove its Start
  Menu shortcut) instead of updating it. A custom installer step meant to clean
  up an old install was silently running the app's own uninstaller during
  updates. It's removed; updates now install cleanly over the previous version
  and the shortcut is preserved. If your install went missing, download and run
  the setup .exe from the release once — future updates will work normally.

## [0.1.10] - 2026-07-13

### Fixed
- Ships stored in a **player structure** (citadel) now show that structure's
  name instead of a raw id number. (Needs the structures permission — log out
  and back in once if you haven't yet.)
- A ship's **custom name** (nickname) is shown when you've set one; your active
  ship's name now resolves too.

### Changed
- The fitting view now has clearer **slot section headers** (High / Mid / Low /
  Rig / Cargo / …) with a divider bar and a per-section item count.

## [0.1.9] - 2026-07-13

### Added
- New **Ships** tab: every ship you own — docked, stored, and your currently
  flown ship — grouped by location, each expandable to its fitting laid out by
  slot (High / Mid / Low / Rigs / Subsystems) plus drones and cargo. Empty hulls
  are listed too, and your active ship is marked.

### Changed
- Fitted modules, rigs, drones, and cargo now live under their ship in the new
  Ships tab, so they no longer clutter the **Assets** and **Materials** tabs.

## [0.1.8] - 2026-07-13

### Fixed
- Asset locations for items **fitted to (or in the cargo of) your active ship**
  now show the real station/system instead of a raw id number. Items inside your
  own containers now read "In &lt;container name&gt;".

## [0.1.7] - 2026-07-13

### Changed
- Reorganized your inventory into two focused tabs. The **Materials** tab
  (formerly Mining) now holds your ore, minerals, and ice — current holdings
  (searchable/sortable, with location, value, and refined value) *plus* the
  recent mining ledger. The **Assets** tab now shows only your gear — ships,
  fittings, modules, ammo — so neither view is one giant mixed list.

### Added
- Asset/holding locations in **player-owned structures** (Upwell citadels) now
  resolve to their real names instead of a generic label. This needs a new EVE
  permission: **log out and back in once** after updating to grant it. NPC
  station names resolve either way.

## [0.1.6] - 2026-07-13

### Changed
- The **Assets** tab is now a full asset browser. It shows *all* your items (not
  just ore and minerals), grouped by type with a per-location breakdown and a
  total value, plus **search** and **sort** (by value, quantity, or name).
  Locations resolve through ship/container nesting to the actual station or
  structure, and ores still show their reprocessing tooltip and refined value.

## [0.1.5] - 2026-07-13

### Fixed
- Update release notes now render as formatted text instead of showing raw
  `<h3>`/`<li>`/`<strong>` HTML tags. The notes are read from the release's
  markdown and rendered properly, and wrapped lines no longer break mid-sentence.

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
