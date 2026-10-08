# Hermes Headroom Monitoring

[![Tests](https://github.com/Joni-Lover/hermes-headroom-monitoring/actions/workflows/tests.yml/badge.svg)](https://github.com/Joni-Lover/hermes-headroom-monitoring/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Hermes plugin](https://img.shields.io/badge/Hermes-headroom--monitor-gold.svg)](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins)

Read-only [Headroom](https://github.com/headroomlabs-ai/headroom) proxy monitoring for the **Hermes Web Dashboard** and **Hermes Desktop**. See token savings, compression quality, recent agent activity, and cost estimates without leaving Hermes.

> **Proxy-wide, not per-chat.** Metrics describe the entire Headroom proxy. They are not session totals, profile-specific usage, provider invoices, or guaranteed savings.

[Installation](#installation) · [Usage](#usage) · [Metrics and accounting](#metrics-and-accounting) · [API contract](#api-contract) · [Development](#development)

## Features

- **Live metrics:** before/after token accounting, attributed savings, compressed request counts, average and best compression, and bypass reasons.
- **Two native Hermes surfaces:** a dashboard page with sidebar/header widgets; a Desktop page, dockable panel, status-bar counter, and command-palette entry.
- **Independent breakdowns:** agent/model/provider activity, tool-schema savings, and Responses HTTP/WebSocket processing counters, without double-counting them into a global total.
- **Cost estimates:** compression savings and provider-cache discounts displayed separately.
- **Bilingual interface:** **Auto / English / Русский**, including status messages, accessible labels, and locale-aware number/date formatting.
- **Read-only architecture:** no access to Hermes secrets, prompts, completions, or conversation files; no provider or compression configuration changes.
- **Bounded sampling:** a shared five-second cache and up to 120 in-memory historical snapshots, with explicit offline, stale, and unavailable states.

## Installation

### Prerequisites

- Hermes with support for agent plugins and dashboard plugin APIs. For Desktop, use a release with the plugin SDK and focused-session ownership support.
- Headroom already running on the **same machine as the Hermes backend**, reachable at `http://127.0.0.1:8787` with `/livez` and `/stats` available.
- Git for installation from the repository.

This plugin **does not install Headroom or route LLM traffic**. Configure the proxy separately. A browser or remote Desktop client does not need direct access to port `8787`.

### Install and enable the backend

Run on the machine serving your Hermes dashboard/backend, in the intended Hermes profile:

```sh
hermes plugins install https://github.com/Joni-Lover/hermes-headroom-monitoring
hermes plugins enable headroom-monitor
```

The installer also accepts the shorthand `hermes plugins install Joni-Lover/hermes-headroom-monitoring`. Alternatively, enable the installed plugin through **Web Dashboard → Settings → Plugins → Enable**.

**The repository name is not the plugin ID:**

| Identifier | Value |
| --- | --- |
| GitHub repository | `Joni-Lover/hermes-headroom-monitoring` |
| Registered plugin ID (`plugin.yaml`) | `headroom-monitor` |
| Installation directory | `${HERMES_HOME:-$HOME/.hermes}/plugins/headroom-monitor` |
| Backend API namespace | `/api/plugins/headroom-monitor` |

Hermes uses the manifest name for CLI installation. Keep the plugin ID and directory name **`headroom-monitor`**; do not rename the installed directory to `hermes-headroom-monitoring`.

#### Alternative: manual clone

Use this instead of the CLI install command, with an unused destination directory:

```sh
mkdir -p "${HERMES_HOME:-$HOME/.hermes}/plugins"
git clone https://github.com/Joni-Lover/hermes-headroom-monitoring.git \
  "${HERMES_HOME:-$HOME/.hermes}/plugins/headroom-monitor"
hermes plugins enable headroom-monitor
```

`HERMES_HOME` selects the target Hermes home; the fallback is `~/.hermes`. For a named profile, use that profile's CLI context and matching home. After enabling, open **Headroom** in the dashboard navigation. Rescan/reload plugins and refresh an already-open dashboard if the page has not appeared.

### Install the Hermes Desktop frontend

The Desktop frontend is a separate client-side extension. Installing the backend on a remote gateway does **not** install files on your computer.

On the **Desktop computer**, obtain a local checkout of this repository. From its root, copy the plain ESM entry point into the Desktop plugin directory:

```sh
mkdir -p "${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/headroom-monitor"
cp desktop/plugin.js \
  "${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/headroom-monitor/plugin.js"
```

Then:

1. Open **Hermes Desktop → Settings → Plugins** and enable **Headroom · Proxy Monitor** (localized when Russian is selected).
2. If it is not listed yet, run **Reload desktop plugins** from the command palette.
3. Connect to the Hermes backend/profile where `headroom-monitor` is enabled.
4. Open **Headroom** from the sidebar or command palette.

Neither frontend needs a production npm install or build. Desktop uses the application's React and plugin SDK; the backend uses Hermes' Python environment.

For Hermes extension details, see the official [plugin guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins), [dashboard extension guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard), and [Desktop plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk).

## Usage

### Web Dashboard

Open **Headroom** in the plugin navigation. The page and contributed widgets poll through the authenticated Hermes SDK at five-second intervals. Sidebar widget visibility depends on the dashboard layout. Requests use Hermes' authentication and ingress routing; no additional proxy port needs to be exposed.

### Hermes Desktop

Use the full page, dockable panel, or live status-bar counter. Reads use scoped `ctx.rest('/snapshot')`, not renderer-side requests to localhost.

The focused session must have a confirmed owner matching the active backend connection and profile. An unresolved or different owner blocks reads and hides metrics from the other source. This connection check prevents cross-source display; it does **not** make the underlying proxy metrics session-specific.

### Language

**Auto** selects Russian for a client's primary Russian locale (`ru` or `ru-*`) and otherwise falls back to English. Choose **English** or **Русский** to override it independently of the host application's language.

Preferences are stored locally for this plugin on each client. The remote gateway's locale does not select your language. If persistent storage is unavailable, the interface remains usable without a durable preference.

## Metrics and accounting

**Tokens before is the accounting base before optimization**, including tracked compression and tool-schema deferral savings. It is not unique context size or a per-session token budget. Repeated requests and conversation attribution mean the counters do not all measure the same thing.

| Metric | Source and interpretation |
| --- | --- |
| API requests, mode, primary model | Headroom `summary`; proxy-wide values. |
| Tokens before | `summary.compression.total_tokens_before`; the pre-optimization accounting base. |
| Tokens saved | Prefer `summary.compression.total_tokens_saved_all_layers` (compression plus deferral); fall back to `total_tokens_removed` for older stats. |
| Tokens after | Use valid `tokens.input` directly; otherwise derive `tokens_before - tokens_saved`. A negative fallback remains `null`. |
| Overall savings share | `tokens_saved / tokens_before * 100`; zero when the denominator is zero. This is not average request compression. |
| Average / best compression | Upstream `avg_compression_pct` and `best_compression_pct`; the average concerns compressed logged requests, not all requests. |
| Tool-schema savings | `summary.compression.tool_schema_tokens_saved`; a sublayer, not an extra amount to add to total savings. |
| Responses HTTP/WS counter | `summary.codex_ws.tokens_saved`; compression-unit processing, including repeated decisions in HTTP Responses and WebSocket handling. Not unique tokens or completed requests. |
| Agent rows | `agent_usage.agents`; source-defined recent request-log wire reductions, independent of global attributed savings. |

### Do not sum independent counters

Global savings use conversation-attributed/novel reductions where identity is available. Agent rows describe reductions in transmitted request context; repeated compression may appear there without increasing global attributed savings. Agent totals can therefore differ from or exceed the global total.

The backend preserves these independent upstream values. **Do not sum agent rows, add tool-schema savings again, or add the Codex WS counter to global `tokens_saved`.** The overall share combines attributed savings with the cumulative before-optimization base; it is not unique-context shrinkage.

Missing optional metrics remain `null` and appear as **—**, not invented zeroes. Raw percentages above 100% are retained and labelled as upstream accounting anomalies rather than rewritten into plausible values.

### Cost estimates, not bills

All dollar values and cost-savings percentages are **estimates based on API rates**, not measured charges or ChatGPT/Copilot subscription savings.

- Compression savings come only from `summary.cost.breakdown.compression_savings_usd`.
- Provider-cache discounts come separately from `summary.cost.provider_cache_discount_usd`.
- Before/after cost estimates and the cost-savings percentage use `without_headroom_usd`, `with_headroom_usd`, and `savings_pct`.

The plugin does not substitute total saved USD or cache discounts for compression savings, and does not combine the displayed estimates into a new total.

## Architecture and privacy

```text
Headroom on the backend machine
  127.0.0.1:8787/livez + /stats
                │ fixed read-only HTTP
                ▼
Hermes plugin: headroom-monitor
  dashboard/plugin_api.py → sanitized snapshot + shared cache
                │ /api/plugins/headroom-monitor/snapshot
                ├── Web Dashboard: Hermes SDK fetchJSON
                └── Hermes Desktop: scoped ctx.rest
```

- **Agent package:** `plugin.yaml` registers `headroom-monitor`; `__init__.py` exports a no-op `register(ctx)`. No agent tools or hooks are added, and `headroom_retrieve` is left untouched.
- **Dashboard discovery:** `dashboard/manifest.json` declares the frontend assets and `api: plugin_api.py`. The backend exports a module-level FastAPI `router = APIRouter()` mounted under the plugin namespace.
- **No secret or conversation reads:** the monitor does not open Hermes configuration, credential stores, prompts, completions, transcripts, or request-log files. It consumes only the fixed upstream health/stats endpoints.
- **Allowlisted output:** only documented metrics and bounded identifiers/count maps are returned. Unknown fields, arbitrary nested content, credential-shaped identifiers, upstream response bodies, and exception details are not forwarded to clients.
- **No configuration writes:** the monitor does not change providers, compression settings, or routing. UI language preferences are client-local.

### Operational limits

| Boundary | Behavior |
| --- | --- |
| Upstream destination | Only `GET http://127.0.0.1:8787/livez` and `/stats`; no caller-selected URL or environment proxy. |
| Transport | Redirects and non-200 responses are rejected; two-second socket timeout, two-second body-reading deadline per endpoint, and 1 MiB response-body cap. |
| Sampling | A process-wide lock serializes samples; both successes and failures are cached for five seconds after sampling completes. |
| Execution | The synchronous FastAPI route runs in its worker threadpool; returned snapshots are defensive copies. |
| History | Up to 120 successful samples in memory; no background sampler, persistent audit log, write API, or reset API. |
| Reset detection | Decreases in tracked cumulative counters clear history. Missing optional counters preserve the previous baseline within the same epoch. |

History resets when the backend process/module restarts or a proxy counter reset is detected. Sampling is driven by clients; closing the UI stops its polling. Plugin files live under the Hermes home rather than the Hermes source checkout.

## API contract

```http
GET /api/plugins/headroom-monitor/snapshot
```

Use Hermes' authenticated dashboard/backend connection. The route accepts no caller-controlled destination, body, or sampling configuration and defines no write methods.

### Response envelope

| Field | Type | Meaning |
| --- | --- | --- |
| `available` | boolean | Whether the attempted upstream sample was valid. |
| `sampled_at` | string | UTC ISO 8601 timestamp of the sampling attempt; cached responses keep the original timestamp. |
| `scope` | string | Always `"proxy"`. |
| `summary` | object | Normalized metrics when available; `{}` otherwise. |
| `agents` | array | Allowlisted agent rows when available; `[]` otherwise. |
| `history` | array | Retained successful samples, including during an outage. |
| `error` | string, failure only | Fixed safe message: `"Headroom unavailable"` or `"Invalid Headroom stats"`. |

An illustrative unavailable response with no retained history:

```json
{
  "available": false,
  "sampled_at": "2026-01-01T00:00:00+00:00",
  "scope": "proxy",
  "summary": {},
  "agents": [],
  "history": [],
  "error": "Headroom unavailable"
}
```

Upstream outages and invalid stats are reported through `available: false`, not through fabricated metric values. Raw upstream errors and bodies never appear in the response.

### Successful summary fields

| Group | Keys |
| --- | --- |
| Proxy identity and activity | `mode`, `primary_model`, `api_requests` |
| Compression quality | `requests_compressed`, `avg_compression_pct`, `best_compression_pct` |
| Token accounting | `tokens_before`, `tokens_saved`, `tokens_after`, `compression_pct_overall` |
| Additional counters | `tool_schema_tokens_saved`, `codex_ws_tokens_saved` |
| Cost estimates | `cost_without_usd`, `cost_with_usd`, `compression_saved_usd`, `provider_cache_discount_usd`, `cost_savings_pct` |
| Bypass reasons | `uncompressed_requests` — allowlisted reason-to-numeric-count map |

`mode` and `primary_model` are validated strings or `null`; numeric fields are finite, non-negative JSON numbers or `null`, never booleans or numeric strings. Invalid required request/before/saved counters reject the sample. Optional absent or malformed scalar metrics remain `null`, except the explicitly documented derived token values.

### Agent and history fields

Each agent row contains only:

```text
agent, label, requests, before_tokens, after_tokens, tokens_saved,
savings_percent, models, providers
```

`models` and `providers` are identifier-to-count **maps**, not arrays. Rows and count maps are bounded to at most 128 entries. Identifiers and labels are validated lexical strings of at most 96 characters; invalid optional labels become `null`.

Each history sample contains only:

```text
sampled_at, api_requests, tokens_before, tokens_saved, compression_pct_overall
```

## Development

### Set up a test environment

Run from the repository root. The CI baseline is **Python 3.12** and **Node.js 22**. Use an isolated Python environment for development:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install fastapi httpx pyyaml
npm ci
```

npm dependencies are **test-only**: React, React DOM, React Query, and jsdom support the frontend harnesses. They are not needed to run the installed plugin.

### Run the test suites

```sh
# Backend: stdlib unittest + FastAPI contract tests
python -m unittest discover -s tests -p test_backend.py -v

# Web Dashboard: Node test runner
npm run test:web

# Native Desktop: SDK contract, React SSR, and DOM tests
npm run test:desktop
```

The Desktop npm script sets `HERMES_TEST_DEPS` to the checkout and enables Node's VM-module support. No manual test dependency path is needed.

The suites cover:

- **Backend:** metric normalization, independent counters, invalid data and redaction, fixed transport, caching, concurrent clients, defensive copies, history bounds, reset epochs, no-op registration, and GET-only routing.
- **Web:** SDK polling, rendering, language selection, missing metrics, stale/offline behavior, charts, accounting labels, and safe UI output.
- **Desktop:** SDK registrations, localized metadata and UI, scoped requests, owner/connection changes, in-flight response isolation, empty/offline states, and React DOM interactions.

The [GitHub Actions workflow](.github/workflows/tests.yml) runs all three suites on pushes and pull requests.

### Repository layout

```text
.
├── plugin.yaml                Agent plugin identity
├── __init__.py                No-op agent registration
├── dashboard/                 Web Dashboard assets and backend
│   ├── manifest.json          Discovery and API declaration
│   ├── plugin_api.py          Read-only snapshot endpoint
│   ├── index.js / styles.css  Dashboard frontend
│   └── tests/web.test.cjs      Web test harness
├── desktop/
│   ├── plugin.js              Plain ESM Desktop frontend
│   └── tests/plugin.test.mjs   Desktop test harness
└── tests/test_backend.py      Backend contract tests
```

When contributing, keep `headroom-monitor` consistent across the manifest, directories, frontend registrations, and API namespace. Preserve proxy-wide scope labels and the accounting boundaries above; run all three test suites before submitting a pull request.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Headroom page is missing | Confirm installation under `plugins/headroom-monitor` and enable it in the serving profile. Rescan/reload plugins and refresh the dashboard. |
| Snapshot is unavailable | Check that Headroom serves `/livez` and `/stats` at `127.0.0.1:8787` on the **backend machine**, not the browser/Desktop computer. |
| Invalid Headroom stats | Required counters must be finite, non-negative numbers. Inspect the proxy's stats compatibility; the monitor fails closed instead of forwarding malformed data. |
| Desktop plugin is missing | Copy `desktop/plugin.js` to the **client's** `desktop-plugins/headroom-monitor/plugin.js`, enable it in Desktop settings, and reload Desktop plugins if needed. |
| Desktop says “Different source” | Activate the connection/profile matching the focused session. Missing ownership support also blocks reads; use a compatible Hermes Desktop release. |
| Metrics show **—** or an accounting anomaly | Missing values and contradictory upstream counters remain explicit. Agent and Responses counters are not interchangeable with global totals. |
| History disappears | History is in-memory and resets on backend restart or detected cumulative-counter reset. It is not a durable usage ledger. |

## License

[MIT](LICENSE) © 2026 Joni-Lover.
