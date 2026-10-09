"""Read-only backend contract tests; stdlib unittest, no pytest needed."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "dashboard" / "plugin_api.py"

def load():
    assert API.exists(), "GET /snapshot backend is not implemented"
    spec = importlib.util.spec_from_file_location("headroom_monitor_test_api", API)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stats(requests=8, before=1000, saved=200):
    return {
        "summary": {
            "mode": "cache", "primary_model": "gpt-6.1-sol", "api_requests": requests,
            "compression": {"requests_compressed": 3, "avg_compression_pct": 20.0,
                "best_compression_pct": 45.0, "total_tokens_before": before,
                "total_tokens_removed": saved, "tool_schema_tokens_saved": 7},
            "codex_ws": {"tokens_saved": 999},
            "cost": {"without_headroom_usd": 1.0, "with_headroom_usd": 0.8,
                "total_saved_usd": 0.2, "savings_pct": 20.0,
                "provider_cache_discount_usd": 0.4},
            "uncompressed_requests": {"prefix_frozen": 5}},
        "tokens": {"input": before - saved, "proxy_savings_percent": 20.0},
        "agent_usage": {"agents": [{"agent": "codex", "label": "Codex",
            "requests": 7, "before_tokens": 5000, "after_tokens": 2000,
            "tokens_saved": 3000, "savings_percent": 60.0,
            "models": {"gpt-6.1-sol": 7}, "providers": {"openai": 7}}]}}

class BackendTests(unittest.TestCase):
    def test_deferral_saved_tokens_match_before_denominator(self):
        api = load()
        data = stats()
        data["summary"]["compression"]["total_tokens_saved_all_layers"] = 207
        data["tokens"]["input"] = 793
        result = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(data).encode()).snapshot()
        self.assertEqual(result["summary"]["tokens_saved"], 207)
        self.assertEqual(result["summary"]["tokens_after"], 793)
        self.assertEqual(result["summary"]["compression_pct_overall"], 20.7)
        self.assertEqual(result["summary"]["tool_schema_tokens_saved"], 7)
        self.assertEqual(result["summary"]["codex_ws_tokens_saved"], 999)
        data["tokens"]["input"] = "invalid"
        fallback = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(data).encode()).snapshot()
        self.assertEqual(fallback["summary"]["tokens_after"], 793)

    def test_counter_gaps_preserve_baselines_within_epoch(self):
        cases = [
            ("compression", "requests_compressed"),
            ("compression", "tool_schema_tokens_saved"),
            ("codex_ws", "tokens_saved"),
        ]
        for section, key in cases:
            for missing in (None, "invalid"):
                with self.subTest(section=section, key=key, missing=missing):
                    api = load()
                    now = [0.0]
                    current = stats()
                    original = current["summary"][section][key]
                    store = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(current).encode(), clock=lambda: now[0])
                    store.snapshot()
                    current["summary"][section][key] = missing
                    now[0] += 5.1
                    self.assertEqual(len(store.snapshot()["history"]), 2)
                    current["summary"][section][key] = original + 1
                    now[0] += 5.1
                    self.assertEqual(len(store.snapshot()["history"]), 3)
                    current["summary"][section][key] = original - 1
                    now[0] += 5.1
                    self.assertEqual(len(store.snapshot()["history"]), 1)

    def test_detected_reset_rebases_absent_optional_counters(self):
        api = load()
        now = [0.0]
        current = [stats()]
        store = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(current[0]).encode(), clock=lambda: now[0])
        store.snapshot()
        current[0] = stats(requests=1, before=100, saved=20)
        current[0]["summary"]["codex_ws"] = None
        now[0] += 5.1
        self.assertEqual(len(store.snapshot()["history"]), 1)
        current[0]["summary"]["codex_ws"] = {"tokens_saved": 1}
        now[0] += 5.1
        self.assertEqual(len(store.snapshot()["history"]), 2)

    def test_auxiliary_counter_reset_also_clears_history(self):
        api = load()
        now = [0.0]
        current = [stats()]
        store = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(current[0]).encode(), clock=lambda: now[0])
        store.snapshot()
        now[0] += 5.1
        self.assertEqual(len(store.snapshot()["history"]), 2)
        current[0]["summary"]["codex_ws"]["tokens_saved"] = 1
        now[0] += 5.1
        self.assertEqual(len(store.snapshot()["history"]), 1)

    def test_missing_counter_gap_still_clears_history_on_subsequent_drop(self):
        api = load()
        now = [0.0]
        current = [stats()]
        store = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(current[0]).encode(), clock=lambda: now[0])
        store.snapshot()
        now[0] += 5.1
        current[0]["summary"]["codex_ws"] = None
        self.assertEqual(len(store.snapshot()["history"]), 2)
        now[0] += 5.1
        current[0]["summary"]["codex_ws"] = {"tokens_saved": 500}
        self.assertEqual(len(store.snapshot()["history"]), 1)

    def test_package_registration_does_not_register_tools_or_hooks(self):
        from unittest.mock import MagicMock
        init = ROOT / "__init__.py"
        self.assertTrue(init.exists(), "unified Python package missing")
        spec = importlib.util.spec_from_file_location("headroom_monitor_package_test", init)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        ctx = MagicMock()
        module.register(ctx)
        self.assertEqual(ctx.mock_calls, [])
        manifest = (ROOT / "plugin.yaml").read_text()
        self.assertIn("name: headroom-monitor", manifest)
        self.assertIn("kind: standalone", manifest)
        self.assertNotIn("provides_tools", manifest)

    def test_secret_shaped_identifiers_are_rejected(self):
        api = load()
        data = stats()
        data["summary"]["primary_model"] = "sk-proj-SECRETKEY"
        data["agent_usage"]["agents"][0]["models"]["sk-ant-SECRETKEY"] = 1
        data["agent_usage"]["agents"][0]["providers"]["Authorization"] = 2
        data["agent_usage"]["agents"][0]["label"] = "Bearer SECRETKEY"
        result = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(data).encode()).snapshot()
        self.assertNotIn("SECRETKEY", json.dumps(result))
        self.assertNotIn("Authorization", json.dumps(result))

    def test_malformed_optional_metrics_are_null_not_zero_or_reconciled(self):
        api = load()
        data = stats()
        data["tokens"] = None
        data["summary"]["codex_ws"] = []
        data["summary"]["cost"] = {"without_headroom_usd": float("inf"), "with_headroom_usd": -1,
            "breakdown": {"compression_savings_usd": 0.125}, "provider_cache_discount_usd": 0.5}
        data["summary"]["compression"]["avg_compression_pct"] = 10 ** 1000
        data["agent_usage"]["agents"] += [None, {}, {"agent": "valid", "models": [], "providers": None}]
        result = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(data).encode()).snapshot()
        self.assertTrue(result["available"])
        self.assertEqual(result["summary"]["tokens_after"], 800)
        self.assertEqual(result["summary"]["compression_pct_overall"], 20.0)
        self.assertIsNone(result["summary"]["cost_without_usd"])
        self.assertIsNone(result["summary"]["cost_with_usd"])
        self.assertIsNone(result["summary"]["avg_compression_pct"])
        self.assertEqual(result["summary"]["compression_saved_usd"], 0.125)
        self.assertEqual(result["summary"]["provider_cache_discount_usd"], 0.5)
        self.assertEqual(len(result["agents"]), 2)
        self.assertEqual(result["agents"][1]["models"], {})

    def test_fixed_transport_blocks_other_urls_redirects_and_large_bodies(self):
        from unittest.mock import patch, MagicMock
        api = load()
        connection = MagicMock()
        connection.getresponse.return_value.status = 200
        connection.getresponse.return_value.read1.side_effect = [b"{}", b""]
        with patch.object(api, "HTTPConnection", return_value=connection) as constructor:
            self.assertEqual(api.fetch_fixed(api.STATS_URL), b"{}")
            constructor.assert_called_once_with("127.0.0.1", 8787, timeout=2.0)
            connection.request.assert_called_once_with("GET", "/stats", headers={"Accept": "application/json"})
            connection.close.assert_called_once()
        with patch.object(api, "HTTPConnection") as constructor:
            for url in ("https://evil.invalid", "http://127.0.0.1:8787/reset", "http://127.0.0.1:8787/stats?url=x"):
                with self.assertRaises(ValueError):
                    api.fetch_fixed(url)
            constructor.assert_not_called()
        for status in (301, 302, 401, 500):
            connection = MagicMock()
            connection.getresponse.return_value.status = status
            with patch.object(api, "HTTPConnection", return_value=connection):
                with self.assertRaises(OSError):
                    api.fetch_fixed(api.LIVE_URL)
                connection.close.assert_called_once()
        connection = MagicMock()
        connection.getresponse.return_value.status = 200
        connection.getresponse.return_value.read1.return_value = b"x" * 65536
        with patch.object(api, "HTTPConnection", return_value=connection):
            with self.assertRaises(ValueError):
                api.fetch_fixed(api.STATS_URL)
            connection.close.assert_called_once()

    def test_router_is_get_only_and_query_cannot_change_destination(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        api = load()
        calls = []
        def fetch(url):
            calls.append(url)
            return b"OK" if url.endswith("/livez") else json.dumps(stats()).encode()
        api.store = api.SnapshotStore(fetch=fetch)
        app = FastAPI()
        app.include_router(api.router, prefix="/api/plugins/headroom-monitor")
        with TestClient(app) as client:
            path = "/api/plugins/headroom-monitor/snapshot"
            response = client.get(path + "?url=http://evil.invalid&profile=other")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["scope"], "proxy")
            for method in ("POST", "PUT", "PATCH", "DELETE"):
                self.assertEqual(client.request(method, path).status_code, 405)
            self.assertEqual(client.get("/api/plugins/headroom-monitor/reset").status_code, 404)
        self.assertEqual(calls, [api.LIVE_URL, api.STATS_URL])
        self.assertEqual([(route.path, route.methods) for route in api.router.routes], [("/snapshot", {"GET"})])

    def test_concurrent_requests_sample_once(self):
        import concurrent.futures
        import threading
        import time
        api = load()
        barrier = threading.Barrier(12)
        calls = []
        def fetch(url):
            calls.append(url)
            time.sleep(0.01)
            return b"OK" if url.endswith("/livez") else json.dumps(stats()).encode()
        store = api.SnapshotStore(fetch=fetch)
        def request(_):
            barrier.wait(timeout=2)
            return store.snapshot()
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(request, range(12)))
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(len(results[0]["history"]), 1)

    def test_history_is_bounded_and_counter_resets_clear_old_samples(self):
        api = load()
        now = [0.0]
        current = [stats()]
        store = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(current[0]).encode(), clock=lambda: now[0])
        for i in range(125):
            now[0] += 5.1
            result = store.snapshot()
        self.assertEqual(len(result["history"]), 120)
        for request, before, saved in ((7, 1000, 200), (7, 999, 200), (7, 999, 199)):
            current[0] = stats(request, before, saved)
            now[0] += 5.1
            result = store.snapshot()
            self.assertEqual(len(result["history"]), 1)
        self.assertEqual(set(result["history"][0]), {"sampled_at", "api_requests", "tokens_before", "tokens_saved", "compression_pct_overall"})

    def test_cache_five_seconds_including_failures_and_defensive_copies(self):
        api = load()
        now = [0.0]
        calls = []
        def fetch(url):
            calls.append(url)
            return b"OK" if url.endswith("/livez") else json.dumps(stats()).encode()
        store = api.SnapshotStore(fetch=fetch, clock=lambda: now[0])
        first = store.snapshot()
        first["summary"]["tokens_saved"] = 999999
        first["history"].clear()
        now[0] = 4.999
        cached = store.snapshot()
        self.assertEqual(cached["summary"]["tokens_saved"], 200)
        self.assertEqual(len(cached["history"]), 1)
        self.assertEqual(len(calls), 2)
        now[0] = 5.0
        self.assertEqual(len(store.snapshot()["history"]), 2)
        self.assertEqual(len(calls), 4)
        failing_calls = []
        def fail(url):
            failing_calls.append(url)
            raise OSError("offline")
        failing = api.SnapshotStore(fetch=fail, clock=lambda: now[0])
        failing.snapshot()
        failing.snapshot()
        self.assertEqual(len(failing_calls), 1)

    def test_only_allowlisted_typed_metrics_leave_backend(self):
        api = load()
        data = stats()
        data["summary"]["prompt"] = "SECRET_PROMPT"
        data["summary"]["mode"] = {"Authorization": "SECRET"}
        data["summary"]["primary_model"] = "Bearer SECRET KEY\n"
        data["summary"]["compression"]["avg_compression_pct"] = float("nan")
        data["summary"]["cost"]["with_headroom_usd"] = True
        data["summary"]["uncompressed_requests"]["SECRET_PROMPT"] = 9
        data["agent_usage"]["agents"][0]["headers"] = "SECRET_HEADERS"
        data["agent_usage"]["agents"][0]["label"] = "<script>SECRET</script>"
        data["agent_usage"]["agents"][0]["models"]["Authorization: SECRET"] = 1
        result = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(data).encode()).snapshot()
        encoded = json.dumps(result, allow_nan=False)
        self.assertNotIn("SECRET", encoded)
        self.assertIsNone(result["summary"]["mode"])
        self.assertIsNone(result["summary"]["primary_model"])
        self.assertIsNone(result["summary"]["avg_compression_pct"])
        self.assertIsNone(result["summary"]["cost_with_usd"])
        self.assertEqual(set(result["agents"][0]), {"agent", "label", "requests", "before_tokens", "after_tokens", "tokens_saved", "savings_percent", "models", "providers"})

    def test_invalid_stats_fail_closed_without_upstream_content(self):
        api = load()
        for payload in (b"SUPERSECRET", b"[]", b"{}", b'{"summary":{"api_requests":true}}', b"[" * 20000 + b"]" * 20000):
            with self.subTest(payload=payload):
                result = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else payload).snapshot()
                self.assertFalse(result["available"])
                self.assertEqual(result["error"], "Invalid Headroom stats")
                self.assertNotIn("SUPERSECRET", json.dumps(result))

    def test_unavailable_is_safe_and_has_no_exception_details(self):
        api = load()
        def fetch(url):
            raise OSError("Authorization: Bearer SUPERSECRET")
        result = api.SnapshotStore(fetch=fetch).snapshot()
        self.assertFalse(result["available"])
        self.assertEqual(result["summary"], {})
        self.assertEqual(result["agents"], [])
        self.assertEqual(result["history"], [])
        self.assertNotIn("SUPERSECRET", json.dumps(result))
        self.assertEqual(result["error"], "Headroom unavailable")

    def test_gemini_partial_and_untrusted_metrics_are_safe(self):
        api = load()
        for block in [None, [], {}, {"enabled": "true"},
                      {"enabled": True, "wire_tokens_before": 100, "wire_tokens_after": 50},
                      {"enabled": True, "wire_tokens_before": 100, "wire_tokens_saved": -1},
                      {"enabled": True, "wire_tokens_before": 100, "wire_tokens_saved": float("inf")}]:
            with self.subTest(block=block):
                data = stats()
                data["gemini_compression"] = block
                result = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(data).encode()).snapshot()
                self.assertTrue(result["available"])
                self.assertIsNone(result["summary"]["gemini"]["wire_compression_pct"])
                self.assertEqual(result["summary"]["tokens_saved"], 200)
        data = stats()
        data["gemini_compression"] = {"enabled": True, "wire_tokens_before": 0, "wire_tokens_saved": 0, "unknown": "SECRET"}
        result = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(data).encode()).snapshot()
        self.assertEqual(result["summary"]["gemini"]["wire_compression_pct"], 0)
        self.assertNotIn("SECRET", json.dumps(result))

    def test_gemini_compression_stats_are_forwarded_when_present(self):
        api = load()
        data = stats()
        data["gemini_compression"] = {
            "enabled": True,
            "patch_version": "1.1.0",
            "requests": 4,
            "wire_tokens_before": 102562,
            "wire_tokens_after": 590,
            "wire_tokens_saved": 101972,
            "ccr_guard_restored_payloads": 0,
            "excluded_payload_bytes": 0,
            "passthrough_requests": 0,
            "no_savings_requests": 0,
        }
        result = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(data).encode()).snapshot()
        g = result["summary"]["gemini"]
        self.assertTrue(g["enabled"])
        self.assertEqual(g["patch_version"], "1.1.0")
        self.assertEqual(g["requests"], 4)
        self.assertEqual(g["wire_tokens_before"], 102562)
        self.assertEqual(g["wire_tokens_after"], 590)
        self.assertEqual(g["wire_tokens_saved"], 101972)
        self.assertEqual(g["wire_compression_pct"], 101972 / 102562 * 100.0)
        self.assertEqual(g["ccr_guard_restored_payloads"], 0)
        self.assertEqual(g["excluded_payload_bytes"], 0)
        self.assertEqual(g["passthrough_requests"], 0)
        self.assertEqual(g["no_savings_requests"], 0)

    def test_gemini_compression_absent_or_disabled_is_safe(self):
        api = load()
        data = stats()
        result = api.SnapshotStore(fetch=lambda url: b"OK" if url.endswith("/livez") else json.dumps(data).encode()).snapshot()
        g = result["summary"]["gemini"]
        self.assertFalse(g["enabled"])
        self.assertIsNone(g["patch_version"])
        self.assertIsNone(g["requests"])
        self.assertIsNone(g["wire_compression_pct"])

    def test_normalized_proxy_snapshot_preserves_separate_counters(self):
        api = load()
        calls = []
        def fetch(url):
            calls.append(url)
            return b"OK" if url.endswith("/livez") else json.dumps(stats()).encode()
        result = api.SnapshotStore(fetch=fetch).snapshot()
        self.assertTrue(result["available"])
        self.assertEqual(result["scope"], "proxy")
        self.assertEqual(calls, ["http://127.0.0.1:8787/livez", "http://127.0.0.1:8787/stats"])
        self.assertEqual(result["summary"]["tokens_saved"], 200)
        self.assertEqual(result["summary"]["codex_ws_tokens_saved"], 999)
        self.assertEqual(result["summary"]["tokens_after"], 800)
        self.assertEqual(result["summary"]["compression_pct_overall"], 20.0)
        self.assertEqual(result["agents"][0]["tokens_saved"], 3000)
        self.assertEqual(len(result["history"]), 1)
        self.assertTrue(result["sampled_at"].endswith("+00:00"))

if __name__ == "__main__":
    unittest.main()
