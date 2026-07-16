# FirstMate

An unofficial **EVE Online companion desktop app** for Windows (also runs on macOS/Linux).
Log in with your character via EVE SSO and get purpose-built, tabbed interfaces for the
different parts of the game — exploration & wormhole tracking, economy, mining, combat — plus
an **AI Advisor** that turns a stated goal into a concrete plan (skills to train, activities to
run, ships to work toward) grounded in your live character data.

The window is sized tall and narrow by default, made to sit on the lower half of a portrait
secondary monitor.

> Not affiliated with CCP Games. All ESI (EVE) access is **read-only**.

---

## Features

| Tab | What it does | Data source |
| --- | --- | --- |
| **Dashboard** | Wallet, online status, skill points & queue, current system/region/security, active ship | Live ESI |
| **Explore** | Local wormhole-chain & signature tracker (system class, sig IDs, WH destinations, mass/EOL status, notes) | Local (ESI does not expose WH connections) |
| **Economy** | Wallet balance, buy/sell escrow, open market orders, wallet journal | Live ESI |
| **Mining** | Mining ledger grouped by ore/type with average-market-price value estimates | Live ESI |
| **Combat** | Local fittings library (EFT/pyfa paste) and tactical notes | Local |
| **Advisor** | Enter a goal → prioritized AI recommendations using your live ISK/skills/location/orders as context | Optional: Hermes, Anthropic, OpenAI, or compatible endpoint |
| **Settings** | EVE SSO, display, updates, and optional AI provider configuration | — |

Authentication uses the **OAuth 2.0 PKCE** flow — no client secret required. The SSO redirect
comes back through a **custom URL scheme** (`eveauth-firstmate://callback`) that the app registers
as an OS protocol handler, so no local web server or open port is needed. Your refresh token and
AI provider keys are stored locally and encrypted at rest with the OS keystore (Electron
`safeStorage`) when available.

> **Custom-scheme handlers work best from a packaged/installed build.** In `npm run dev` on
> Windows the app registers the electron binary + entry script as the handler, which usually works;
> if the browser can't hand the redirect back during development, run a packaged build
> (`npm run package`) to test the full login flow.

---

## Download & install (Windows)

Grab the latest **`FirstMate-<version>-setup.exe`** from the
[**Releases page**](https://github.com/EzekielTheMad/FirstMate/releases), run it, and follow the
installer (it adds Start-menu and desktop shortcuts). Then launch FirstMate and click
**Log in with EVE** — no account setup needed.

> The installer is not code-signed, so Windows SmartScreen may show a "Windows protected your PC"
> prompt on first run — click **More info → Run anyway**. (Code signing requires a paid
> certificate; it can be added later.)

## Prerequisites (running from source)

- **Node.js 20+**
- (Optional) a **Hermes Agent**, provider API key, or OpenAI-compatible model endpoint for the AI Advisor
- The app ships with a built-in EVE Client ID, so no EVE developer account is required

## Setup

FirstMate ships with a built-in EVE application Client ID, so **most people just install and log
in** — no EVE developer account needed. Click **Log in with EVE**, approve the consent page in
your browser, and your character connects. AI is disabled by default and can be configured in
Settings without affecting any other FirstMate feature.

### (Optional) Configure the AI Advisor

Choose one provider in **Settings → AI Advisor**:

- **Hermes Agent** — point FirstMate at an authenticated Hermes API server, normally
  `http://127.0.0.1:8642/v1` when it runs on the same computer. Hermes exposes an
  OpenAI-compatible API; FirstMate uses a stable session scope to keep its context separate.
- **Anthropic API** or **OpenAI API** — store the corresponding provider key locally.
- **Custom / OpenAI-compatible** — use LM Studio, another local server, or a compatible hosted
  endpoint by supplying its `/v1` base URL and optional key.

Use **Test connection** before opening the Advisor. FirstMate never silently switches providers or
falls back to a paid API. Character context is sent only to the provider URL you select.

### Run from source

```bash
npm install
npm run dev
```

Then click **Log in with EVE**.

### (Optional) Use your own EVE application

If you'd rather run your own EVE registration instead of the shipped one:

1. Go to <https://developers.eveonline.com> and create a new application.
2. Connection type: **Authentication & API Access**.
3. Request the scopes you want (FirstMate uses a read-only set — see `src/shared/scopes.ts`).
4. Set the **Callback URL** to exactly `eveauth-firstmate://callback` (or a matching
   `<your-scheme>://callback` if you change the scheme in Settings).

   EVE's portal only accepts `https` URLs or a **custom scheme starting with `eveauth`**
   (lower-case letters, digits, `+`, `.`, `-`), so FirstMate uses a custom scheme and registers
   itself as the OS handler for it.
5. In **Settings**, paste your **Client ID** (and matching scheme) and save.

> The Client ID is not a secret for a PKCE (public) client, so it's safe to ship one. The app
> never uses a client secret.

### Build a Windows installer

```bash
npm run package
```

This produces an NSIS installer under `dist/` (configured in `electron-builder.yml`). Run it on
Windows to install FirstMate with a desktop/start-menu shortcut.

> `npm run package:dir` produces an unpacked build directory (faster, no installer).

---

## Project layout

```
src/
  main/                Electron main process (Node)
    index.ts           App lifecycle & window
    ipc.ts             IPC handlers
    store.ts           Encrypted settings + local data persistence
    auth/sso.ts        EVE SSO PKCE flow (loopback server, token refresh)
    esi/client.ts      ESI API client (dashboard, economy, mining)
    ai/context.ts      Provider-independent Advisor character context
    ai/providers.ts    Anthropic, OpenAI, Hermes, and compatible adapters
    ai/advisor.ts      Advisor orchestration and history
  preload/index.ts     contextBridge — exposes a typed window.firstmate API
  renderer/            React + TypeScript UI (Vite)
    src/App.tsx        Tabbed shell + auth guard
    src/views/         One component per tab
    src/components/    Shared UI
    src/lib/           Formatting, hooks, safe markdown
  shared/              Types & scope definitions shared across processes
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Launch with hot reload |
| `npm run build` | Type-bundle all three processes into `out/` |
| `npm run typecheck` | Type-check main+preload and renderer |
| `npm run package` | Build a Windows NSIS installer locally (`dist/`) |

## Releasing

Installers are built by GitHub Actions on a Windows runner and published to a GitHub Release —
you don't need Windows locally. To cut a release:

```bash
# bump the version in package.json first, then:
git tag v0.1.0
git push origin v0.1.0
```

The `.github/workflows/release.yml` workflow builds the installer and attaches
`FirstMate-<version>-setup.exe` to a Release for that tag. You can also run the workflow manually
from the **Actions** tab (it uploads the installer as a build artifact without publishing a
release).

Building locally on Windows instead: `npm run package` → `dist/`.

## Troubleshooting

- **Installed, launches, but no window appears:** update to the latest release. If it still
  happens, send the startup log — it's written to
  `%APPDATA%\FirstMate\firstmate\startup.log` on Windows (paste the path into Explorer's address
  bar). It records each startup step and any renderer/preload errors.
- **"Windows protected your PC" on first run:** the installer is unsigned. Click **More info →
  Run anyway**. Removing this prompt requires a paid code-signing certificate.

## Notes & limitations

- **Wormhole connections are not in ESI**, so the Explore tab is a manual local tracker — paste
  signatures from the in-game scanner and classify them.
- Mining value estimates use ESI **average market prices**; real refined/sell value will differ.
- The AI Advisor is optional. When enabled, it sends a summary of your character context (ISK,
  skills, location, market orders) only to the Hermes or model-provider endpoint you configure.
- ESI mining ledger and some endpoints update on a delay (roughly daily) — the app reflects
  whatever ESI currently returns.

## Tech

Electron · React · TypeScript · Vite (via electron-vite) · Anthropic SDK · OpenAI-compatible APIs · EVE ESI.
