#!/usr/bin/env python3
"""Build each theme's app files from themes/<name>/palette.json. No dependencies."""

import argparse
import json
import math
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ANSI = (
    "black", "red", "green", "yellow", "blue", "purple", "cyan", "foreground",
    "muted", "brightRed", "brightGreen", "brightYellow", "brightBlue",
    "brightPurple", "brightCyan", "brightForeground",
)
COLORS = {
    "background", "terminalBackground", "inset", "panel", "raised", "selection",
    "foreground", "brightForeground", "subtle", "muted", "disabled", "border",
    "scrollbar", "black", "red", "orange", "yellow", "green", "cyan", "blue",
    "purple", "accent", "keyword", "property", "error", "warning", "brightRed",
    "brightGreen", "brightYellow", "brightBlue", "brightPurple", "brightCyan",
    # Code has its own roles; ported themes rarely color it with ANSI colors.
    "string", "function", "type", "number", "constant", "operator", "punctuation", "parameter",
}
MODES = ("dark", "light")


def store():
    """Where generated files live; `current` in here links to the active theme."""
    data = os.environ.get("XDG_DATA_HOME") or Path.home() / ".local/share"
    return Path(data) / "themes"


def names():
    return sorted(path.parent.name for path in ROOT.glob("*/palette.json"))


def palette(name):
    p = json.loads((ROOT / name / "palette.json").read_text())
    return validate_palette(p, name)


def validate_palette(p, name=None):
    if not isinstance(p, dict):
        raise ValueError("Palette must be a JSON object")
    if set(p) - {"source"} != COLORS | {"name", "mode"}:
        raise ValueError("Unexpected palette keys")
    # Ports of existing themes name where their colors come from.
    if "source" in p and not (isinstance(p["source"], str) and p["source"].startswith("https://")):
        raise ValueError("source must be an https URL")
    if not isinstance(p["name"], str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", p["name"]):
        raise ValueError(f"Invalid theme name: {p['name']!r}")
    if name is not None and p["name"] != name:
        raise ValueError(f"Palette name {p['name']!r} doesn't match its directory {name!r}")
    if p["mode"] not in MODES:
        raise ValueError(f"Mode must be dark or light, not {p['mode']!r}")
    for key in COLORS:
        if not isinstance(p[key], str) or not re.fullmatch(r"#[0-9a-f]{6}", p[key]):
            raise ValueError(f"Invalid RGB color for {key}: {p[key]!r}")
    return p


def mix(a, b, amount):
    return "#" + "".join(
        f"{round(int(a[i:i + 2], 16) * (1 - amount) + int(b[i:i + 2], 16) * amount):02x}"
        for i in (1, 3, 5)
    )


def derived(p):
    return {
        **p,
        "diffAdded": mix(p["background"], p["green"], .14),
        "diffRemoved": mix(p["background"], p["red"], .14),
        "diffAddedLine": mix(p["background"], p["green"], .10),
        "diffRemovedLine": mix(p["background"], p["red"], .10),
        "search": mix(p["background"], p["cyan"], .22),
    }


OPENCODE_SYNTAX = {
    "comment": "muted", "keyword": "keyword", "function": "function", "variable": "foreground",
    "string": "string", "number": "number", "type": "type", "operator": "operator", "punctuation": "punctuation",
}
OPENCODE_MARKDOWN = {
    "text": "foreground", "heading": "accent", "link": "blue", "linkText": "cyan", "code": "green",
    "blockQuote": "muted", "emphasis": "accent", "strong": "brightForeground",
    "horizontalRule": "border", "listItem": "accent", "listEnumeration": "accent",
    "image": "blue", "imageText": "cyan", "codeBlock": "foreground",
}


def opencode(p):
    p = derived(p)
    dark = p["mode"] == "dark"
    feedback = {key: {"base": p[color]} for key, color in (
        ("error", "error"), ("warning", "warning"), ("success", "green"), ("info", "blue"),
    )}
    # Steps run from strongest contrast at 100 to the surface end at 900.
    hue = {
        "gray": dict(zip(map(str, range(100, 1000, 100)), (
            p["brightForeground"], p["foreground"], p["subtle"], p["muted"],
            p["selection"], p["raised"], p["panel"], p["background"], p["black"] if dark else p["inset"],
        ))),
    }
    ink, ground = ("#ffffff", p["black"]) if dark else ("#000000", mix(p["background"], "#ffffff", .5))
    for name in ("red", "orange", "yellow", "green", "cyan", "blue", "purple", "accent"):
        shades = [mix(p[name], ink, .25), p[name]]
        shades += [mix(ground, p[name], a) for a in (.85, .70, .55, .40, .28, .17, .08)]
        hue[name] = dict(zip(map(str, range(100, 1000, 100)), shades))
    hue.update(interactive="$hue.accent", neutral="$hue.gray")
    # OpenCode colors the agent label and work spinner with the first of these,
    # so lead with the accent and skip hues that would look like it.
    accent_hue = oklch(p["accent"])[2]
    near = lambda name: abs((oklch(p[name])[2] - accent_hue + math.pi) % math.tau - math.pi) < math.radians(30)
    categorical = ["accent"] + [name for name in ("blue", "green", "purple", "red", "cyan", "yellow") if not near(name)]
    return {
        "$schema": "https://opencode.ai/theme.json",
        "base": {
            "categorical": categorical,
            "text": {
                "base": p["foreground"], "muted": p["muted"],
                "action": {
                    "primary": {
                        "base": "$text.base", "$hovered": p["accent"],
                        "$focused": p["background"], "$selected": p["brightForeground"],
                        "$disabled": p["disabled"],
                    },
                    "secondary": {"base": "$text.muted", "$hovered": "$text.base"},
                    "destructive": {"base": p["background"], "$disabled": p["disabled"]},
                },
                "formfield": {
                    "base": "$text.base", "$hovered": p["blue"], "$focused": p["blue"],
                    "$pressed": p["blue"], "$selected": p["brightForeground"],
                    "$disabled": p["disabled"],
                },
                "feedback": feedback,
            },
            "background": {
                "base": p["background"],
                "raised": {"base": p["panel"], "high": p["raised"], "max": p["selection"]},
                "action": {
                    "primary": {
                        "base": "transparent", "$hovered": p["raised"],
                        "$focused": p["accent"], "$selected": p["selection"],
                    },
                    "secondary": {"base": "transparent", "$hovered": p["raised"]},
                    "destructive": {"base": p["red"], "$hovered": p["brightRed"]},
                },
                "formfield": {"base": p["inset"], "$disabled": p["panel"]},
                "feedback": {key: {"base": "$background.base"} for key in feedback},
            },
            "border": {"base": p["border"]},
            "scrollbar": {"base": p["scrollbar"]},
            "diff": {
                "text": {"added": p["green"], "removed": p["red"], "context": p["muted"], "hunkHeader": p["purple"]},
                "background": {"added": p["diffAdded"], "removed": p["diffRemoved"], "context": "$background.base"},
                "highlight": {"added": p["brightGreen"], "removed": p["brightRed"]},
                "lineNumber": {"text": p["muted"], "background": {"added": p["diffAddedLine"], "removed": p["diffRemovedLine"]}},
            },
            "syntax": {key: p[role] for key, role in OPENCODE_SYNTAX.items()},
            "markdown": {key: p[role] for key, role in OPENCODE_MARKDOWN.items()},
            "@dialog": {"background": {"base": "$background.raised.base", "action": {"primary": {"$hovered": "$background.raised.high"}}}},
        },
        # OpenCode uses a theme's only mode whichever mode is requested.
        p["mode"]: {"hue": hue},
    }


def rex(p):
    lines = [
        f"# {p['name']} — generated from ~/.dotfiles/themes/{p['name']}/palette.json.",
        f"background = {p['terminalBackground']}", f"foreground = {p['foreground']}",
        # Rex also uses the cursor color as its accent: the active pane and
        # highlighted rows, which get dark text when the accent is light.
        f"cursor-color = {p['accent']}", f"cursor-text = {p['terminalBackground']}",
        f"selection-background = {p['selection']}", f"selection-foreground = {p['brightForeground']}",
    ]
    lines += [f"palette = {i}={p[key]}" for i, key in enumerate(ANSI)]
    return "\n".join(lines) + "\n"


def oklch(color):
    """sRGB hex to OKLCH lightness, chroma, and hue in radians."""
    linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
              for c in (int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))]
    lms = [sum(w * c for w, c in zip(row, linear)) ** (1 / 3) for row in (
        (.4122214708, .5363325363, .0514459929),
        (.2119034982, .6806995451, .1073969566),
        (.0883024619, .2817188376, .6299787005),
    )]
    lightness, a, b = (sum(w * c for w, c in zip(row, lms)) for row in (
        (.2104542553, .7936177850, -.0040720468),
        (1.9779984951, -2.4285922050, .4505937099),
        (.0259040371, .7827717662, -.8086757660),
    ))
    return lightness, math.hypot(a, b), math.atan2(b, a) % math.tau


# Xcode 27 token → palette role; sub-tokens such as `projectMember.function`
# otherwise inherit their parent's color.
XCODE = {
    "plainText": "foreground", "comment": "muted", "markdown": "subtle", "link": "blue",
    "keyword": "keyword", "keyword.attribute": "purple", "string": "string",
    "number": "number", "number.character": "constant",
    "preprocessor": "red", "preprocessor.macro": "red", "preprocessor.macroSystem": "red",
    "typeDeclaration": "type", "projectType": "type", "projectType.class": "type", "projectType.type": "type",
    "otherType": "type", "projectMember": "property", "projectMember.function": "function",
    "projectMember.variable": "property", "projectMember.constant": "constant",
    "otherMember": "property", "otherMember.function": "function",
    "otherMember.variable": "property", "otherMember.constant": "constant",
    "accent": "accent", "diffAddition": "green", "diffDeletion": "red", "debugger": "orange",
}


def xcode(p):
    """An Xcode 27 workspace theme with every color set exactly."""
    def color(key):
        lightness, chroma, hue = oklch(p[key])
        return {"chroma": {"exact": chroma}, "gamut": "P3", "hue": {"radians": hue},
                "lightness": {"exact": lightness}, "opacity": 1}

    return {
        "fileVersion": 1,
        "recipe": {
            "background": {"customColor": color("background")},
            "colorScheme": p["mode"],
            "palette": {
                "colorOverrides": {token: {"color": color(role)} for token, role in XCODE.items()},
                # Tints for anything without an exact color: the accent on neutral surfaces.
                "primary": {"hue": {"intensity": .5, "radians": oklch(p["accent"])[2]}},
                "secondary": {"hue": {"intensity": 0, "radians": oklch(p["background"])[2]}},
            },
        },
    }


def btop(p):
    """A btop theme. btop draws on the terminal's background (theme_background
    is off), so only text, boxes, and graph colors come from here."""
    roles = {
        "main_bg": "background", "main_fg": "foreground", "title": "foreground",
        "hi_fg": "accent", "selected_bg": "selection", "selected_fg": "brightForeground",
        "inactive_fg": "disabled", "graph_text": "muted", "meter_bg": "raised",
        "proc_misc": "green", "cpu_box": "border", "mem_box": "border", "net_box": "border",
        "proc_box": "border", "div_line": "border",
    }
    gradients = {
        "temp": ("green", "yellow", "red"), "cpu": ("green", "yellow", "red"),
        "free": ("cyan", "cyan", "blue"), "cached": ("blue", "blue", "purple"),
        "available": ("green", "green", "cyan"), "used": ("orange", "orange", "red"),
        "download": ("blue", "purple", "purple"), "upload": ("green", "yellow", "yellow"),
        "process": ("green", "yellow", "red"),
    }
    lines = [f"# {p['name']}: generated from ~/.dotfiles/themes/{p['name']}/palette.json."]
    lines += [f'theme[{key}]="{p[role]}"' for key, role in roles.items()]
    for name, stops in gradients.items():
        lines += [f'theme[{name}_{stop}]="{p[role]}"' for stop, role in zip(("start", "mid", "end"), stops)]
    return "\n".join(lines) + "\n"


def resolved(p):
    """Everything Neovim and other runtime readers need, with derived colors."""
    return {**derived(p), "ansi": [p[key] for key in ANSI]}


def outputs(p):
    return {
        "palette.json": json.dumps(resolved(p), indent=2) + "\n",
        "opencode.json": json.dumps(opencode(p), indent=2) + "\n",
        # Rex names an imported theme after its file.
        f"rex/{p['name']}": rex(p),
        "xcode.xcworkspacecolortheme": json.dumps(xcode(p), indent=2) + "\n",
        "btop.theme": btop(p),
    }


def build(name, target=None):
    """Write a theme's generated files, replacing each one atomically."""
    directory = (target or store()) / name
    for relative, text in outputs(palette(name)).items():
        path = directory / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{os.getpid()}")
        temporary.write_text(text)
        os.replace(temporary, path)
    return directory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("names", nargs="*", help="themes to build (default: all)")
    args = parser.parse_args()
    for name in args.names or names():
        print(f"Built {build(name)}")


if __name__ == "__main__":
    main()
