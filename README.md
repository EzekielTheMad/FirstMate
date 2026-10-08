# FirstMate

An unofficial **EVE Online companion desktop app** for Windows. macOS/Linux source builds are experimental and are not covered by the Windows release workflow.
Log in with your character via EVE SSO and get purpose-built, tabbed interfaces for the
different parts of the game — exploration & wormhole tracking, economy, mining, combat — plus
an **AI Advisor** that turns a stated goal into a concrete plan (skills to train, activities to
run, ships to work toward) grounded in your live character data.

The window is sized tall and narrow by default, made to sit on the lower half of a portrait
secondary monitor.

## Portfolio case study

**Problem:** An EVE session spans live character data, market and mining information, manually
observed wormhole connections, fittings, and planning notes. FirstMate brings those tasks into a
compact, local-first desktop companion.

**Approach:** Electron separates OS integration and credential handling from a typed React UI.
Read-only ESI calls supply character context; local JSON stores hold exploration maps, fittings,
and notes. Players confirm wormhole connections because ESI does not expose them. Shareable maps
are validated snapshots, with independent imports rather than implicit synchronization.

**AI integration:** The optional Advisor sends a goal and a selected character-context summary to
Hermes, Anthropic, OpenAI, or a compatible endpoint. A separate authenticated, read-only MCP bridge
can expose FirstMate data to a configured agent. These are implemented runtime features. AI is off
by default, and model advice is not authoritative game data or a promise of profit/safety.

**Authorship and evidence:** FirstMate is an AI-assisted development project maintained by Victor
([EzekielTheMad](https://github.com/EzekielTheMad)). The repository demonstrates integration,
local-state workflows, automated tests, and Windows packaging. AI assistance is part of the
implementation process; this case study makes no claim of sole manual authorship, adoption,
revenue, or measured time savings. See [source](src), [changelog](CHANGELOG.md), and
[release hygiene](docs/RELEASE_SECURITY.md) for inspectable implementation and validation boundaries.

**Current result:** Windows installer releases exist through v0.1.19. The hardening changes in
this source tree do not change those already-published installers; they need review and a new
release. Live EVE sign-in, real OS keychains, provider accounts, and packaged installer behavior
still require environment-specific acceptance testing.

> Not affiliated with CCP Games. All ESI (EVE) access is **read-only**.

---

## Features

| Tab | What it does | Data source |
| --- | --- | --- |
| **Dashboard** | Wallet, online status, skill points & queue, current system/region/security, active ship | Live ESI |
| **Explore** | Multiple autosaved chain maps, pan/zoom node graph, portable share codes/files, live-system detection, system autocomplete, Probe Scanner import, optional beginner guidance, and independent life/mass observations | ESI + local observations |
| **Economy** | Wallet balance, buy/sell escrow, open market orders, wallet journal | Live ESI |
| **Mining** | Mining ledger grouped by ore/type with average-market-price value estimates | Live ESI |
| **Combat** | Local fittings library (EFT/pyfa paste) and tactical notes | Local |
| **Advisor** | Enter a goal → prioritized AI recommendations using your live ISK/skills/location/orders as context | Optional: Hermes, Anthropic, OpenAI, or compatible endpoint |
| **Hermes data bridge** | Optional authenticated, read-only MCP tools for character, assets, ships, economy, industry, exploration, and local libraries in Hermes/Discord | Live ESI + local FirstMate data |
| **Settings** | EVE SSO, display, updates, and optional AI provider configuration | — |

Authentication uses the **OAuth 2.0 PKCE** flow — no client secret required. The SSO redirect
comes back through a **custom URL scheme** (`eveauth-firstmate://callback`) that the app registers
as an OS protocol handler, so no local web server or open port is needed. Your refresh token and
AI provider keys require an available OS-backed keystore (Electron `safeStorage`). New credentials
are never saved using reversible Base64 or Electron's insecure Linux `basic_text` backend. Existing
legacy records migrate only after encryption and read-back verification succeed. If the keychain
is unavailable, the app preserves those records and blocks their use/new secret saves instead of
silently weakening protection. [Credential storage and recovery](docs/credential-storage.md)
explains migration, backups, and the limits of local encryption.

> **Custom-scheme handlers work best from a packaged/installed build.** In `npm run dev` on
> Windows the app registers the electron binary + entry script as the handler, which usually works;
> if the browser can't hand the redirect back during development, run a packaged build
> (`npm run package`) to test the full login flow.

---

## Download & install (Windows)

Windows builds are available as **`FirstMate-<version>-setup.exe`** on the
[Releases page](https://github.com/EzekielTheMad/FirstMate/releases).

**Current installers are unsigned.** Windows cannot verify a publisher signature, and SmartScreen
may block or warn about them. Do not disable Windows protection or treat a warning as proof that a
file is safe. Check the repository, exact release and source before deciding whether to install;
if you cannot establish trust, stop and wait for a signed release. Building from reviewed source
is an alternative for developers, not a substitute for reviewing dependencies.

Signing remains outstanding distribution work. The CI changes here do not sign installers or
retroactively secure earlier releases. An installed build adds Start-menu/desktop shortcuts and
uses **Log in with EVE** to connect your character.

## Prerequisites (running from source)

- **Node.js 22** (matches CI)
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

For the complete provider comparison, Docker/Unraid environment variables, port mapping,
security guidance, connection tests, data-sharing details, and troubleshooting, see
**[AI Advisor and Hermes setup](docs/ai-advisor-and-hermes.md)**.

### Track a wormhole chain

1. Open **Explore**, name the current map or choose **+ New map**, and use the live ESI location
   card—or start typing a system name/J-code under
   **+ System**. FirstMate suggests official systems and fills known class/effect data.
2. In EVE's Probe Scanner, click the results list, press **Ctrl+A** then **Ctrl+C**. Choose
   **Import scan** in FirstMate, click the paste box, and press **Ctrl+V**. Re-importing refreshes
   scanner fields without erasing notes, links, or wormhole status.
3. Expand a wormhole signature and type its observed code. Known codes show destination class and
   nominal limits. After jumping, select that signature in the live-location card and choose
   **Link arrival & open**; FirstMate never guesses which exit you used.
4. Record **Life** and **Mass** independently. **Mark <4h now** timestamps the observation in EVE
   time; it does not claim a guaranteed collapse deadline.
5. **Close connection** when a hole disappears. Closed connections and archived systems remain
   recoverable instead of being silently deleted.

The chain is displayed as a pan-and-zoom node graph. Select systems or connection labels to edit
their details, and open **Compact chain list** when a linear view is easier. Maps are independent:
archive an entire finished expedition, duplicate it before experimenting, or switch back later.

Choose **Share** to copy a compressed `FMAP1G:` import string, copy a readable Discord summary, or
export a `.firstmate-map.json` file. **Import** accepts pasted share codes/JSON plus selected or
dropped map files. Imports create a new map and never overwrite an existing one. Exports contain no
credentials or other maps, but are not encrypted.

For beginner help, turn on **Site guidance** in the Explore toolbar. It flags recognized dangerous
mechanics and lower-PvE-risk hacking sites without ever claiming that a site is safe from players.
The scheduled workflow checks the bundled lookup against CCP's Static Data Export and validates
updates before publishing an automation branch. Its run summary links the comparison for a
maintainer to open/review a PR; it does not create PRs or merge automatically. Reviewed updates
reach users only in a subsequent release. See [release hygiene](docs/RELEASE_SECURITY.md).

See **[Explore and wormhole chain tracking](docs/exploration-chain.md)** for field meanings,
scanner-paste examples, automatic versus player-confirmed data, migration behavior, and recovery tips.

> FirstMate's in-app Advisor requests are independent. For a persistent conversation, enable
> **Settings → Hermes data access (MCP)** and connect that read-only tool server to Hermes. Discord
> conversations can then query FirstMate through the normal Hermes tool pipeline while FirstMate
> is running. See [Hermes/Discord data access](docs/hermes-firstmate-mcp.md).

### Run from source

```bash
npm ci
npm run typecheck
npm test
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
    auth/sso.ts        EVE SSO PKCE flow (custom-scheme callback, token refresh)
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
| `npm run build` | Bundle all three processes into `out/` (typecheck separately) |
| `npm run typecheck` | Type-check main+preload and renderer |
| `npm test` | Run the Vitest suite, including credential migration regressions |
| `npm run package` | Build a Windows NSIS installer locally (`dist/`) |

## Releasing

Installers are built by GitHub Actions on a Windows runner and published to a GitHub Release —
you don't need Windows locally. To cut a release:

```bash
# bump the version in package.json first, then:
git tag v0.1.0
git push origin v0.1.0
```

The `.github/workflows/release.yml` workflow runs typechecking and tests before building the
installer and attaches
`FirstMate-<version>-setup.exe` to a Release for that tag. You can also run the workflow manually
from the **Actions** tab (it uploads the installer as a build artifact without publishing a
release).

Building locally on Windows instead: `npm run package` → `dist/`.

## Troubleshooting

- **Installed, launches, but no window appears:** update to the latest release. If it still
  happens, send the startup log — it's written to
  `%APPDATA%\FirstMate\firstmate\startup.log` on Windows (paste the path into Explorer's address
  bar). Review/redact it before sharing; never attach settings or token files. It records startup
  steps and renderer/preload errors.
- **"Windows protected your PC" on first run:** installers are unsigned. Stop if you cannot
  establish trust in the release; see the installation warning above.
- **Secure credential storage unavailable:** unlock/configure your OS keychain and restart.
  Existing records are retained. Do not delete credential files to clear the warning; see
  [credential storage and recovery](docs/credential-storage.md).

## Notes & limitations

- This is a desktop companion with unsigned Windows releases, not a security-certified product.
  The renderer currently runs without Electron sandboxing, and external-window URL handling still
  needs a scheme-allowlist hardening review. These source-review findings are not proof of an exploit.
- OS-backed encryption does not protect against every process running as the same user. Old
  Base64 records and older backups may still be recoverable; migration does not revoke keys.
- `package.json` declares MIT, but a root license grant and complete third-party/CCP data notices
  still need maintainer confirmation before redistribution terms should be treated as settled.

- **Wormhole connections are not in ESI**, so the Explore tab is a manual local tracker — paste
  signatures from the in-game scanner and classify them.
- Mining value estimates use ESI **average market prices**; real refined/sell value will differ.
- The AI Advisor is optional. When enabled, it sends a summary of your character context (ISK,
  skills, location, market orders) only to the Hermes or model-provider endpoint you configure.
- ESI mining ledger and some endpoints update on a delay (roughly daily) — the app reflects
  whatever ESI currently returns.

## Tech

Electron · React · TypeScript · Vite (via electron-vite) · Anthropic SDK · OpenAI-compatible APIs · EVE ESI.
