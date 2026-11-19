import base64
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import random
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import generate
import lab
from test_generate import contrast


class Specimens(unittest.TestCase):
    def setUp(self):
        self.p = generate.palette("kiahgawa")
        self.fixtures = json.loads(lab.FIXTURES.read_text())

    def test_fixtures_reference_known_palette_roles(self):
        keys = generate.derived(self.p)
        for sample in self.fixtures["code"]:
            self.assertTrue(sample["lines"])
            for line in sample["lines"]:
                for role, text in line:
                    self.assertIn(role, keys)
                    self.assertIsInstance(text, str)
        for line in self.fixtures["diff"]:
            self.assertIn(line["kind"], ("hunk", "context", "added", "removed"))
            if "highlight" in line:
                self.assertIn(line["highlight"], line["text"])
        for group in ("commands", "jobs"):
            for item in self.fixtures[group]:
                self.assertIn(item["role"], keys)
        for role, _ in self.fixtures["logs"]:
            self.assertIn(role, keys)

    def test_terminal_pages_render_in_color_and_plain_text(self):
        for width in (20, 80, 120):
            for page in range(len(lab.Terminal.pages)):
                with self.subTest(width=width, page=page):
                    plain = lab.Terminal(self.p, self.fixtures, width, False).render(page)
                    colored = lab.Terminal(self.p, self.fixtures, width, True).render(page)
                    strip = lambda line: re.sub(r"\x1b\[[0-9;]*m", "", line)
                    self.assertEqual(plain, list(map(strip, colored)))
                    self.assertTrue(all(len(line) <= width for line in plain))
                    self.assertNotIn("\x1b", "\n".join(plain))
                    self.assertIn("\x1b[", "\n".join(colored))

    def test_terminal_plain_cli(self):
        result = subprocess.run([sys.executable, str(ROOT / "scripts/lab.py"), "--theme", "kiahgawa", "--once", "--plain", "--page", "3"], capture_output=True, text=True, check=True)
        self.assertIn("trails.ts", result.stdout)
        self.assertNotIn("\x1b", result.stdout)

    @unittest.skipUnless(shutil.which("node"), "Node is optional; used only to cross-check browser math")
    def test_browser_colors_match_generator_and_contrast_tests(self):
        rng = random.Random(42)
        palettes = [self.p] + [{key: (self.p[key] if key in ("name", "mode") else f"#{rng.randrange(0x1000000):06x}") for key in self.p} for _ in range(12)]
        source = base64.b64encode((ROOT / "lab/color.js").read_bytes()).decode()
        code = f"""import {{derived, contrast, mix, validatePalette}} from 'data:text/javascript;base64,{source}';
        let input = ''; for await (const chunk of process.stdin) input += chunk;
        const palettes = JSON.parse(input);
        for (const p of palettes) validatePalette(p, Object.keys(palettes[0]), 'kiahgawa');
        let rejected = 0;
        for (const p of [null, [], {{}}, {{...palettes[0], red: 'red'}}, {{...palettes[0], extra: '#ffffff'}}, {{...palettes[0], mode: 'dim'}}]) {{
          try {{ validatePalette(p, Object.keys(palettes[0]), 'kiahgawa'); }} catch {{ rejected++; }}
        }}
        console.log(JSON.stringify({{derived: palettes.map(derived),
          contrast: palettes.map(p => contrast(p.foreground, p.panel)),
          half: mix('#000000', '#010305', .5), rejected}}));"""
        result = subprocess.run(["node", "--input-type=module", "-e", code], input=json.dumps(palettes), capture_output=True, text=True, check=True)
        actual = json.loads(result.stdout)
        self.assertEqual(actual["derived"], [generate.derived(p) for p in palettes])
        self.assertEqual(actual["half"], generate.mix("#000000", "#010305", .5))
        self.assertEqual(actual["rejected"], 6)
        for p, ratio in zip(palettes, actual["contrast"]):
            self.assertAlmostEqual(ratio, contrast(p["foreground"], p["panel"]))


class LabServer(unittest.TestCase):
    """Every write test runs in temporary directories, never the user's palette or themes."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name in ["kiahgawa/palette.json", "lab/fixtures.json", "lab/index.html", "lab/lab.js", "lab/color.js", "lab/views.js", "lab/lab.css"]:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, path)
        self.store = self.root / "store"
        for target, value in (("generate.ROOT", self.root), ("generate.store", lambda: self.store), ("lab.ROOT", self.root),
                              ("lab.FIXTURES", self.root / "lab/fixtures.json"), ("lab.THEME", "kiahgawa")):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), lab.BaseHTTPRequestHandler)
        self.port = self.server.server_port
        self.server.RequestHandlerClass = lab.make_handler("test-token", self.port, threading.Lock())
        # Expected rejection tests don't need to write access logs.
        self.server.RequestHandlerClass.log_message = lambda *args: None
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method="GET", path="/api/state", body=None, headers=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.request(method, path, body, headers or {})
            response = connection.getresponse()
            return response.status, response.read(), dict(response.getheaders())
        finally:
            connection.close()

    def post(self, payload, headers=None):
        return self.request("POST", "/api/save", json.dumps(payload), headers or {
            "Content-Type": "application/json", "Authorization": "Bearer test-token"})

    def test_static_allowlist_and_consistent_state(self):
        status, body, headers = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), lab.state())
        self.assertEqual(headers["Cache-Control"], "no-store")
        status, body, headers = self.request(path="/")
        self.assertEqual(status, 200)
        self.assertIn(b"test-token", body)
        self.assertNotIn(b"__LAB_TOKEN__", body)
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        for path in ("/lab.js", "/lab.css", "/color.js", "/views.js"):
            self.assertEqual(self.request(path=path)[0], 200)
        for path in ("/../kiahgawa/palette.json", "/scripts/lab.py", "/.git/config"):
            self.assertEqual(self.request(path=path)[0], 404)

    def test_save_writes_the_palette_and_rebuilds_its_files(self):
        before = lab.state()
        candidate = {**before["palette"], "green": "#aabb99"}
        status, body, _ = self.post({"palette": candidate, "revision": before["revision"]})
        self.assertEqual(status, 200)
        after = json.loads(body)
        self.assertEqual(after["palette"], candidate)
        self.assertNotEqual(after["revision"], before["revision"])
        self.assertEqual(json.loads((self.root / "kiahgawa/palette.json").read_text()), candidate)
        for name, text in generate.outputs(candidate).items():
            self.assertEqual((self.store / "kiahgawa" / name).read_text(), text)

    def test_live_preview_is_validated_and_never_writes_files(self):
        before = lab.state()
        candidate = {**before["palette"], "green": "#aabb99"}
        headers = {"Content-Type": "application/json", "Authorization": "Bearer test-token"}
        self.assertEqual(self.request(path="/api/preview")[0], 200)
        self.assertEqual(self.request("POST", "/api/preview", json.dumps({"palette": candidate}), headers)[0], 200)
        self.assertEqual(json.loads(self.request(path="/api/preview")[1])["palette"], candidate)
        self.assertEqual(lab.state(), before)
        self.assertEqual(self.request("POST", "/api/preview", json.dumps({"palette": {}}), headers)[0], 422)
        self.assertEqual(self.request("POST", "/api/preview", json.dumps({"palette": candidate}))[0], 403)
        self.assertEqual(json.loads(self.request(path="/api/preview")[1])["palette"], candidate)

    def test_invalid_palettes_and_conflicts_do_not_write(self):
        before = lab.state()
        for candidate in (None, [], {**before["palette"], "green": "invalid"}, {**before["palette"], "unexpected": "#000000"}):
            self.assertEqual(self.post({"palette": candidate, "revision": before["revision"]})[0], 422)
            self.assertEqual(lab.state(), before)
        self.assertEqual(self.post({"palette": before["palette"], "revision": "old"})[0], 409)
        self.assertEqual(lab.state(), before)

    def test_untrusted_requests_do_not_write(self):
        before = lab.state()
        payload = {"palette": before["palette"], "revision": before["revision"]}
        for headers in ({"Content-Type": "application/json"},
                        {"Content-Type": "application/json", "Authorization": "Bearer test-token", "Origin": "https://example.com"},
                        {"Content-Type": "application/json", "Authorization": "Bearer test-token", "Host": f"untrusted.example:{self.port}"}):
            self.assertEqual(self.post(payload, headers)[0], 403)
        self.assertEqual(self.request(headers={"Host": "untrusted.example"})[0], 403)
        self.assertEqual(lab.state(), before)


if __name__ == "__main__":
    unittest.main()
