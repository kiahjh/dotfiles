import json
from pathlib import Path
import re
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import generate


def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return sum(weight * (c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4)
               for weight, c in zip((.2126, .7152, .0722), channels))


def contrast(a, b):
    low, high = sorted((luminance(a), luminance(b)))
    return (high + .05) / (low + .05)


class Themes(unittest.TestCase):
    """Every theme in themes/*/palette.json gets the same checks."""

    def themes(self):
        for name in generate.names():
            with self.subTest(theme=name):
                yield name, generate.palette(name)

    def test_there_is_at_least_one_theme(self):
        self.assertIn("kiahgawa", generate.names())

    def test_palettes_are_rejected_when_incomplete_or_misnamed(self):
        p = generate.palette("kiahgawa")
        for candidate, name in (
            (None, None), ([], None), ({**p, "red": "red"}, None), ({**p, "extra": "#ffffff"}, None),
            ({**p, "mode": "dim"}, None), ({**p, "name": "Not Valid"}, None), (p, "other"),
            ({**p, "source": "github.com/x"}, None), ({k: v for k, v in p.items() if k != "string"}, None),
        ):
            with self.assertRaises(ValueError):
                generate.validate_palette(candidate, name)

    def test_build_writes_every_output(self):
        with tempfile.TemporaryDirectory() as directory:
            for name, p in self.themes():
                built = generate.build(name, Path(directory))
                for relative, text in generate.outputs(p).items():
                    self.assertEqual((built / relative).read_text(), text)
                self.assertEqual(sorted(path.name for path in built.iterdir() if path.name.startswith(".")), [])

    def test_opencode_token_tree_is_complete(self):
        for name, p in self.themes():
            theme = generate.opencode(p)
            self.assertEqual(set(theme) - {"$schema", "base"}, {p["mode"]})
            base = theme["base"]
            self.assertTrue(base["categorical"])
            for group in ("text", "background"):
                self.assertIn("base", base[group])
                for variant in ("primary", "secondary", "destructive"):
                    self.assertIn("base", base[group]["action"][variant])
                self.assertIn("base", base[group]["formfield"])
                for state in ("error", "warning", "success", "info"):
                    self.assertIn("base", base[group]["feedback"][state])
            self.assertEqual(set(base["background"]["raised"]), {"base", "high", "max"})
            self.assertEqual(set(base["syntax"]), {
                "comment", "keyword", "function", "variable", "string", "number", "type", "operator", "punctuation",
            })
            self.assertEqual(set(base["markdown"]), {
                "text", "heading", "link", "linkText", "code", "blockQuote", "emphasis", "strong",
                "horizontalRule", "listItem", "listEnumeration", "image", "imageText", "codeBlock",
            })
            hue = theme[p["mode"]]["hue"]
            for color in ("gray", "red", "orange", "yellow", "green", "cyan", "blue", "purple"):
                self.assertEqual(set(hue[color]), set(map(str, range(100, 1000, 100))))
            for alias in ("accent", "interactive", "neutral"):
                self.assertIn(alias, hue)

    def test_opencode_references_resolve_without_cycles(self):
        for name, p in self.themes():
            theme = generate.opencode(p)
            root = {**theme["base"], **theme[p["mode"]]}

            def check(value, seen=()):
                if isinstance(value, str) and value.startswith("$"):
                    self.assertNotIn(value, seen, f"Cyclic reference: {value}")
                    target = root
                    for segment in value[1:].split("."):
                        self.assertIsInstance(target, dict)
                        self.assertIn(segment, target, f"Unresolved reference: {value}")
                        target = target[segment]
                    check(target, (*seen, value))
                elif isinstance(value, dict):
                    for item in value.values():
                        check(item, seen)
                elif isinstance(value, list):
                    for item in value:
                        check(item, seen)

            check(root)

    def test_rex_and_neovim_share_the_entire_ansi_palette(self):
        for name, p in self.themes():
            outputs = generate.outputs(p)
            rex = outputs[f"rex/{name}"]
            actual = {int(i): color for i, color in re.findall(r"^palette = (\d+)=(#[0-9a-f]{6})$", rex, re.M)}
            self.assertEqual(actual, {i: p[key] for i, key in enumerate(generate.ANSI)})
            resolved = json.loads(outputs["palette.json"])
            self.assertEqual(resolved["ansi"], list(actual.values()))
            self.assertEqual({key: resolved[key] for key in generate.derived(p)}, generate.derived(p))

    def test_oklch_matches_colors_xcode_displays(self):
        # Xcode showed #0000FF for exactly these values.
        for actual, expected in zip(generate.oklch("#0000ff"), (.4520137, .3132144, 4.6085772)):
            self.assertAlmostEqual(actual, expected, places=6)
        lightness, chroma, _ = generate.oklch("#808080")
        self.assertAlmostEqual(chroma, 0, places=6)
        self.assertAlmostEqual(generate.oklch("#ffffff")[0], 1, places=6)

    def test_xcode_theme_sets_every_color_exactly(self):
        for name, p in self.themes():
            theme = generate.xcode(p)
            recipe = theme["recipe"]
            self.assertEqual(theme["fileVersion"], 1)
            self.assertEqual(recipe["colorScheme"], p["mode"])
            self.assertEqual(set(recipe["palette"]["colorOverrides"]), set(generate.XCODE))
            self.assertEqual(recipe["background"]["customColor"]["lightness"]["exact"], generate.oklch(p["background"])[0])
            plain = recipe["palette"]["colorOverrides"]["plainText"]["color"]
            self.assertEqual((plain["lightness"]["exact"], plain["chroma"]["exact"], plain["hue"]["radians"]),
                             generate.oklch(p["foreground"]))
            self.assertTrue(set(generate.XCODE.values()) <= set(p))

    def test_every_theme_keeps_text_and_the_accent_usable(self):
        for name, p in self.themes():
            for surface in ("background", "panel", "terminalBackground"):
                self.assertGreaterEqual(contrast(p["foreground"], p[surface]), 4.5, surface)
            # Text on the accent, as in lualine's mode and focused buttons.
            self.assertGreaterEqual(contrast(p["background"], p["accent"]), 4.5)
            # Rex uses the accent for the cursor and highlighted rows, and puts
            # dark text on a light accent and white text on a dark one.
            text = "#000000" if p["mode"] == "dark" else "#ffffff"
            self.assertGreaterEqual(contrast(p["accent"], p["terminalBackground"]), 7 if p["mode"] == "dark" else 4.5)
            self.assertGreaterEqual(contrast(text, p["accent"]), 4.5)

    def test_important_text_has_readable_contrast(self):
        # Floors for themes designed here. Ports (with a source) keep their
        # upstream colors, which often trade contrast for mood.
        for name, p in self.themes():
            if "source" in p:
                continue
            for surface in ("background", "inset", "panel", "raised", "selection", "terminalBackground"):
                self.assertGreaterEqual(contrast(p["foreground"], p[surface]), 7, surface)
                self.assertGreaterEqual(contrast(p["muted"], p[surface]), 4.5, surface)
            for token in generate.opencode(p)["base"]["syntax"].values():
                self.assertGreaterEqual(contrast(token, p["panel"]), 4.5)
            # Light themes use soft borders: 3:1 would read as heavy rules.
            self.assertGreaterEqual(contrast(p["border"], p["background"]), 3 if p["mode"] == "dark" else 1.4)
            # Errors and warnings stand apart from the syntax colors they resemble.
            self.assertNotEqual(p["error"], p["keyword"])
            self.assertNotEqual(p["warning"], p["property"])

    def test_surface_layers_are_distinct(self):
        for name, p in self.themes():
            if "source" not in p:
                self.assertGreaterEqual(contrast(p["panel"], p["background"]), 1.15)
            # Inset surfaces (floats, statuslines, inactive windows) are recessed:
            # darker than the background in either mode. Dark themes lighten
            # panels as they rise; light themes darken them from the background.
            if p["mode"] == "dark":
                order, direction = ("inset", "background", "panel", "raised", "selection"), 1
            else:
                order, direction = ("background", "inset", "panel", "raised", "selection"), -1
            levels = [luminance(p[key]) for key in order]
            for lower, upper in zip(levels, levels[1:]):
                self.assertGreater(direction * (upper - lower), 0, order)


if __name__ == "__main__":
    unittest.main()
