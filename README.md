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
| **Advisor** | Enter a goal → prioritized recommendations from Claude, using your live ISK/skills/location/orders as context | Anthropic API |
| **Settings** | EVE SSO Client ID, callback port, Anthropic key & model | — |

Authentication uses the **OAuth 2.0 PKCE** flow — no client secret required. Your refresh token
and Anthropic API key are stored locally and encrypted at rest with the OS keystore (Electron
`safeStorage`) when available.

---

## Prerequisites

- **Node.js 20+**
- An **EVE developer application** (free) — see below
- (Optional) an **Anthropic API key** for the AI Advisor

## Setup

### 1. Register an EVE application

1. Go to <https://developers.eveonline.com> and create a new application.
2. Connection type: **Authentication & API Access**.
3. Request the scopes you want (FirstMate uses a read-only set — see `src/shared/scopes.ts`).
4. Set the **Callback URL** to exactly:

   ```
   http://localhost:24123/callback
   ```

   (Use a different port if you change it in Settings — they must match.)
5. Copy the **Client ID**.

### 2. Run it

```bash
npm install
npm run dev
```

On first launch, open **Settings**, paste your **Client ID**, (optionally) your **Anthropic API
key**, and save. Then click **Log in with EVE** — your browser opens the EVE consent page, and
after you approve, the app connects to your character.

### 3. Build a Windows installer

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
    ai/advisor.ts      Anthropic advisor (gathers context, calls Claude)
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
| `npm run package` | Build a Windows NSIS installer |

## Notes & limitations

- **Wormhole connections are not in ESI**, so the Explore tab is a manual local tracker — paste
  signatures from the in-game scanner and classify them.
- Mining value estimates use ESI **average market prices**; real refined/sell value will differ.
- The AI Advisor requires an Anthropic API key and network access; it sends a summary of your
  character context (ISK, skills, location, market orders) to Claude to generate advice.
- ESI mining ledger and some endpoints update on a delay (roughly daily) — the app reflects
  whatever ESI currently returns.

## Tech

Electron · React · TypeScript · Vite (via electron-vite) · Anthropic SDK · EVE ESI.
