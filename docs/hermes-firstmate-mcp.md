# Give Hermes and Discord read-only access to FirstMate

FirstMate 0.1.16 adds an optional authenticated MCP server. It exposes the same ESI services,
inventory cache, exploration store, and local libraries used by the desktop app. It does not build
a second EVE data pipeline, and none of its tools can sell, move, reprocess, delete, or edit data.

```text
Discord conversation → Hermes agent/tools → FirstMate MCP → existing ESI + local stores
```

FirstMate must be running and logged into EVE whenever Hermes queries live character data.

## 1. Enable the bridge in FirstMate

Open **Settings → Hermes data access (MCP)**:

1. Choose **Enabled**.
2. Choose the access mode:
   - **This computer only** for a native Hermes process on the same machine.
   - **Local network / Docker** when Hermes runs in Docker, WSL, or another trusted LAN machine.
3. Leave port `8643` unless it conflicts with another service.
4. Choose **Generate key**, then copy the `.env` line. This FirstMate key is separate from
   Hermes's `API_SERVER_KEY`.
5. Choose **Load locations** and select the asset location that means “home base” to you.
6. Copy the generated `config.yaml` block and choose **Save settings**.

LAN/Docker mode binds FirstMate to all network interfaces. It uses bearer authentication but plain
HTTP, so use it only on a trusted private network. Do not expose port `8643` through your router.
Use a private VPN or authenticated HTTPS reverse proxy for remote access.

## 2. Configure Hermes

Add the copied key to `~/.hermes/.env`:

```env
FIRSTMATE_MCP_KEY=your-generated-firstmate-key
```

For a containerized Hermes install, put the same line in the `.env` file in its mounted data
directory (for example, `/opt/data/.env`) so the gateway container receives it.

For native Hermes on the FirstMate computer, add this to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  firstmate:
    url: "http://127.0.0.1:8643/mcp"
    headers:
      Authorization: "Bearer ${FIRSTMATE_MCP_KEY}"
    timeout: 120
    connect_timeout: 30
    supports_parallel_tool_calls: false
    tools:
      resources: false
      prompts: false
```

For Hermes in Docker Desktop, enable FirstMate's **Local network / Docker** mode and use:

```yaml
    url: "http://host.docker.internal:8643/mcp"
```

For a different LAN computer, use the FirstMate computer's private IP address. Restart the Hermes
gateway or run `/reload-mcp`. Hermes prefixes the discovered tools with `mcp_firstmate_`.

## 3. Discord and agent instructions

Discord uses the normal Hermes agent pipeline, including MCP tools. No separate Discord data
adapter is required. A channel-specific `AGENTS.md` is useful for behavior:

```markdown
For EVE questions, use FirstMate MCP tools before answering questions about the
character, assets, skills, wallet, ships, industry, or wormhole chain. Say when
FirstMate is unavailable or when a value is an estimate. Never invent live data.

For asset cleanup, call list_asset_locations if home base is not configured,
then get_asset_cleanup_context. Ask about doctrine ships, planned fits, industry
plans, hauling effort, and reserve quantities before declaring something safe
to sell or reprocess.
```

The Discord channel must already be authorized by the Hermes gateway. To make it mention-free, add
its id to `DISCORD_FREE_RESPONSE_CHANNELS`; otherwise mention the bot normally.

## Available tools

| Area | Tools |
| --- | --- |
| Availability | `get_firstmate_status` |
| Character | `get_character_overview`, `get_current_location`, `get_current_ship`, `get_skills_and_queue` |
| Economy | `get_wallet_activity`, `get_market_orders` |
| Assets | `list_asset_locations`, `get_assets_at_location`, `search_assets`, `get_asset_cleanup_context`, `analyze_reprocessing_candidates`, `get_ships` |
| Activity | `get_mining_history`, `get_industry_jobs`, `get_clones_and_implants` |
| Exploration | `get_exploration_chain`, `get_exploration_system`, `get_wormhole_alerts` |
| Local knowledge | `get_combat_library`, `get_advisor_history` |

All list/search tools are bounded so a large inventory does not flood a Discord conversation.

## Asset-cleanup accuracy

The cleanup tool is designed to support questions such as:

> Can you look at my assets at my home base and help decide what to sell, keep, or reprocess?

It combines location-specific gear and materials, ships and their fitted/cargo items, open market
orders, active industry jobs, saved fits, and known ore reprocessing comparisons. Hermes receives
the evidence needed to discuss tradeoffs, but should not pretend the estimates are exact:

- prices use ESI universe average/adjusted values, not executable local orders or guaranteed Jita
  prices;
- reprocessing coverage is curated and ore-focused;
- reprocessing values assume 100% base yield before skills, facility bonuses, and tax;
- ice and general module reprocessing are not currently valued;
- fitted ships, blueprints, and items reserved for future plans need player judgment.

## Troubleshooting

- **401 Unauthorized:** the `FIRSTMATE_MCP_KEY` in Hermes does not match FirstMate. Generate a new
  key, update `.env`, save FirstMate settings, and reload MCP.
- **Connection refused:** FirstMate is closed, the bridge is disabled, or the URL/port is wrong.
- **Docker cannot connect:** enable **Local network / Docker** and use `host.docker.internal`, not
  `127.0.0.1` inside the container.
- **Tools exist but ESI calls fail:** open FirstMate, log in again, and grant the requested read-only
  scopes.
- **Home base not configured:** call `list_asset_locations`, then select that stable location in
  FirstMate Settings.

References: [Hermes MCP configuration](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference),
[Hermes Discord gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord/),
and the [official MCP TypeScript server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md).
