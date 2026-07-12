# Feature Expansion (Phases 1 & 2) — Design

**Date:** 2026-07-12
**Status:** Approved (design), pending spec review
**Component:** FirstMate desktop app (Electron + electron-vite + React + TypeScript)

## Goal

Add a batch of user-requested features plus completions of already-granted ESI
scopes, single-character, structured so multi-character is a cheap future
retrofit. Delivered as two independently-shippable phases.

## Scope decisions (locked)

| Decision | Choice |
| --- | --- |
| Multi-character | **Deferred** to a later pass. Build single-character, but new ESI fetchers take an explicit `characterId` (defaulting to the current identity) so multi-char is a small retrofit. |
| "Ore I have" | **Current holdings** via a new **Assets → Materials** view (not the lifetime mining ledger). |
| Assets view scope | **Focused "Materials" view** — ore, minerals, ice only. Non-material items omitted. |
| Navigation | Replace the overflowing horizontal tab strip with a **compact left icon rail** (scales to 10+ destinations). |
| Sequencing | One design spec (this doc) → **two implementation plans** (Phase 1, then Phase 2). |

Out of scope for this effort (tracked separately): the approved **JWT-validation
hardening** and cutting the **v0.1.3 release**.

## Cross-cutting: navigation rework

Adding Assets, Industry, and Clones brings the app to 10 destinations; the current
horizontal tab strip already overflows the 480px window. Replace it with a **left
icon rail**: a narrow vertical column of icon buttons with the active item
highlighted and the label shown on the active/hovered item. This is a layout change
in `App.tsx` plus a new `Nav` component; the existing `TabId`/`TABS` model and the
`needsAuth` gating carry over unchanged.

## Phase 1 — Local/UI wins (no new ESI plumbing)

### 1.1 Text scaling
- Persist a new `zoomFactor` setting (default `1.0`).
- Apply via `mainWindow.webContents.setZoomFactor(zoomFactor)` on window load.
- Wire `Ctrl+=` / `Ctrl+-` / `Ctrl+0` (main-process `before-input-event` or menu accelerators) to step zoom and persist.
- Settings gets a zoom stepper (80% → 150% in sensible steps) that calls `window:setZoom`.
- IPC: `window:setZoom(factor)` persists and applies; current factor comes from `PublicSettings`.

### 1.2 Advisor history
- New store file `advisor-history.json`: array of
  `{ id, goal, focus?, advice, createdAt, snapshot: { isk, skillPoints, locationName?, shipName? } }`.
- On a successful `askAdvisor`, the main process appends an entry and trims to the **last 50**.
- Advisor view gains a collapsible **History** list below the form: each row shows goal + relative time; expanding shows the saved advice (via existing `renderMarkdown`) with its timestamp and snapshot. Per-entry delete + "Clear all".
- IPC: `advisor:getHistory()`, `advisor:deleteHistory(id)`, `advisor:clearHistory()`. Saving happens automatically inside the advisor flow.

### 1.3 Full skill queue
- Extend `DashboardData` with `skillQueue: Array<{ name?: string; level: number; finishesAt?: string }>` (resolve names for **all** queued skills, not just the first).
- Dashboard "Training" panel renders the full queue with per-skill finish times, a computed **total time remaining** (from the last entry's `finish_date`), and a **warning chip** when the queue is empty or fully completes within 24h.
- Data is already fetched in `fetchDashboard`; this adds name resolution for the whole queue + presentation.

### 1.4 Last-updated + refresh + optional auto-refresh
- Extend `useAsync` to record `lastUpdatedAt` on each successful load and expose it.
- Data views show "Updated Xs ago" next to their refresh control (reuse the existing `↻` button).
- New `autoRefreshSeconds` setting (default **0 = off**). When > 0, views re-fetch on that interval (implemented in `useAsync`/a thin wrapper), never faster than is sensible for ESI cache windows.

### 1.5 EVE (UTC) clock
- Small top-bar component showing current UTC `HH:MM:SS`, labeled "EVE", ticking each second. Pure renderer; no ESI.

### 1.6 Wallet sparkline
- In the Economy Wallet panel, render a tiny inline-SVG sparkline of wallet balance over time, built from the journal entries' running `balance` field (already fetched), using entries that carry a balance, sorted by date. New reusable `Sparkline` component.

## Phase 2 — New ESI read-views (scopes already granted)

### 2.1 Ore→mineral reference data
- New bundled module `src/shared/data/ore-minerals.ts`:
  - `MATERIAL_TYPE_IDS`: set of reprocessable material type ids (the 8 minerals + Morphite, standard asteroid ores + common variants, ice products) used to classify assets.
  - `ORE_MINERALS`: map of ore type id → `{ name, portionSize, minerals: Record<MineralName, number> }` (yield per reprocessing batch), for standard asteroid ores + variants (+ ice where practical).
- Pure helpers: `isMaterialType(typeId)`, `refinedValue(oreTypeId, quantity, mineralPrices)`, `oreComposition(oreTypeId)`.

### 2.2 Assets → "Materials" view
- New ESI `fetchMaterials(characterId?)`:
  - GET `/characters/{id}/assets/` (paginated — follow `X-Pages`), auth.
  - Filter items to `MATERIAL_TYPE_IDS`.
  - Group by `location_id`; resolve station names via `/universe/names`; player structures shown generically ("Player structure") since the structures scope isn't held.
  - Aggregate quantity per material overall and per location.
  - Compute **raw value** (market average prices) and **refined value** (ore → minerals × mineral prices) via the ore-minerals helpers.
- New view `Materials.tsx`: total materials value; list grouped by material (quantity, raw value, refined value) with a **hover tooltip** showing reprocessing composition; expandable by location. Reuses `EsiResult`/`Loader`/`ErrorBox`/`EmptyState`.
- Scope: `esi-assets.read_assets.v1` (already granted).

### 2.3 Mining view cleanup
- Remove the misleading lifetime **"By Ore/Type"** aggregation from Mining.
- Relabel the remaining ledger summary honestly as **"Mined · last ~30 days"** and show the actual date span of entries.

### 2.4 Industry jobs view
- New ESI `fetchIndustryJobs(characterId?)`: GET `/characters/{id}/industry/jobs/` (auth). Resolve blueprint/product and location names; derive activity label and time remaining from `end_date`.
- New view `Industry.tsx`: active jobs with product, activity, **time remaining**, and location; ready/completed jobs highlighted; empty state when none.
- Scope: `esi-industry.read_character_jobs.v1` (already granted).

### 2.5 Clones & implants view
- New ESI `fetchClones(characterId?)`: GET `/characters/{id}/clones/` and `/characters/{id}/implants/` (auth). Resolve implant type names and clone location names.
- New view `Clones.tsx`: current pod implants; jump-clone list (location + each clone's implants); home-station/jump availability where derivable.
- Scope: `esi-clones.read_clones.v1`, `esi-clones.read_implants.v1` (already granted).

## Architecture & structure

- **New files:** `src/renderer/src/views/Materials.tsx`, `Industry.tsx`, `Clones.tsx`; `src/renderer/src/components/Nav.tsx`, `Sparkline.tsx`, `Tooltip.tsx`; `src/shared/data/ore-minerals.ts`; test files for the pure helpers.
- **Modified:** `src/main/esi/client.ts` (new fetchers, `characterId` params), `src/shared/types.ts` (new domain + API types, `zoomFactor`/`autoRefreshSeconds` settings), `src/main/ipc.ts` + `src/preload/index.ts` (new channels), `src/main/store.ts` (advisor history, new settings), `src/main/index.ts` (apply zoom, zoom accelerators), `src/renderer/src/App.tsx` (icon rail, EVE clock, new tabs), `src/renderer/src/views/{Dashboard,Economy,Mining,Advisor,Settings}.tsx`, `src/renderer/src/lib/hooks.ts` (`useAsync` lastUpdatedAt + auto-refresh).
- **Character-aware:** new ESI fetchers accept an explicit `characterId` (default = current identity) to seed the multi-char retrofit without refactoring existing callers now.
- Each new view has one clear responsibility and reuses the shared UI + `EsiResult` error pattern.

## Error handling

- All new ESI views use the existing `wrap()`/`EsiResult` path: failures (including `403` scope errors) surface as an inline `ErrorBox` with retry; the app never crashes on a failed or empty fetch.
- Assets pagination and name resolution failures degrade gracefully (unresolved names fall back to ids; a failed page aborts to an error result).

## Testing

- **vitest (already configured)** unit tests for pure logic:
  - `refinedValue` / `oreComposition` / `isMaterialType` (ore-minerals helpers)
  - materials aggregation (group + sum) from a sample asset list
  - skill-queue total-time-remaining computation
  - sparkline data preparation (filter + sort balances)
  - advisor-history append + 50-cap trimming
- **Manual verification** in the logged-in app (login now works): each new view renders real data for the active character; zoom, advisor history, and the icon rail behave.

## Open questions

None — scope, assets depth, navigation, and multi-char deferral are all decided.
