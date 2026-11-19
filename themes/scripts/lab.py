#!/usr/bin/env python3
"""Local palette workbench and true-color terminal specimens; stdlib only."""

import argparse
from contextlib import contextmanager
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import select
import shutil
import sys
import tempfile
import threading
from urllib.request import urlopen
import webbrowser

import generate

ROOT = generate.ROOT
FIXTURES = ROOT / "lab/fixtures.json"
THEME = "kiahgawa"


def palette_path():
    return ROOT / THEME / "palette.json"


def revision():
    return hashlib.sha256(palette_path().read_bytes()).hexdigest()


def state():
    data = palette_path().read_bytes()
    return {"palette": generate.validate_palette(json.loads(data), THEME),
            "revision": hashlib.sha256(data).hexdigest(),
            "ansi": list(generate.ANSI), "fixtures": json.loads(FIXTURES.read_text()),
            # The previews color each app the way the generator does.
            "roles": {"opencode": {"syntax": generate.OPENCODE_SYNTAX, "markdown": generate.OPENCODE_MARKDOWN},
                      "xcode": generate.XCODE}}


def replace_file(path, data):
    """Replace a single file atomically, preserving its permissions."""
    mode = path.stat().st_mode if path.exists() else 0o644
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        try:
            handle.write(data)
            handle.flush()
            os.fchmod(handle.fileno(), mode & 0o777)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def save_palette(p, expected_revision):
    generate.validate_palette(p, THEME)
    if expected_revision != revision():
        raise FileExistsError("Palette changed on disk. Reload the disk version before saving.")
    replace_file(palette_path(), (json.dumps(p, indent=2) + "\n").encode())
    # Neovim follows rebuilt files when this is the current theme.
    generate.build(THEME)
    return state()


def make_handler(token, port, lock):
    preview = {"palette": None}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            # Polling should not fill the terminal with access logs.
            if args and str(args[1]) not in ("200", "304"):
                super().log_message(fmt, *args)

        def respond(self, status, body, content_type="application/json"):
            data = json.dumps(body).encode() if content_type == "application/json" else body
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            self.end_headers()
            self.wfile.write(data)

        def trusted(self):
            return self.headers.get("Host") in (f"127.0.0.1:{port}", f"localhost:{port}")

        def do_GET(self):
            if not self.trusted():
                return self.respond(403, {"error": "Use the loopback URL printed by the lab."})
            if self.path in ("/api/state", "/api/preview"):
                try:
                    with lock:
                        result = state()
                        if self.path == "/api/preview" and preview["palette"] is not None:
                            result["palette"] = preview["palette"]
                        return self.respond(200, result)
                except (ValueError, OSError) as error:
                    return self.respond(422, {"error": str(error)})
            files = {"/": ("index.html", "text/html; charset=utf-8"),
                     "/lab.css": ("lab.css", "text/css; charset=utf-8"),
                     "/lab.js": ("lab.js", "text/javascript; charset=utf-8"),
                     "/color.js": ("color.js", "text/javascript; charset=utf-8"),
                     "/views.js": ("views.js", "text/javascript; charset=utf-8")}
            if self.path not in files:
                return self.respond(404, {"error": "Not found"})
            name, content_type = files[self.path]
            text = (ROOT / "lab" / name).read_text().replace("__LAB_TOKEN__", token)
            self.respond(200, text.encode(), content_type)

        def do_POST(self):
            origin = self.headers.get("Origin")
            if (not self.trusted() or self.headers.get("Authorization") != f"Bearer {token}"
                    or origin not in (None, f"http://127.0.0.1:{port}", f"http://localhost:{port}")):
                return self.respond(403, {"error": "Untrusted palette write"})
            if self.path not in ("/api/save", "/api/preview"):
                return self.respond(404, {"error": "Not found"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 16384:
                    raise ValueError("Expected a small JSON palette")
                if self.headers.get("Content-Type") != "application/json":
                    raise ValueError("Expected application/json")
                payload = json.loads(self.rfile.read(size))
                if not isinstance(payload, dict):
                    raise ValueError("Expected a JSON object")
                with lock:
                    if self.path == "/api/preview":
                        preview["palette"] = generate.validate_palette(payload.get("palette"), THEME)
                        result = {"ok": True}
                    else:
                        result = save_palette(payload.get("palette"), payload.get("revision"))
                self.respond(200, result)
            except FileExistsError as error:
                self.respond(409, {"error": str(error)})
            except (ValueError, TypeError) as error:
                self.respond(422, {"error": str(error)})
            except OSError as error:
                self.respond(500, {"error": str(error)})

    return Handler


def serve(port, launch):
    token = secrets.token_urlsafe(32)
    server = ThreadingHTTPServer(("127.0.0.1", port), BaseHTTPRequestHandler)
    server.RequestHandlerClass = make_handler(token, server.server_port, threading.Lock())
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"{THEME} palette lab → {url}", flush=True)
    print(f"Edits are provisional. ‘Save’ writes themes/{THEME}/palette.json and rebuilds its app files.", flush=True)
    print(f"Ctrl-C to stop. Live terminal: theme lab --theme {THEME} --terminal --follow --port {server.server_port}", flush=True)
    if launch:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


class Terminal:
    pages = ("Overview", "Code", "Diff", "Picker", "ANSI")

    def __init__(self, p, fixtures, width=100, color=True):
        self.p = generate.derived(p)
        self.fixtures = fixtures
        self.width = max(20, min(width, 120))
        self.color = color

    def paint(self, text, fg="foreground", bg="terminalBackground", bold=False):
        if not self.color:
            return text
        def rgb(key):
            value = self.p[key]
            return ";".join(str(int(value[i:i + 2], 16)) for i in (1, 3, 5))
        return f"\033[{'1;' if bold else ''}38;2;{rgb(fg)};48;2;{rgb(bg)}m{text}\033[0m"

    def row(self, text="", fg="foreground", bg="terminalBackground"):
        return self.paint(text[:self.width].ljust(self.width), fg, bg)

    def render(self, page=0):
        lines = [self.row(f"  {' '.join(self.p['name'].upper())}   /   PALETTE LAB", "yellow", "panel"),
                 self.row("  " + "   ".join(f"{'›' if i == page else ' '} {i + 1} {name}" for i, name in enumerate(self.pages)), "muted"), self.row()]
        if page == 0:
            lines += [self.row("  CI · dotfiles", "brightForeground"),
                      self.row("  4 jobs · 1 failing", "muted"), self.row()]
            for job in self.fixtures["jobs"]:
                lines += [self.row(f"  {job['name']:<22} {job['status']}", job["role"], "panel"),
                          self.row(f"  {job['detail']}", "muted", "panel"), self.row()]
            lines += [self.row("  Dev server", "yellow"), *[self.row("  " + text, role, "inset") for role, text in self.fixtures["logs"]]]
        elif page == 1:
            for sample in self.fixtures["code"]:
                lines += [self.row("  " + sample["file"], "yellow", "panel")]
                for number, spans in enumerate(sample["lines"], 1):
                    prefix = f" {number:>3}  "
                    available = max(0, self.width - len(prefix))
                    text = self.paint(prefix, "muted", "background")
                    for role, value in spans:
                        clipped = value[:available]
                        text += self.paint(clipped, role, "background")
                        available -= len(clipped)
                    lines.append(text + self.paint(" " * available, bg="background"))
                lines.append(self.row())
        elif page == 2:
            lines += [self.row("  trails.ts   +4 −2", "yellow", "panel"), self.row()]
            for line in self.fixtures["diff"]:
                kind = line["kind"]
                fg = {"added": "green", "removed": "red", "hunk": "purple"}.get(kind, "muted")
                bg = {"added": "diffAdded", "removed": "diffRemoved"}.get(kind, "background")
                prefix = {"added": "+", "removed": "−"}.get(kind, " ")
                text = f" {str(line.get('old', '')):>3} {str(line.get('new', '')):>3} {prefix} {line['text']}"
                highlight = line.get("highlight")
                clipped = text[:self.width].ljust(self.width)
                if highlight and highlight in clipped:
                    before, after = clipped.split(highlight, 1)
                    mark = "brightGreen" if kind == "added" else "brightRed"
                    lines.append(self.paint(before, fg, bg) + self.paint(highlight, "background", mark) + self.paint(after, fg, bg))
                else:
                    lines.append(self.row(text, fg, bg))
            lines += [self.row(), self.row("  Review the line wash, inline changes, and quiet context.", "muted")]
        elif page == 3:
            lines += [self.row("  Command palette", "yellow", "panel"),
                      self.row("  > theme_", "foreground", "inset"), self.row()]
            for index, command in enumerate(self.fixtures["commands"]):
                selected = index == 0
                bg = "selection" if selected else "panel"
                lines += [self.row(f"  {'›' if selected else ' '} {command['label']}    {command['shortcut']}", "brightForeground" if selected else command["role"], bg),
                          self.row("    " + command["detail"], "muted", bg)]
            lines += [self.row(), self.row("  Form states", "yellow"),
                      self.row("  Theme      kiahgawa", "foreground", "inset"),
                      self.row("  Mode       Dark       [x] Follow system", "foreground", "panel"),
                      self.row("  Wallpaper  No wallpapers in this theme", "error", "panel"),
                      self.row("  [ Save changes ]", "background", "yellow"),
                      self.row("  [ Unavailable  ]", "disabled", "panel")]
        else:
            lines += [self.row("  SHARED ANSI COLORS · actual RGB, not your terminal’s current theme", "muted"), self.row()]
            for index, key in enumerate(generate.ANSI):
                available = self.width
                parts = []
                for text, fg, bg in ((f" {index:>2} ", key, "terminalBackground"),
                                     (" Aa ", "foreground" if index == 0 else "black", key),
                                     (f"  {key:<18} {self.p[key]}", "muted", "terminalBackground")):
                    clipped = text[:available]
                    parts.append(self.paint(clipped, fg, bg))
                    available -= len(clipped)
                lines.append("".join(parts) + self.paint(" " * available))
            lines += [self.row(), self.row("  Surface ladder", "yellow")]
            for key in ("inset", "terminalBackground", "background", "panel", "raised", "selection"):
                lines.append(self.row(f"  {key:<24} Main text / secondary detail", "foreground", key))
        lines += [self.row(), self.row("  1–5 / ← → switch · ↑ ↓ scroll · q quit · reloads saved palette", "muted", "panel")]
        return lines


@contextmanager
def terminal_mode():
    import termios
    import tty
    settings = termios.tcgetattr(sys.stdin.fileno())
    try:
        tty.setcbreak(sys.stdin.fileno())
        sys.stdout.write("\033[?1049h\033[?25l")
        yield
    finally:
        termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, settings)
        sys.stdout.write("\033[0m\033[?25h\033[?1049l")
        sys.stdout.flush()


def terminal(once=False, plain=False, page=0, follow_port=None):
    def current():
        if follow_port is None:
            return state()
        with urlopen(f"http://127.0.0.1:{follow_port}/api/preview", timeout=1) as response:
            return json.load(response)

    def specimen(data, width):
        preview = Terminal(data["palette"], data["fixtures"], width, not plain)
        lines = preview.render(page)
        if follow_port is not None:
            lines[-1] = preview.row(
                "  1–5 / ← → switch · ↑ ↓ scroll · q quit · following browser preview", "muted", "panel")
        return lines

    if once:
        data = current()
        print("\n".join(specimen(data, shutil.get_terminal_size().columns)))
        return
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise ValueError("Interactive gallery needs a terminal; use --once for a printable specimen.")
    page, scroll = page, 0
    previous = None
    with terminal_mode():
        while True:
            size = shutil.get_terminal_size()
            try:
                data = current()
                lines = specimen(data, size.columns)
            except (OSError, ValueError) as error:
                lines = [f"Palette unavailable: {error}", "Fix the palette on disk, or press q to quit."]
            visible_rows = max(1, size.lines - 1)
            scroll = min(scroll, max(0, len(lines) - visible_rows))
            screen = "\r\n".join(lines[scroll:scroll + visible_rows])
            if screen != previous:
                sys.stdout.write("\033[0m\033[H\033[2J" + screen)
                sys.stdout.flush()
                previous = screen
            if select.select([sys.stdin], [], [], .3)[0]:
                key = os.read(sys.stdin.fileno(), 32).decode(errors="ignore")
                if "q" in key or "\x03" in key:
                    break
                if key in ("\x1b[C", "l", "\t"):
                    page, scroll = (page + 1) % len(Terminal.pages), 0
                elif key in ("\x1b[D", "h"):
                    page, scroll = (page - 1) % len(Terminal.pages), 0
                elif key in ("\x1b[B", "j"):
                    scroll += 1
                elif key in ("\x1b[A", "k"):
                    scroll = max(0, scroll - 1)
                elif key in ("1", "2", "3", "4", "5"):
                    page, scroll = int(key) - 1, 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--theme", choices=generate.names(), help="theme to edit (default: the current one)")
    parser.add_argument("--terminal", action="store_true", help="interactive true-color terminal gallery")
    parser.add_argument("--follow", action="store_true", help="terminal follows the web lab's provisional browser preview")
    parser.add_argument("--once", action="store_true", help="print one terminal specimen and exit")
    parser.add_argument("--plain", action="store_true", help="omit color escape sequences in terminal specimens")
    parser.add_argument("--page", choices=range(1, 6), type=int, default=1)
    parser.add_argument("--port", type=int, default=4173, help="web port; 0 chooses a free port")
    parser.add_argument("--open", action="store_true", help="open the web lab in your browser")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    global THEME
    current = generate.store() / "current"
    THEME = args.theme or (os.readlink(current) if current.is_symlink() else THEME)
    if args.follow and (not (args.terminal or args.once) or args.port == 0):
        parser.error("--follow needs --terminal or --once, and the web lab's actual port")
    try:
        if args.terminal or args.once:
            terminal(args.once, args.plain, args.page - 1, args.port if args.follow else None)
        else:
            serve(args.port, args.open)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Palette lab: {error}\n")
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
