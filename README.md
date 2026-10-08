# Hermes Headroom Monitoring

Persistent unified Hermes plugin under `$HERMES_HOME/plugins/headroom-monitor/`.
The backend is **read-only** and reports **global proxy metrics**, not a chat,
profile, session, or per-user bill. It adds no tools, hooks, secret access, or
configuration writes. It leaves `headroom_retrieve` untouched.

## Installation

Headroom must already run on the **same gateway** at `127.0.0.1:8787`.
This plugin monitors it; it does not install Headroom or route LLM traffic.

```sh
git clone https://github.com/Joni-Lover/hermes-headroom-monitoring.git   "${HERMES_HOME:-$HOME/.hermes}/plugins/headroom-monitor"
```

Keep the installation directory and plugin identifier **`headroom-monitor`**
(the GitHub repository name is different). Enable the agent plugin in Hermes
Dashboard's Plugins settings, rescan/reload plugins, and open **Headroom**.
For a remote native Desktop, additionally copy `desktop/plugin.js` into that
computer's `$HERMES_HOME/desktop-plugins/headroom-monitor/plugin.js` and enable
it in Desktop Settings → Plugins. There is no production npm build/install.

### Language

Both frontends default to English. **Auto** uses Russian when the browser /
Desktop renderer's primary system locale is Russian (`ru` or `ru-*`), and
English for other languages. The **Auto / English / Русский** selector lets
you override this independently of the host application. Preferences are
stored locally for this plugin; clearing browser storage returns to Auto.
A remote gateway's Linux locale does not override your client's locale.

## Backend discovery

`plugin.yaml` declares the unified Python package. `__init__.py` exports a
no-op `register(ctx)`. Backend discovery separately requires
`dashboard/manifest.json` with `"name": "headroom-monitor"`,
`"api": "plugin_api.py"` (and optionally `"tab": {"hidden": true}` when using
only the desktop frontend). The web-frontend owner maintains that manifest.

`dashboard/plugin_api.py` exports a module-level FastAPI `router = APIRouter()`.
Hermes mounts this at `/api/plugins/headroom-monitor`, according to local
`website/docs/user-guide/features/extending-the-dashboard.md` and
`hermes_cli/web_server_dashboard.py`. The loader does **not** call
`setup(router)`. The Python plugin must be enabled via Hermes' supported
configuration workflow. The authenticated production endpoint and web rendering were verified on a
HAOS gateway using the supported dashboard plugin API without restarting services. Installing on a gateway does
not automatically install its native Desktop half on a remote client's filesystem.

## API contract

The only route is `GET /api/plugins/headroom-monitor/snapshot`:

```json
{
  "available": true,
  "sampled_at": "2026-10-08T16:31:29.507330+00:00",
  "scope": "proxy",
  "summary": {},
  "agents": [],
  "history": []
}
```

The example shows the envelope, not fabricated metric data. UTC ISO timestamp
marks the attempted sample; cached responses retain that timestamp.
Unavailable/invalid responses use `available: false`, `summary: {}`,
`agents: []`, retained historical samples, and a fixed safe `error` string.
No upstream error text/body, prompts, completions, headers, request logs,
configuration, OAuth/access tokens, or credentials are returned.

Summary contains exactly these keys:

- `mode`, `primary_model`, `api_requests`
- `requests_compressed`, `avg_compression_pct`, `best_compression_pct`
- `tokens_before`, `tokens_saved`, `tokens_after`, `compression_pct_overall`
- `tool_schema_tokens_saved`, `codex_ws_tokens_saved`
- `cost_without_usd`, `cost_with_usd`, `compression_saved_usd`,
  `provider_cache_discount_usd`, `cost_savings_pct`
- `uncompressed_requests` (allowlisted reason-to-numeric-count map)

Agents contain only `agent`, `label`, `requests`, `before_tokens`,
`after_tokens`, `tokens_saved`, `savings_percent`, `models`, `providers`.
`models` and `providers` are bounded identifier-to-count maps, not arrays.
History contains only `sampled_at`, `api_requests`, `tokens_before`,
`tokens_saved`, `compression_pct_overall`.

Optional absent/malformed scalar metrics are `null`, never invented zeroes,
except the explicitly defined derived token metrics described below.
Malformed required summary counters fail closed as `Invalid Headroom stats`.
Counters must be finite, non-negative JSON numbers (not booleans). Strings
are short lexical metric identifiers/labels; credential-shaped strings are
rejected. Unknown fields and nested objects cannot pass through.

## Sources and accounting boundaries

- API requests/mode/model: Headroom `summary`.
- Tokens before: `summary.compression.total_tokens_before`. Accounting review
  verified this includes compression **and tool-schema deferral** savings in
  the before denominator.
- Tokens saved: prefer valid `summary.compression.total_tokens_saved_all_layers`
  (compression + deferral); fall back to `total_tokens_removed` for older stats.
- Tokens after: valid `tokens.input` reported directly; otherwise derive
  `tokens_before - tokens_saved` (negative contradictory results remain null).
- Overall compression percentage: `tokens_saved / tokens_before * 100`, zero
  when the before denominator is zero. Never use average request compression
  for this overall ratio.
- Tool-schema savings: `summary.compression.tool_schema_tokens_saved`.
- Responses-unit savings: `summary.codex_ws.tokens_saved` is emitted for HTTP
  Responses as well as WebSocket processing. It counts repeated compression-unit
  decisions, not unique tokens or completed requests, and is **never added**
  to proxy `tokens_saved`.
- Global savings are conversation-attributed/novel reductions when identity is
  available; agent rows are recent request-log wire reductions. The global ratio
  mixes attributed savings with cumulative request input, not unique-context
  shrinkage. Request averages are weighted over compressed logged requests only.
- Compression USD savings: `summary.cost.breakdown.compression_savings_usd`.
  No substitution with total saved USD or provider-cache discount.
- Other cost fields: `summary.cost.without_headroom_usd`, `with_headroom_usd`,
  `provider_cache_discount_usd`, and `savings_pct`.
- Agent rows: `agent_usage.agents`, independent source-defined counters.

**Every financial field and cost-savings percentage must be labelled an
estimate by frontends**, not a measured bill or guaranteed saving.
Provider-cache discount must remain separate from compression savings.

Live upstream stats were observed to disagree between global proxy counters
and agent/Codex WS counters. The backend deliberately preserves those
independent values rather than summing agents, adding WS savings, or
fabricating a reconciliation. The only derivations are the documented overall
ratio and missing-input-token fallback, using the reviewed common denominator.
UIs should explain the distinct
scopes/accounting and should not stack these counters into one total.

## Operational bounds

The transport can only GET fixed `http://127.0.0.1:8787/livez` and `/stats`.
It uses direct loopback HTTP (no environment proxies), rejects redirects and
non-200 status, has a 2-second socket timeout per endpoint and a 2-second
body-reading deadline, and caps response bodies at 1 MiB. No caller URL,
profile, body, or query parameter controls the destination.

A process-wide locked store serializes sampling and caches both success and
failure for 5 seconds after sampling completes. Repeated/concurrent clients
cannot flood the proxy. FastAPI's synchronous route runs in its worker
threadpool, not the event loop. Returned values are defensive copies.

Up to 120 successful snapshots are kept **only in memory**; they reset when
the backend process/module restarts. Any decrease in the observed cumulative
request, compressed-request, proxy-token-before/saved, tool-schema-saved or
Codex-WS-saved counters clears history. Missing optional counters do not
trigger resets. There is no background sampler, write API, or reset API.

## Tests

From `/config/.hermes` with the existing Hermes Python environment:

```sh
python -m unittest discover -s plugins/headroom-monitor/tests -p test_backend.py -v
```

Uses stdlib unittest (pytest is not installed here). Covers normalization,
independent contradictory counters, outage/error redaction, invalid stats,
typed field allowlisting, secret-shaped identifiers, malformed optional data,
5-second caching including failures, defensive copies, 12 concurrent clients,
120-snapshot history bounds, counter resets, fixed transport/redirect rejection,
body size cap, no-op plugin registration, and GET-only FastAPI mounting.
Backend behavior was developed with observed failing-then-passing test cycles.
Tests mount a fresh FastAPI app. The coordinator also verified production
asset discovery, the real snapshot, anonymous 401, read-only methods, source
redaction, and real web-dashboard rendering with live Headroom data.

## Using the visualizations

### HAOS web dashboard

Open the add-on's **Dashboard**, then **Headroom** in the plugin navigation.
If the dashboard was already open, reload the browser page once. The page and
live header indicator update every 5 seconds. The sidebar widget is contributed
too, but its visibility depends on the selected dashboard layout. No extra
Headroom port needs to be exposed; auth and ingress prefixes use Hermes SDK.

### Native Hermes Desktop on another computer

This is a separate extension runtime. Copy `desktop/plugin.js` to the Desktop
computer's `$HERMES_HOME/desktop-plugins/headroom-monitor/plugin.js` (normally
`~/.hermes/desktop-plugins/headroom-monitor/plugin.js`). The native file is
plain ESM and requires no build/npm installation. Enable **Headroom · proxy
monitor** in Settings → Plugins, then run **Reload desktop plugins** if needed.
Connect the Desktop client to the existing HAOS gateway with the enabled
server plugin. Open **Headroom** from the sidebar or command palette. It adds
a dockable 350px panel, full page, and live status-bar token counter.

Backend data is global to that Headroom proxy, not per chat or profile. If the
focused tile belongs to another host/profile, the native UI fails closed and
asks you to activate its connection. SDK calls never browser-fetch localhost.

Native UI was tested using real React SSR and DOM/jsdom but has not been
visually verified inside the user's remote Electron client. The web version
was checked inside the running Hermes dashboard.

## Persistence and limitations

All package files live outside the Hermes source repository, under persistent
`/config/.hermes/plugins/headroom-monitor/` on this addon. Hermes `git pull`
does not rewrite them; future SDK compatibility is not guaranteed.
The graph is polling history, up to 120 snapshots in memory, not a durable audit
log. It resets on dashboard/module restart or a proxy counter reset. Values
above 100% are retained and marked as upstream accounting anomalies rather
than silently clamped into plausible percentages.

Portable checkout verification (Node 22+, Python 3.12+):

```sh
python -m pip install fastapi httpx pyyaml
npm ci
python -m unittest discover -s tests -p test_backend.py -v
npm run test:web
npm run test:desktop
```

npm dependencies are **test-only**; the installed plugin does not need them.

Frontend verification from an existing Hermes home:

```sh
node --test plugins/headroom-monitor/dashboard/tests/web.test.cjs
NODE_NO_WARNINGS=1 node --experimental-vm-modules --test plugins/headroom-monitor/desktop/tests/plugin.test.mjs
```

The native test harness requires test-only React, React DOM, React Query and
jsdom under `$HERMES_TEST_DEPS` (default: the addon scratch test-deps folder);
they are not runtime dependencies of the plugin.

