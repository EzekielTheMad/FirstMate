# In-App Updates & Installer Hardening — Design

**Date:** 2026-07-12
**Status:** Approved (design), pending spec review
**Component:** FirstMate desktop app (Electron + electron-vite + electron-builder)

## Problem

Two versions of FirstMate could be installed at once. On this machine an old
build lived in `C:\Program Files\FirstMate` (per-machine-style location) while
`perMachine: false` normally installs per-user under `%LOCALAPPDATA%`. Because
early versions (v0.1.0/v0.1.1) were built with different install semantics than
v0.1.2, their uninstall registry entries did not match and NSIS never removed
the old one. The stale build additionally hijacked the `eveauth-firstmate://`
protocol callback during SSO.

Separately, there is no way to discover or apply a new version from inside the
app; users must manually find and run a new installer.

## Goals

1. **Installer hygiene:** installing any version reliably removes the previously
   installed version — no coexisting installs, ever, going forward.
2. **In-app updates:** the app checks for updates on launch, and — gated on the
   user reading a changelog — can download and install a new version from within
   the app.
3. **Auth-independent:** the entire update surface (launch check, banner, and the
   Settings → Updates panel) works whether or not a character is logged in via
   EVE SSO. Updating must never require authentication.

## Non-goals

- macOS/Linux updater support (app is Windows-only for now).
- Code signing (Windows/NSIS updates work unsigned; revisit if we ever ship mac).
- Silent/background auto-install. Updates are always user-initiated after the
  changelog is shown.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Update mechanism | `electron-updater` (reads the `latest.yml` the release workflow already publishes) |
| Update flow | Notify on launch → user opens → reads changelog → **Download & install** → **Restart & install**. `autoDownload = false`. |
| Changelog source | `CHANGELOG.md` in-repo → release workflow sets the tagged section as the GitHub Release body → delivered to the app as `releaseNotes` |
| Install-dir picker | `allowToChangeInstallationDirectory: false` (single deterministic per-user location) |
| First release with this work | **v0.1.3** (also replaces the broken published v0.1.2 asset) |

## Design

### A. Installer hardening — `electron-builder.yml`

- Keep `appId: com.firstmate.app` **permanently stable**. A stable appId is what
  lets NSIS find and remove the prior install; changing it orphans installs.
- Set `nsis.allowToChangeInstallationDirectory: false`. With `perMachine: false`,
  every version installs to the same per-user location, so NSIS deterministically
  uninstalls the prior version first.
- Add a custom NSIS include `build/installer.nsh` as belt-and-suspenders: on
  install, detect any previously-registered FirstMate install (including a stale
  per-machine / `Program Files` one) and run its uninstaller silently before
  proceeding. Referenced via `nsis.include`.

Result: from v0.1.3 onward, installing any version first cleanly removes the
previous one. The in-app updater's download-and-run-installer path inherits the
same clean-upgrade behavior.

### B. Updater backend — `src/main/updater.ts` (new)

- Add `electron-updater` as a runtime **dependency** (not devDependency; used in
  the main process at runtime).
- Wrap `autoUpdater` with `autoDownload = false` and
  `autoInstallOnAppQuit = false` (fully user-controlled).
- State machine, broadcast to the renderer:
  `idle | checking | available | downloading | downloaded | up-to-date | error`,
  carrying `{ currentVersion, newVersion?, releaseNotes?, percent?, error? }`.
- Guard on `app.isPackaged` so `npm run dev` is unaffected. A `dev-app-update.yml`
  + `autoUpdater.forceDevUpdateConfig = true` path enables manual testing against
  a locally-served `latest.yml` without publishing.
- On launch (packaged only), call `check()` once. Public functions:
  `getState()`, `check()`, `download()`, `installNow()` (→ `quitAndInstall`).
- Maps `autoUpdater` events (`checking-for-update`, `update-available`,
  `update-not-available`, `download-progress`, `update-downloaded`, `error`) to
  the state machine and emits changes through a listener registry (mirrors the
  existing `onAuthChange` pattern in `auth/sso.ts`).

### C. IPC + preload + types

- Extend `FirstMateApi` in `src/shared/types.ts` with an `updates` surface:
  `getState()`, `check()`, `download()`, `install()`, `onChange(cb)`. Add an
  `UpdateState` type for the state machine above.
- Add `ipcMain.handle` handlers in `src/main/ipc.ts` and broadcast state changes
  to the window (same shape as `auth:changed`).
- Expose the bridge in `src/preload/index.ts`.

### D. Renderer UI

- **Banner** (`src/renderer/src/App.tsx`): a slim, dismissible bar at the top when
  status is `available` / `downloaded` — e.g. "FirstMate v0.1.4 is available —
  View & install" — that switches to the Settings → Updates panel. Nothing
  downloads from the banner alone.
- **Settings → new "Updates" panel** (`src/renderer/src/views/Settings.tsx` or a
  small extracted component): shows the current version, a "Check for updates"
  button, and when an update exists, the **rendered changelog** (reusing the
  existing safe `renderMarkdown` in `src/renderer/src/lib/format.ts`) plus
  **Download & install** → progress bar → **Restart & install**
  (`install()` → `quitAndInstall`).
- A `useUpdates` hook subscribes to `updates.onChange` and seeds from
  `updates.getState()` (mirrors the auth wiring in `App.tsx`).
- **Auth-independent:** the banner renders at the app shell (outside any
  `needsAuth` gating) and the Settings tab already has no `needsAuth` flag, so the
  full update surface is reachable while logged out. The updater backend never
  touches auth/ESI state.

### E. Changelog pipeline

- Add `CHANGELOG.md` (Keep a Changelog style; one `## [x.y.z] - date` section per
  version), seeded with v0.1.0–v0.1.3 history.
- Update `.github/workflows/release.yml`: add a step that extracts the tagged
  version's section from `CHANGELOG.md` and provides it as the release body so the
  published GitHub Release — and therefore electron-updater's `releaseNotes` —
  shows exactly that section. (electron-builder publishes the release; the step
  ensures the body is the changelog section rather than empty/auto-generated.)

### F. Version bump + testing

- Bump `package.json` version to **0.1.3**.
- **CHANGELOG extractor**: a tiny, pure function (version → section text) with unit
  tests — the one piece with logic worth testing in isolation.
- **Manual packaged test** before cutting the real release: build locally, serve a
  `latest.yml` advertising a fake higher version, and walk banner → changelog →
  download → install to confirm `releaseNotes` render and the install succeeds.

## Error handling

- Update-check/network failures never block the app. They surface only as a quiet
  "Couldn't check for updates" line in the Settings → Updates panel — no banner,
  no modal, no crash.
- Download/install errors move the state machine to `error` with a message shown
  in the Updates panel; the app remains fully usable on the current version.

## Files touched

- `electron-builder.yml` (harden NSIS)
- `build/installer.nsh` (new — remove prior install)
- `src/main/updater.ts` (new — updater backend)
- `src/main/ipc.ts`, `src/main/index.ts` (wire IPC + launch check)
- `src/preload/index.ts`, `src/shared/types.ts` (bridge + types)
- `src/renderer/src/App.tsx`, `src/renderer/src/views/Settings.tsx`,
  `src/renderer/src/lib/hooks.ts` (banner, Updates panel, `useUpdates`)
- `CHANGELOG.md` (new), `.github/workflows/release.yml` (release notes step)
- `package.json` (add `electron-updater`, bump to 0.1.3)
- Test file for the CHANGELOG extractor

## Open risks

- `releaseNotes` delivery from the GitHub provider will be confirmed during the
  manual packaged test; if the body isn't delivered as expected, fall back to
  fetching the release body via the GitHub releases API in `updater.ts`.
