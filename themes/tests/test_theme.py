import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import generate
import theme


class Switching(unittest.TestCase):
    """Runs against temporary XDG directories, recording commands instead of running them."""

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.home = Path(temporary.name)
        environment = {f"XDG_{kind}_HOME": str(self.home / kind.lower()) for kind in ("DATA", "STATE", "CONFIG")}
        patcher = patch.dict(os.environ, environment)
        patcher.start()
        self.addCleanup(patcher.stop)
        (self.home / "config/opencode/themes").mkdir(parents=True)
        self.commands = []
        self.defaults = {"AppleInterfaceStyle": "Dark"}
        self.clients = [{"client_id": "client:app", "info": {"kind": "app", "label": "Laptop"}},
                        {"client_id": "client:cli", "info": {"kind": "cli"}}]
        for target, value in (("theme.run", self.fake_run), ("theme.start", self.fake_run),
                              ("theme.shutil.which", lambda name: f"/bin/{name}"),
                              ("theme.Path.home", lambda: self.home)):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def fake_run(self, *command, timeout=30):
        self.commands.append(command)
        if command[:3] == ("defaults", "read", "-g"):
            if command[3] not in self.defaults:
                raise subprocess.CalledProcessError(1, command)
            return self.defaults[command[3]] + "\n"
        if command[:3] == ("defaults", "write", "-g"):
            self.defaults[command[3]] = command[4]
        if command[:3] == ("rex", "client", "ls"):
            return json.dumps({"clients": self.clients})
        return ""

    def theme(self, *args):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = theme.main(list(args))
        return status, output.getvalue()

    def test_set_links_current_and_applies_every_app(self):
        status, output = self.theme("set", "kiahgawa")
        self.assertEqual(status, 0, output)
        store = self.home / "data/themes"
        self.assertEqual(os.readlink(store / "current"), "kiahgawa")
        self.assertEqual(theme.current(), "kiahgawa")
        self.assertEqual(json.loads((store / "current/palette.json").read_text())["name"], "kiahgawa")
        # OpenCode gets a file for every theme and switches by name.
        for name in generate.names():
            link = self.home / f"config/opencode/themes/{name}.json"
            self.assertEqual(os.readlink(link), str(store / name / "opencode.json"))
            self.assertTrue(link.exists())
        self.assertEqual(json.loads((self.home / "config/opencode/cli.json").read_text())["theme"]["name"], "kiahgawa")
        self.assertIn("restart OpenCode once", output)
        # Already dark, so macOS isn't asked to change.
        self.assertFalse(any(command[0] == "osascript" and "-l" not in command for command in self.commands))
        wallpaper = next(command for command in self.commands if command[:3] == ("osascript", "-l", "JavaScript")
                         and Path(command[-1]).suffix in theme.WALLPAPER_TYPES)
        self.assertEqual(wallpaper[-1], str(theme.wallpapers("kiahgawa")[0]))
        self.assertIn(("rex", "-C", "client:app", "do", "client.theme.import",
                       f"path={store}/kiahgawa/rex/kiahgawa"), self.commands)
        self.assertFalse(any("client:cli" in command for command in self.commands))
        self.assertIn("✓ Rex        Laptop", output)

    def test_xcode_gets_one_current_theme_rewritten_in_place(self):
        status, output = self.theme("set", "kiahgawa", "--only", "xcode")
        self.assertIn("– Xcode      Xcode isn't set up", output)
        themes = self.home / "Library/Developer/Xcode/UserData/FontAndColorThemes"
        themes.parent.mkdir(parents=True)
        self.theme("set", "kiahgawa", "--only", "xcode")
        current = themes / "Current.xcworkspacecolortheme"
        self.assertEqual(json.loads(current.read_text()), generate.xcode(generate.palette("kiahgawa")))
        self.assertEqual([path.name for path in themes.iterdir()], [current.name])

    def test_opencode_switches_by_name_and_keeps_other_settings(self):
        cli = self.home / "config/opencode/cli.json"
        cli.write_text(json.dumps({"$schema": "x", "theme": {"name": "other", "mode": "dark"}, "animations": True}))
        stale = self.home / "config/opencode/themes/removed.json"
        stale.symlink_to(self.home / "data/themes/removed/opencode.json")
        kept = self.home / "config/opencode/themes/mine.json"
        kept.write_text("{}")
        status, output = self.theme("set", "kiahgawa", "--only", "opencode")
        self.assertEqual(json.loads(cli.read_text()), {"$schema": "x", "theme": {"name": "kiahgawa", "mode": "dark"}, "animations": True})
        self.assertFalse(stale.is_symlink())
        self.assertTrue(kept.exists())
        # Already installed: no restart needed, and cli.json isn't rewritten.
        before = cli.stat().st_mtime_ns
        status, output = self.theme("set", "kiahgawa", "--only", "opencode")
        self.assertEqual(output.splitlines()[-1].strip(), "✓ OpenCode   theme \"kiahgawa\"")
        self.assertEqual(cli.stat().st_mtime_ns, before)

    def test_btop_uses_the_current_theme_and_reloads(self):
        status, output = self.theme("set", "kiahgawa", "--only", "btop")
        self.assertIn("– btop       btop hasn't been run yet", output)
        conf = self.home / "config/btop/btop.conf"
        conf.parent.mkdir(parents=True)
        conf.write_text('color_theme = "Default"\ntheme_background = True\ntruecolor = True\n')
        self.theme("set", "kiahgawa", "--only", "btop")
        link = self.home / "config/btop/themes/current.theme"
        self.assertEqual(os.readlink(link), f"{self.home}/data/themes/current/btop.theme")
        self.assertEqual(conf.read_text(), f'color_theme = "{link}"\n'
                         "theme_background = False\ntruecolor = True\n")
        self.assertEqual(self.commands[-1], ("pkill", "-USR2", "-x", "btop"))
        self.assertIn('theme[hi_fg]="', (self.home / "data/themes/current/btop.theme").read_text())

    def test_macos_appearance_follows_the_theme_mode(self):
        del self.defaults["AppleInterfaceStyle"]
        self.theme("set", "kiahgawa", "--only", "macos")
        self.assertTrue(any("set dark mode to true" in command[-1] for command in self.commands))

    def test_highlight_follows_the_accent_and_apps_are_told(self):
        self.theme("set", "merino-light", "--only", "macos")
        self.assertTrue(self.defaults["AppleHighlightColor"].endswith(" Other"))
        self.assertIn("AppleColorPreferencesChangedNotification", self.commands[-1][-1])
        self.commands.clear()
        self.theme("set", "merino-light", "--only", "macos")
        self.assertFalse(any("AppleColorPreferencesChangedNotification" in command[-1] for command in self.commands))

    def test_folders_take_the_accent_and_finder_restarts_only_on_change(self):
        self.defaults.update(AppleIconAppearanceTintColor="Other", AppleIconAppearanceCustomTintColor="1.000000 0.578929 0.475000 0.872961")
        self.theme("set", "merino-light", "--only", "folders")
        self.assertEqual(self.defaults["AppleIconAppearanceCustomTintColor"], "0.035294 0.411765 0.854902 0.872961")
        self.assertEqual(self.commands[-1], ("killall", "Finder"))
        backup = (self.home / "state/theme/icon-tint-before-theme.txt").read_text()
        self.assertIn("AppleIconAppearanceCustomTintColor=1.000000 0.578929 0.475000 0.872961", backup)
        self.commands.clear()
        status, output = self.theme("set", "merino-light", "--only", "folders")
        self.assertNotIn(("killall", "Finder"), self.commands)
        self.assertIn("already tinted", output)

    def test_missing_apps_are_skipped_without_failing(self):
        self.clients = []
        status, output = self.theme("set", "kiahgawa", "--only", "rex")
        self.assertEqual(status, 0)
        self.assertIn("– Rex        no Rex app is connected", output)

    def test_failures_are_reported_and_other_apps_still_apply(self):
        def failing(*command, timeout=30):
            if command[0] == "osascript":
                raise subprocess.CalledProcessError(1, command, stderr="Not authorized")
            return self.fake_run(*command)

        with patch("theme.run", failing), patch("theme.start", failing):
            status, output = self.theme("set", "kiahgawa", "--skip", "macos")
        self.assertEqual(status, 1)
        self.assertIn("✗ Wallpaper  Not authorized", output)
        self.assertIn("✓ OpenCode", output)

    def test_wallpaper_choice_is_remembered_per_theme(self):
        self.theme("set", "kiahgawa", "--only", "opencode")
        files = theme.wallpapers("kiahgawa")
        self.theme("wallpaper", "next")
        self.assertEqual(theme.load_state()["wallpapers"]["kiahgawa"], files[1].name)
        self.assertEqual(self.commands[-1][-1], str(files[1]))
        self.theme("wallpaper", files[-1].stem)
        self.theme("wallpaper", "next")
        self.assertEqual(theme.load_state()["wallpapers"]["kiahgawa"], files[0].name)
        status, output = self.theme("wallpaper")
        self.assertIn(f"* {files[0].name}", output)

    def test_each_switch_to_a_theme_shows_its_next_wallpaper(self):
        files = theme.wallpapers("kiahgawa")
        shown = []
        for _ in range(len(files) + 1):
            self.theme("set", "kiahgawa", "--only", "wallpaper")
            shown.append(self.commands[-1][-1])
        self.assertEqual(shown, [str(path) for path in files + files[:1]])
        # Reapplying keeps the wallpaper, and other apps alone don't advance it.
        self.theme("apply")
        self.theme("set", "kiahgawa", "--only", "rex")
        self.assertEqual(theme.load_state()["wallpapers"]["kiahgawa"], files[0].name)

    def test_the_first_wallpaper_change_backs_up_macos_settings(self):
        index = self.home / "Library/Application Support/com.apple.wallpaper/Store/Index.plist"
        index.parent.mkdir(parents=True)
        index.write_text("original")
        self.theme("set", "kiahgawa", "--only", "wallpaper")
        index.write_text("changed")
        self.theme("set", "kiahgawa", "--only", "wallpaper")
        self.assertEqual((self.home / "state/theme/wallpaper-before-theme.plist").read_text(), "original")

    def test_next_and_prev_cycle_through_every_theme(self):
        themes = generate.names()
        self.assertEqual(theme.step(themes[-1], 1), themes[0])
        self.assertEqual(theme.step(themes[0], -1), themes[-1])
        self.assertEqual(theme.step(None, 1), themes[0])

    def test_set_without_a_name_picks_with_fzf(self):
        picked = []

        def fzf(command, **kwargs):
            picked.append((command, kwargs["input"]))
            return subprocess.CompletedProcess(command, 0, stdout="rose-pine\tdark\t12 wallpapers\n")

        with patch("theme.subprocess.run", fzf):
            status, output = self.theme("set", "--only", "opencode")
        command, rows = picked[0]
        self.assertEqual(command[0], "fzf")
        self.assertIn("swatches {1}", " ".join(command))
        self.assertEqual(sorted(row.split("\t")[0] for row in rows.splitlines()), generate.names())
        self.assertEqual(theme.current(), "rose-pine")

    def test_escaping_fzf_leaves_the_theme_alone(self):
        self.theme("set", "kiahgawa", "--only", "opencode")
        with patch("theme.subprocess.run", lambda command, **kwargs: subprocess.CompletedProcess(command, 130, stdout="")):
            with self.assertRaises(SystemExit) as exit:
                self.theme("set")
        self.assertEqual(exit.exception.code, 0)
        self.assertEqual(theme.current(), "kiahgawa")

    def test_swatches_show_every_theme_in_true_color(self):
        for name in generate.names():
            text = theme.swatches(name)
            self.assertIn(name, text)
            self.assertIn("\033[38;2;", text)

    def test_list_marks_the_current_theme(self):
        self.theme("set", "kiahgawa", "--only", "opencode")
        status, output = self.theme()
        self.assertIn("* kiahgawa", output)


if __name__ == "__main__":
    unittest.main()
