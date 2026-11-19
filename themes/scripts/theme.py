#!/usr/bin/env python3
"""Switch macOS, the wallpaper, Rex, OpenCode, Xcode, and Neovim to one theme."""

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import generate

WALLPAPER_TYPES = {".heic", ".jpeg", ".jpg", ".png"}
SET_WALLPAPER = """
ObjC.import("AppKit");
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const screens = $.NSScreen.screens;
  for (let i = 0; i < screens.count; i++) {
    if (!$.NSWorkspace.sharedWorkspace.setDesktopImageURLForScreenOptionsError(url, screens.objectAtIndex(i), $({}), null)) {
      throw new Error("macOS refused the wallpaper");
    }
  }
}
"""


class Skipped(Exception):
    """An app that can't be themed right now, such as one that isn't running."""


def run(*command, timeout=30):
    return subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout).stdout


def state_dir():
    return Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state") / "theme"


def config_dir():
    return Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")


def load_state():
    path = state_dir() / "state.json"
    return json.loads(path.read_text()) if path.exists() else {}


def save_state(state):
    path = state_dir() / "state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".state.{os.getpid()}")
    temporary.write_text(json.dumps(state, indent=2) + "\n")
    os.replace(temporary, path)


def link(path, target):
    """Point path at target, replacing an existing link atomically."""
    temporary = path.with_name(f".{path.name}.{os.getpid()}")
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    os.replace(temporary, path)


def current():
    path = generate.store() / "current"
    return os.readlink(path) if path.is_symlink() else None


def wallpapers(name):
    folder = generate.ROOT / name / "wallpapers"
    return sorted(path for path in folder.glob("*") if path.suffix.lower() in WALLPAPER_TYPES)


def wallpaper(name, state):
    files = wallpapers(name)
    chosen = state.get("wallpapers", {}).get(name)
    return next((path for path in files if path.name == chosen), files[0] if files else None)


def advance_wallpaper(name):
    """Each switch to a theme shows its next wallpaper, so all of them come around."""
    files = wallpapers(name)
    if not files:
        return
    state = load_state()
    shown = state.get("wallpapers", {}).get(name)
    names = [path.name for path in files]
    following = names[(names.index(shown) + 1) % len(names)] if shown in names else names[0]
    state.setdefault("wallpapers", {})[name] = following
    save_state(state)


def read_default(key):
    try:
        return run("defaults", "read", "-g", key).strip()
    except subprocess.CalledProcessError:
        return None


def rgb(color):
    return " ".join(f"{int(color[i:i + 2], 16) / 255:.6f}" for i in (1, 3, 5))


POST_COLOR_CHANGE = """
ObjC.import("Foundation");
$.NSDistributedNotificationCenter.defaultCenter.postNotificationNameObjectUserInfoDeliverImmediately(
  "AppleColorPreferencesChangedNotification", $(), $(), true);
"""


def apply_macos(p):
    dark = p["mode"] == "dark"
    if (read_default("AppleInterfaceStyle") == "Dark") != dark:  # Only set in dark mode.
        run("osascript", "-e", "tell application \"System Events\" to tell appearance preferences"
            f" to set dark mode to {str(dark).lower()}")
    # The text-selection highlight: a light version of the accent.
    highlight = f"{rgb(generate.mix(p['accent'], '#ffffff', .55))} Other"
    if read_default("AppleHighlightColor") != highlight:
        run("defaults", "write", "-g", "AppleHighlightColor", highlight)
        run("osascript", "-l", "JavaScript", "-e", POST_COLOR_CHANGE)
    return f"{p['mode']} appearance, accent highlight"


def apply_folders(p):
    """Tint folder icons with the accent. macOS only redraws them when Finder
    restarts, so do that, but only when the color changes."""
    backup = state_dir() / "icon-tint-before-theme.txt"
    if not backup.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_text("".join(f"{key}={read_default(key)}\n" for key in (
            "AppleIconAppearanceTintColor", "AppleIconAppearanceCustomTintColor")))
    current = read_default("AppleIconAppearanceCustomTintColor") or ""
    opacity = current.split()[3] if len(current.split()) == 4 else "0.872961"
    tint = f"{rgb(p['accent'])} {opacity}"
    if read_default("AppleIconAppearanceTintColor") == "Other" and current == tint:
        return "already tinted"
    run("defaults", "write", "-g", "AppleIconAppearanceTintColor", "Other")
    run("defaults", "write", "-g", "AppleIconAppearanceCustomTintColor", tint)
    run("killall", "Finder")
    return "tinted; Finder restarted"


def apply_wallpaper(p):
    path = wallpaper(p["name"], load_state())
    if path is None:
        raise Skipped(f"{p['name']} has no wallpapers")
    # Keep macOS's own wallpaper settings from before the first change.
    index = Path.home() / "Library/Application Support/com.apple.wallpaper/Store/Index.plist"
    backup = state_dir() / "wallpaper-before-theme.plist"
    if index.exists() and not backup.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(index, backup)
    run("osascript", "-l", "JavaScript", "-e", SET_WALLPAPER, str(path))
    return path.name


def apply_rex(p):
    if not shutil.which("rex"):
        raise Skipped("rex isn't installed")
    try:
        clients = json.loads(run("rex", "client", "ls", "--json"))["clients"]
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, KeyError):
        raise Skipped("Rex isn't running") from None
    apps = [client for client in clients if client.get("info", {}).get("kind") == "app"]
    if not apps:
        raise Skipped("no Rex app is connected")
    # Importing a file with the same name replaces Rex's copy and selects it.
    path = generate.store() / p["name"] / "rex" / p["name"]
    for app in apps:
        run("rex", "-C", app["client_id"], "do", "client.theme.import", f"path={path}")
    return ", ".join(app["info"].get("label") or app["client_id"] for app in apps)


def apply_opencode(p):
    """OpenCode reads theme files only at startup but applies a new theme name
    live, so every theme gets a file and switching changes the name."""
    config = config_dir() / "opencode"
    themes = config / "themes"
    if not themes.is_dir():
        raise Skipped(f"{themes} doesn't exist")
    store = generate.store()
    for path in themes.iterdir():
        # Links to themes that no longer exist.
        if path.is_symlink() and os.readlink(path).startswith(f"{store}/") and not path.exists():
            path.unlink()
    new = False
    for name in generate.names():
        path, target = themes / f"{name}.json", store / name / "opencode.json"
        if not (path.is_symlink() and os.readlink(path) == str(target)):
            new = new or name == p["name"]
            link(path, target)
    # OpenCode owns cli.json and replaces it on save; do the same.
    cli = config / "cli.json"
    settings = json.loads(cli.read_text()) if cli.exists() else {}
    if settings.get("theme", {}).get("name") != p["name"]:
        settings.setdefault("theme", {})["name"] = p["name"]
        temporary = cli.with_name(f".cli.{os.getpid()}")
        temporary.write_text(json.dumps(settings, indent=2) + "\n")
        os.replace(temporary, cli)
    return f"theme \"{p['name']}\"" + ("; restart OpenCode once to load this new theme" if new else "")


def apply_xcode(p):
    themes = Path.home() / "Library/Developer/Xcode/UserData/FontAndColorThemes"
    if not themes.parent.is_dir():
        raise Skipped("Xcode isn't set up")
    # Xcode reloads a theme file when it changes, so keep rewriting one named
    # Current; select it once in Xcode's Appearance settings.
    themes.mkdir(exist_ok=True)
    path = themes / "Current.xcworkspacecolortheme"
    temporary = themes / f".Current.{os.getpid()}"
    shutil.copyfile(generate.store() / p["name"] / "xcode.xcworkspacecolortheme", temporary)
    os.replace(temporary, path)
    return "theme \"Current\""


def apply_btop(p):
    conf = config_dir() / "btop/btop.conf"
    if not conf.exists():
        raise Skipped("btop hasn't been run yet")
    # btop only loads themes from its themes folder.
    themes = conf.parent / "themes"
    themes.mkdir(exist_ok=True)
    path, target = themes / "current.theme", generate.store() / "current/btop.theme"
    if not (path.is_symlink() and os.readlink(path) == str(target)):
        link(path, target)
    # btop saves its settings on exit, so set them in its own config, then
    # SIGUSR2 makes a running btop reload it.
    wanted = {"color_theme": f'"{path}"', "theme_background": "False"}
    lines = conf.read_text().splitlines()
    for key, value in wanted.items():
        line = f"{key} = {value}"
        index = next((i for i, text in enumerate(lines) if text.split("=")[0].strip() == key), None)
        if index is None:
            lines.append(line)
        else:
            lines[index] = line
    text = "\n".join(lines) + "\n"
    if text != conf.read_text():
        temporary = conf.with_name(f".btop.conf.{os.getpid()}")
        temporary.write_text(text)
        os.replace(temporary, conf)
    try:
        run("pkill", "-USR2", "-x", "btop")
        return "running btop reloaded"
    except subprocess.CalledProcessError:
        return "applies when btop starts"  # None running.


def apply_neovim(p):
    return "running instances reload themselves"


APPS = {
    "macos": ("macOS", apply_macos),
    "folders": ("Folders", apply_folders),
    "wallpaper": ("Wallpaper", apply_wallpaper),
    "rex": ("Rex", apply_rex),
    "opencode": ("OpenCode", apply_opencode),
    "xcode": ("Xcode", apply_xcode),
    "btop": ("btop", apply_btop),
    "neovim": ("Neovim", apply_neovim),
}


def apply(name, apps=APPS):
    """Build a theme, make it current, and apply it to each app. Returns failures."""
    p = generate.palette(name)
    store = generate.store()
    # Build them all: OpenCode loads every theme's file when it starts.
    for theme in generate.names():
        generate.build(theme, store)
    link(store / "current", name)
    print(f"{name} ({p['mode']})")
    failures = 0
    for key in apps:
        title, function = APPS[key]
        try:
            print(f"  ✓ {title:<10} {function(p)}")
        except Skipped as reason:
            print(f"  – {title:<10} {reason}")
        except (OSError, subprocess.SubprocessError) as error:
            detail = getattr(error, "stderr", None) or str(error)
            print(f"  ✗ {title:<10} {detail.strip()}")
            failures += 1
    return failures


def swatches(name):
    """The palette in true color, for fzf's preview."""
    p = generate.derived(generate.palette(name))

    def paint(text, fg, bg):
        rgb = lambda color: ";".join(str(int(p[color][i:i + 2], 16)) for i in (1, 3, 5))
        return f"\033[38;2;{rgb(fg)};48;2;{rgb(bg)}m{text}\033[0m"

    groups = {
        "Surfaces": ("inset", "background", "panel", "raised", "selection"),
        "Text": ("foreground", "subtle", "muted", "disabled", "accent"),
        "Code": ("keyword", "function", "string", "type", "number", "property", "operator"),
        "Colors": ("red", "orange", "yellow", "green", "cyan", "blue", "purple"),
    }
    lines = [paint(f" {name} · {p['mode']} ".ljust(40), "accent", "background"), ""]
    for group, keys in groups.items():
        lines.append(group)
        lines += [paint("      ", key, key) + paint(f" {key:<18}{p[key]} ", "foreground", "background") for key in keys]
        lines.append("")
    code = [("keyword", "def "), ("function", "apply"), ("punctuation", "("), ("parameter", "theme"),
            ("punctuation", "):"), ("foreground", " "), ("muted", "# switch everything")]
    lines.append("".join(paint(text, role, "background") for role, text in code))
    return "\n".join(lines)


def pick(name):
    """Choose a theme with fzf, previewing each palette."""
    if not shutil.which("fzf"):
        raise SystemExit("theme set needs a theme name (or fzf to pick one).")
    rows = [f"{theme}\t{generate.palette(theme)['mode']}\t{len(wallpapers(theme))} wallpapers"
            for theme in generate.names()]
    launcher = shutil.which("theme") or f"{sys.executable} {Path(__file__)}"
    result = subprocess.run(
        ["fzf", "--delimiter", "\t", "--nth", "1", "--reverse", "--height", "60%",
         "--prompt", "theme> ", "--header", f"current: {name or 'none'}",
         "--preview", f"{launcher} swatches {{1}}", "--preview-window", "right:55%"],
        input="\n".join(rows), stdout=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise SystemExit(0)  # Escape or no match: leave the theme alone.
    return result.stdout.split("\t")[0].strip()


def step(name, offset):
    themes = generate.names()
    index = themes.index(name) if name in themes else -1 if offset > 0 else 0
    return themes[(index + offset) % len(themes)]


def main(argv=None):
    parser = argparse.ArgumentParser(prog="theme", description=__doc__)
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("list", help="list themes (default)")
    commands.add_parser("current", help="print the current theme")
    for command, text in (("set", "switch to a theme"), ("next", "switch to the next theme"),
                          ("prev", "switch to the previous theme"), ("apply", "reapply the current theme")):
        sub = commands.add_parser(command, help=text)
        if command == "set":
            sub.add_argument("name", nargs="?", choices=generate.names(), help="omit to pick with fzf")
        sub.add_argument("--only", help="comma-separated apps: " + ",".join(APPS))
        sub.add_argument("--skip", help="comma-separated apps to leave alone")
    commands.add_parser("build", help="regenerate every theme's files")
    swatch = commands.add_parser("swatches", help="show a theme's colors in the terminal")
    swatch.add_argument("name", choices=generate.names())
    paper = commands.add_parser("wallpaper", help="list or change the current theme's wallpaper")
    paper.add_argument("choice", nargs="?", default="list", help="list, next, prev, or a file name")
    lab = commands.add_parser("lab", help="open the palette lab (see `theme lab -- --help`)")
    lab.add_argument("lab_args", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)

    name = current()
    if args.command in (None, "list"):
        for theme in generate.names():
            mode = generate.palette(theme)["mode"]
            print(f"{'*' if theme == name else ' '} {theme:<20} {mode:<5}  {len(wallpapers(theme))} wallpapers")
        return 0
    if args.command == "current":
        if name is None:
            parser.exit(1, "No theme has been set yet. Run `theme set NAME`.\n")
        print(name)
        return 0
    if args.command == "swatches":
        print(swatches(args.name))
        return 0
    if args.command == "build":
        for theme in generate.names():
            print(f"Built {generate.build(theme)}")
        return 0
    if args.command == "lab":
        lab_args = args.lab_args[1:] if args.lab_args[:1] == ["--"] else args.lab_args
        os.execv(sys.executable, [sys.executable, "-B", str(Path(__file__).with_name("lab.py")), *lab_args])
    if name is None and args.command in ("apply", "wallpaper"):
        parser.exit(1, "No theme has been set yet. Run `theme set NAME`.\n")
    if args.command == "wallpaper":
        state = load_state()
        files = wallpapers(name)
        chosen = wallpaper(name, state)
        if args.choice == "list":
            for path in files:
                print(f"{'*' if path == chosen else ' '} {path.name}")
            return 0
        if not files:
            parser.exit(1, f"{name} has no wallpapers.\n")
        if args.choice in ("next", "prev"):
            path = files[(files.index(chosen) + (1 if args.choice == "next" else -1)) % len(files)]
        else:
            path = next((p for p in files if args.choice in (p.name, p.stem)), None)
            if path is None:
                parser.exit(1, f"{name} has no wallpaper named {args.choice!r}.\n")
        state.setdefault("wallpapers", {})[name] = path.name
        save_state(state)
        return int(apply(name, ["wallpaper"]) > 0)

    apps = list(APPS)
    for option, keep in ((args.only, True), (args.skip, False)):
        if option:
            chosen = set(option.split(","))
            if unknown := chosen - set(APPS):
                parser.error(f"unknown apps: {', '.join(sorted(unknown))}")
            apps = [app for app in apps if (app in chosen) == keep]
    if args.command == "set":
        target = args.name or pick(name)
    elif args.command == "apply":
        target = name
    else:
        target = step(name, 1 if args.command == "next" else -1)
    if args.command != "apply" and "wallpaper" in apps:
        advance_wallpaper(target)
    return int(apply(target, apps) > 0)


if __name__ == "__main__":
    sys.exit(main())
