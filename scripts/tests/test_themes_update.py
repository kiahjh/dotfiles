import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "themes_update", Path(__file__).resolve().parents[1] / "themes-update.py"
)
themes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(themes)
COMMIT = "a" * 40
OPENCODE = '{"base": {}, "dark": {}}\n'
REX = "background = #141313\nforeground = #d5d8d0\npalette = 0=#0d0c0c\n"


class ThemesUpdate(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.lock = self.root / themes.LOCKFILE
        self.lock.parent.mkdir(parents=True)
        self.lock.write_text('{"other.nvim": {"commit": "unchanged"}}\n')

    def download(self, commit, asset):
        self.assertEqual(commit, COMMIT)
        return OPENCODE if asset.endswith(".json") else REX

    def update(self, download=None):
        with patch.object(themes, "latest_commit", return_value=COMMIT), \
             patch.object(themes, "download", side_effect=download or self.download):
            themes.update(self.root)

    def test_downloads_one_revision_and_preserves_other_plugin_pins(self):
        self.update()
        lock = json.loads(self.lock.read_text())
        self.assertEqual(lock["kiahgawa"], {"branch": "main", "commit": COMMIT})
        self.assertEqual(lock["other.nvim"], {"commit": "unchanged"})
        for asset, target in themes.ASSETS.items():
            self.assertEqual((self.root / target).read_text(), self.download(COMMIT, asset))
        self.assertFalse(list(self.root.rglob("*.tmp")))

    def test_download_failure_changes_nothing(self):
        original = self.lock.read_text()

        def fail(commit, asset):
            if not asset.endswith(".json"):
                raise OSError("Network unavailable")
            return OPENCODE

        with self.assertRaises(OSError):
            self.update(fail)
        self.assertEqual(self.lock.read_text(), original)
        for target in themes.ASSETS.values():
            self.assertFalse((self.root / target).exists())

    def test_invalid_assets_change_nothing(self):
        original = self.lock.read_text()
        for invalid in ("<html>error</html>", "{}", "[]"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.update(lambda commit, asset: invalid)
        with self.assertRaises(ValueError):
            self.update(lambda commit, asset: OPENCODE if asset.endswith(".json") else "bad rex")
        self.assertEqual(self.lock.read_text(), original)

    def test_refuses_to_follow_old_submodule_symlinks(self):
        source = self.root / "source.json"
        source.write_text("do not overwrite")
        target = self.root / themes.ASSETS["extras/opencode/kiahgawa.json"]
        target.parent.mkdir(parents=True)
        target.symlink_to(source)
        with self.assertRaisesRegex(ValueError, "symlink"):
            self.update()
        self.assertEqual(source.read_text(), "do not overwrite")
        self.assertNotIn("kiahgawa", json.loads(self.lock.read_text()))

    def test_resolves_main_from_git_remote(self):
        with patch.object(themes.subprocess, "run") as run:
            run.return_value.stdout = f"{COMMIT}\trefs/heads/main\n"
            self.assertEqual(themes.latest_commit(), COMMIT)
            self.assertIn("refs/heads/main", run.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
