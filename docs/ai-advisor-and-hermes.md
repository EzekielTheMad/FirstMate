# AI Advisor and Hermes setup

FirstMate's AI Advisor is optional. Every EVE and local-tracking feature works
when the Advisor provider is set to **Disabled**.

When enabled, the Advisor builds the same character-context summary regardless
of provider, then sends that summary and the goal you entered to the provider
you selected. FirstMate never silently switches providers or falls back to a
paid API.

## Choose a provider

| Provider | What you need | Typical use |
| --- | --- | --- |
| Disabled | Nothing | Use FirstMate without AI |
| Hermes Agent | A reachable Hermes API server and bearer key | Use a self-hosted Hermes agent and its configured model/subscription |
| Anthropic API | Anthropic API key and model id | Call Anthropic directly |
| OpenAI API | OpenAI API key and model id | Call OpenAI directly |
| Custom / OpenAI-compatible | `/v1` base URL, model id, and optional key | LM Studio or another compatible local/hosted endpoint |

Provider credentials are stored locally and encrypted with Electron
`safeStorage` when the operating-system keystore is available. They are never
sent to the renderer process.

## Connect FirstMate to Hermes

FirstMate uses Hermes's authenticated, OpenAI-compatible API. Hermes can run on
the same computer, another computer on your LAN, or a private remote server.

You need:

- a Hermes Agent installation with the API server enabled;
- TCP port `8642` reachable from the computer running FirstMate;
- a strong `API_SERVER_KEY`;
- Hermes itself configured with whichever model/provider you want it to use.

FirstMate does not configure Hermes's underlying model. If Hermes already uses
OpenAI Codex, Anthropic, OpenRouter, or another supported provider, FirstMate
requests use that existing Hermes configuration.

### 1. Enable the Hermes API

Set these environment variables for the Hermes container or service:

```env
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642
API_SERVER_KEY=replace-with-a-long-random-value
```

If Hermes runs in Docker, publish the port too:

```yaml
services:
  hermes:
    ports:
      - "8642:8642"
    environment:
      API_SERVER_ENABLED: "true"
      API_SERVER_HOST: "0.0.0.0"
      API_SERVER_PORT: "8642"
      API_SERVER_KEY: "${HERMES_API_KEY}"
```

For an Unraid template, add the four variables above and a TCP port mapping
from host port `8642` to container port `8642`, then apply the template so the
container is recreated with the new mapping.

Keep the API private. Do not forward port `8642` from your router to the public
internet. Use a VPN or an authenticated HTTPS reverse proxy if FirstMate must
connect across an untrusted network.

### 2. Check the Hermes endpoint

From the computer running FirstMate:

```bash
curl -H "Authorization: Bearer YOUR_KEY" \
  http://HERMES_HOST:8642/v1/models
```

A working server returns JSON containing the `hermes-agent` model. A `401`
response means the network path works but the key is missing or incorrect.

### 3. Configure FirstMate

Open **Settings → AI Advisor** and enter:

| Setting | Same computer | Hermes on your LAN |
| --- | --- | --- |
| Provider | `Hermes Agent` | `Hermes Agent` |
| Server URL | `http://127.0.0.1:8642/v1` | `http://192.168.x.x:8642/v1` |
| Hermes bearer key | Your `API_SERVER_KEY` | Your `API_SERVER_KEY` |
| Advisor model | `hermes-agent` | `hermes-agent` |
| Hermes session scope | `firstmate` | `firstmate` |

The URL must include `/v1`. Click **Test connection**, wait for **Connected to
Hermes successfully**, and then click **Save settings**.

The session scope is sent as `X-Hermes-Session-Key`. Give each FirstMate
installation or character a different value if you want their Hermes memory
scopes separated, for example `firstmate-main` and `firstmate-alt`.

## What FirstMate sends

For each Advisor request, FirstMate refreshes and sends a focused summary that
can include:

- character name and EVE character id;
- online state, wallet balance, current location, and active ship;
- total skill points, queue length, and the next queued skill;
- up to eight open market orders;
- up to five recent wallet-journal entries;
- a summary of recent mining activity;
- the goal and optional play-style text entered in the Advisor.

FirstMate does not send EVE refresh tokens, provider credentials, the complete
asset inventory, saved fittings, wormhole notes, or unrelated local data in the
current Advisor context.

The selected provider receives this data. For Hermes, that means the Hermes
server at the URL you configured. Review the tool and data access granted to
your Hermes agent as well: Hermes processes the request as an agent, not merely
as a text-only model proxy.

## Conversation history and Discord

FirstMate currently treats each **Get advice** request as an independent
question. Successful answers are saved locally so they can be reopened, but
that history is not automatically sent with the next question. Provider-neutral
multi-turn conversations are planned.

Hermes's session-scope header isolates FirstMate-related Hermes memory; it does
not turn the current FirstMate UI into a chat thread by itself.

A Hermes Discord channel is a separate interface with its own persistent
conversation. Connecting FirstMate to Hermes enables this direction:

```text
FirstMate → Hermes → configured model
```

It does **not** automatically enable this direction:

```text
Hermes/Discord → FirstMate character data
```

Giving a Discord agent live access to FirstMate data requires a separate,
optional, read-only FirstMate MCP interface. Until that exists, a Discord agent
must use values supplied in chat and must not claim it queried FirstMate or ESI.

## Troubleshooting

### `fetch failed` or connection refused

- Confirm Hermes is running.
- Confirm the container publishes `8642:8642`; exposing the port in the image is
  not the same as publishing it on the host.
- Confirm `API_SERVER_HOST=0.0.0.0` for LAN access. Use `127.0.0.1` only when
  FirstMate and Hermes run on the same computer.
- Check the host firewall and make sure the URL ends in `/v1`.

### `401 Unauthorized` or provider rejected the key

- Copy the exact value of `API_SERVER_KEY` into **Hermes bearer key**.
- Apply/recreate the Hermes container after changing environment variables.
- Entering a new key in FirstMate replaces the stored key; leaving the field
  blank keeps the previously stored key.

### `/v1/models` works but Advisor requests fail

- Confirm the Advisor model is `hermes-agent`.
- Check Hermes logs for an upstream model/provider error.
- Confirm Hermes's own model authentication or subscription session is valid.
- Allow up to two minutes for a complex Advisor response.

### Remote Hermes server

Use HTTPS when the connection leaves a trusted LAN or private VPN. FirstMate
accepts HTTP and HTTPS URLs, but the bearer key is only protected in transit
when the transport itself is protected.

## Related documentation

- [Hermes API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/)
- [Hermes sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions/)
- [Hermes Discord gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord/)
- [FirstMate releases](https://github.com/EzekielTheMad/FirstMate/releases)
