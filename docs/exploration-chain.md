# Explore and wormhole chain tracking

Explore is a local mapping tool for wormhole travel and expiration decisions. EVE's ESI API does
not expose scanned signatures or wormhole connections, so FirstMate records only what you enter or
paste. No AI provider is required.

## Recommended workflow

1. Add the system you are in with its class (`C1`–`C6`, `HS`, `LS`, `NS`, or your own shorthand).
2. Select signature rows in EVE's Probe Scanner, copy them, then use **Import scan**. FirstMate
   accepts tab-separated scanner rows such as:

   ```text
   ABC-123    Cosmic Signature    Wormhole    Unstable Wormhole    100.0%    7.52 AU
   ```

   Re-importing reconciles by signature ID. It refreshes resolved group/name fields while
   preserving notes, links, Life, Mass, and observation times. Missing rows are not auto-deleted.
3. Expand a wormhole signature. Add the observed wormhole type (`K162`, `H296`, and so on), then
   link an existing destination or create one. **Create & open** adds the system, links the hole,
   and opens the new system so you can continue mapping.
4. Use the chain map to move between systems. **Set root** changes the top of the view; connections
   remain navigable from either side. Cycles are marked as linked above, and disconnected systems
   remain visible as separate roots.
5. Close a connection when it disappears. Closing removes it from the active chain while keeping
   a restorable local record. Archive systems you no longer want in the active map. Permanent
   delete is a separate, confirmed action.

## Life and Mass

Life and remaining mass are independent observations:

| Life | Meaning shown by EVE |
| --- | --- |
| Unknown | Not recorded yet |
| > 1 day | Reliable lifetime exceeds one day |
| < 1 day | Reliable lifetime is under one day |
| < 4 hours | EOL planning threshold |
| < 1 hour | Closure is much closer |
| Expired | Expired / closure imminent state observed |

| Mass | Approximate remaining mass |
| --- | --- |
| Unknown | Not recorded yet |
| > 50% | Stable |
| < 50% | Reduced |
| < 10% | Critical |

**Mark <4h now** records the observation time in UTC/EVE time. FirstMate shows how long ago that
observation was made, but deliberately does not calculate a guaranteed collapse time or advance a
state automatically. Current wormhole lifetime states describe reliable-lifetime thresholds and
can include variance after that point; recheck the hole in game before committing a route. See
CCP's [Version 23.02 patch notes](https://www.eveonline.com/news/view/patch-notes-version-23-02)
and [wormhole support article](https://support.eveonline.com/hc/en-us/articles/203209772-Wormholes).

K162 is the generic exit-side designation. A named entrance code can reveal more about a
connection. FirstMate stores the code you observed; it does not fabricate a reverse-side signature.

## Local data and upgrades

Explore data is stored in FirstMate's local application-data directory. Upgrading from 0.1.14 or
earlier preserves systems, signatures, notes, and EOL timestamps. The old combined status is split
conservatively: FirstMate does not invent a Life or Mass observation that the previous format could
not represent.

If a save fails, the Explore toolbar changes to **Save failed** and offers Retry. **Saving…** means
the latest edit is still queued; **Saved HH:MM** confirms the newest state reached local storage.

