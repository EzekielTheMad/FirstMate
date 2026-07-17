# Explore and wormhole chain tracking

Explore is a local mapping tool for wormhole travel and expiration decisions. It uses ESI to notice
the solar system your character is currently in, but ESI does not expose scanned signatures or
wormhole connections. FirstMate therefore asks you to confirm the exit you travelled through instead
of guessing and corrupting the chain. No AI provider is required.

## Recommended workflow

1. Use the **Live ESI location** card to open or add the system you are in. You can also choose
   **+ System** and start typing a name or J-code. FirstMate suggests official EVE systems and
   fills the known class and system effect from its bundled EVE static data.
2. In EVE's Probe Scanner, click the results list, press **Ctrl+A**, then **Ctrl+C**. In FirstMate,
   choose **Import scan**, click the paste box, press **Ctrl+V**, and import. FirstMate
   accepts tab-separated scanner rows such as:

   ```text
   ABC-123    Cosmic Signature    Wormhole    Unstable Wormhole    100.0%    7.52 AU
   ```

   Re-importing reconciles by signature ID. It refreshes resolved group/name fields while
   preserving notes, links, Life, Mass, and observation times. Missing rows are not auto-deleted.
3. Expand a wormhole signature. Start typing the observed wormhole type (`K162`, `H296`, and so on).
   FirstMate suggests known types and displays the destination class plus nominal lifetime and mass
   limits when the entrance code provides them. These are reference limits, not live observations.
4. After jumping, the **Live ESI location** card notices the new system. Select the signature you
   travelled through and choose **Link arrival & open**. You can still link an existing destination
   or use **Create & open** manually. FirstMate never silently guesses the connection.
5. Use the chain map to move between systems. **Set root** changes the top of the view; connections
   remain navigable from either side. Cycles are marked as linked above, and disconnected systems
   remain visible as separate roots.
6. Close a connection when it disappears. Closing removes it from the active chain while keeping
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

## What can be automatic

- **Automatic:** current character system from ESI; system-name suggestions; security-space or
  wormhole class; system effect; known wormhole-code suggestions and static type limits.
- **Player-confirmed:** Probe Scanner rows, which signature was traversed, the code observed in Show
  Info, Life, remaining Mass, and whether a connection has closed.

The bundled lookup data is generated from CCP's official Static Data Export. Static wormhole
connections are intentionally absent from that export, so FirstMate cannot safely infer a live chain
from account access alone.

## Local data and upgrades

Explore data is stored in FirstMate's local application-data directory. Upgrading from 0.1.14 or
earlier preserves systems, signatures, notes, and EOL timestamps. The old combined status is split
conservatively: FirstMate does not invent a Life or Mass observation that the previous format could
not represent.

If a save fails, the Explore toolbar changes to **Save failed** and offers Retry. **Saving…** means
the latest edit is still queued; **Saved HH:MM** confirms the newest state reached local storage.
