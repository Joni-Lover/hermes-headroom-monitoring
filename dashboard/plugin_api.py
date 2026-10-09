"""Global proxy-only metrics. Never reads Hermes conversations or credentials."""
import copy
import json
import time
import threading
import math
import re
from datetime import datetime, timezone
from http.client import HTTPConnection
from fastapi import APIRouter

LIVE_URL = "http://127.0.0.1:8787/livez"
STATS_URL = "http://127.0.0.1:8787/stats"


def fetch_fixed(url):
    """No environment proxies, credentials, redirects, or caller-chosen destinations."""
    if url not in (LIVE_URL, STATS_URL):
        raise ValueError("fixed endpoints only")
    connection = HTTPConnection("127.0.0.1", 8787, timeout=2.0)
    deadline = time.monotonic() + 2.0
    try:
        connection.request("GET", "/livez" if url == LIVE_URL else "/stats", headers={"Accept": "application/json"})
        response = connection.getresponse()
        if response.status != 200:
            raise OSError("upstream HTTP status")
        parts = []
        length = 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise OSError("upstream timeout")
            if connection.sock is not None:
                connection.sock.settimeout(remaining)
            part = response.read1(65536)
            if not part:
                return b"".join(parts)
            length += len(part)
            if length > 1024 * 1024:
                raise ValueError("stats response too large")
            parts.append(part)
    finally:
        connection.close()


def number(value):
    if type(value) not in (int, float) or value < 0:
        return None
    try:
        return value if math.isfinite(value) else None
    except OverflowError:
        return None


def text(value, label=False):
    if not isinstance(value, str) or re.search(
        r"(?i)(?:^sk-|^gh[pousr]_|^Bearer\b|authorization|api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)", value
    ):
        return None
    pattern = r"[A-Za-z0-9][A-Za-z0-9_. /()+-]{0,95}" if label else r"[A-Za-z0-9][A-Za-z0-9_./:+-]{0,95}"
    return value if re.fullmatch(pattern, value) else None


def mapping(value):
    return value if isinstance(value, dict) else {}


UNCOMPRESSED_REASONS = frozenset(("prefix_frozen", "size_floor", "no_savings", "compressor_noop",
    "cache_hit", "passthrough", "disabled", "below_threshold", "compression_disabled",
    "no_compressible_content", "error", "ratio_too_high", "no_content", "skipped"))


def counts(value, reasons=False):
    return {k: number(v) for k, v in list(mapping(value).items())[:128]
        if text(k) is not None and number(v) is not None and (not reasons or k in UNCOMPRESSED_REASONS)}


def normalize(data):
    if not isinstance(data, dict) or not isinstance(data.get("summary"), dict):
        raise ValueError("invalid stats")
    s = data["summary"]
    c = s.get("compression")
    saved = number(mapping(c).get("total_tokens_saved_all_layers"))
    if saved is None:
        saved = number(mapping(c).get("total_tokens_removed"))
    if not isinstance(c, dict) or any(
        number(value) is None
        for value in (s.get("api_requests"), c.get("total_tokens_before"), saved)
    ):
        raise ValueError("invalid counters")
    before = c["total_tokens_before"]
    cost = mapping(s.get("cost"))
    tokens = mapping(data.get("tokens"))
    after = number(tokens.get("input"))
    if after is None:
        after = number(before - saved)
    summary = {"mode": text(s.get("mode")), "primary_model": text(s.get("primary_model")),
        "api_requests": s["api_requests"],
        "requests_compressed": c.get("requests_compressed"),
        "avg_compression_pct": c.get("avg_compression_pct"),
        "best_compression_pct": c.get("best_compression_pct"),
        "tokens_before": before, "tokens_saved": saved,
        "tokens_after": after,
        "compression_pct_overall": (saved / before * 100.0) if before else 0.0,
        "tool_schema_tokens_saved": c.get("tool_schema_tokens_saved"),
        "codex_ws_tokens_saved": mapping(s.get("codex_ws")).get("tokens_saved"),
        "cost_without_usd": cost.get("without_headroom_usd"),
        "cost_with_usd": cost.get("with_headroom_usd"),
        "compression_saved_usd": mapping(cost.get("breakdown")).get("compression_savings_usd"),
        "provider_cache_discount_usd": cost.get("provider_cache_discount_usd"),
        "cost_savings_pct": cost.get("savings_pct"),
        "uncompressed_requests": counts(s.get("uncompressed_requests"), reasons=True)}
    gemini = mapping(data.get("gemini_compression"))
    summary["gemini"] = {
        "enabled": gemini.get("enabled") is True,
        "patch_version": text(gemini.get("patch_version")),
        "requests": number(gemini.get("requests")),
        "wire_tokens_before": number(gemini.get("wire_tokens_before")),
        "wire_tokens_after": number(gemini.get("wire_tokens_after")),
        "wire_tokens_saved": number(gemini.get("wire_tokens_saved")),
        "ccr_guard_restored_payloads": number(gemini.get("ccr_guard_restored_payloads")),
        "excluded_payload_bytes": number(gemini.get("excluded_payload_bytes")),
        "passthrough_requests": number(gemini.get("passthrough_requests")),
        "no_savings_requests": number(gemini.get("no_savings_requests")),
    }
    if summary["gemini"]["wire_tokens_before"] is not None and summary["gemini"]["wire_tokens_saved"] is not None:
        summary["gemini"]["wire_compression_pct"] = (
            summary["gemini"]["wire_tokens_saved"] / summary["gemini"]["wire_tokens_before"] * 100.0
            if summary["gemini"]["wire_tokens_before"] else 0.0
        )
    else:
        summary["gemini"]["wire_compression_pct"] = None
    for key in summary:
        if key not in ("mode", "primary_model", "uncompressed_requests", "gemini"):
            summary[key] = number(summary[key])
    agents = []
    rows = mapping(data.get("agent_usage")).get("agents", [])
    for row in rows[:128] if isinstance(rows, list) else []:
        if not isinstance(row, dict) or text(row.get("agent")) is None:
            continue
        agents.append({"agent": text(row.get("agent")), "label": text(row.get("label"), label=True),
            **{key: number(row.get(key)) for key in ("requests", "before_tokens", "after_tokens", "tokens_saved", "savings_percent")},
            "models": counts(row.get("models")), "providers": counts(row.get("providers"))})
    return summary, agents


class SnapshotStore:
    def __init__(self, fetch=fetch_fixed, clock=time.monotonic):
        self.fetch = fetch
        self.clock = clock
        self.history = []
        self.cached = None
        self.expires_at = 0.0
        self.lock = threading.Lock()
        self.previous_counters = {}

    def snapshot(self):
        with self.lock:
            if self.cached is None or self.clock() >= self.expires_at:
                self.cached = self._sample()
                self.expires_at = self.clock() + 5.0
            return copy.deepcopy(self.cached)

    def _sample(self):
        sampled_at = datetime.now(timezone.utc).isoformat()
        try:
            self.fetch(LIVE_URL)
            raw = self.fetch(STATS_URL)
        except Exception:
            return {"available": False, "sampled_at": sampled_at, "scope": "proxy",
                "summary": {}, "agents": [], "history": list(self.history),
                "error": "Headroom unavailable"}
        try:
            summary, agents = normalize(json.loads(raw))
        except (ValueError, TypeError, KeyError, RecursionError):
            return {"available": False, "sampled_at": sampled_at, "scope": "proxy",
                "summary": {}, "agents": [], "history": list(self.history),
                "error": "Invalid Headroom stats"}
        counters = {key: summary[key] for key in ("api_requests", "tokens_before", "tokens_saved",
            "requests_compressed", "tool_schema_tokens_saved", "codex_ws_tokens_saved")
            if summary[key] is not None}
        if any(value < self.previous_counters[key] for key, value in counters.items()
               if key in self.previous_counters):
            self.history.clear()
            # A confirmed reset starts a new epoch; absent counters from the
            # old epoch must not cause a second reset when they return.
            self.previous_counters.clear()
        # Preserve last known values across optional-metric gaps in this epoch.
        self.previous_counters.update(counters)
        self.history.append({"sampled_at": sampled_at, **{k: summary[k] for k in
            ("api_requests", "tokens_before", "tokens_saved", "compression_pct_overall")}})
        self.history[:] = self.history[-120:]
        return {"available": True, "sampled_at": sampled_at, "scope": "proxy",
            "summary": summary, "agents": agents, "history": list(self.history)}


store = SnapshotStore()
router = APIRouter()


@router.get("/snapshot")
def snapshot():
    """Sync handler is run by FastAPI off the event loop; no caller parameters."""
    return store.snapshot()

