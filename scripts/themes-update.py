#!/usr/bin/env python3
"""Download Kiahgawa themes and pin Neovim to the same GitHub revision."""

import json
from pathlib import Path
import re
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/kiahjh/kiahgawa.git"
ASSETS = {
    "extras/opencode/kiahgawa.json": "opencode/.config/opencode/themes/kiahgawa.json",
    "extras/rex/kiahgawa": "rex/.config/rex/themes/kiahgawa",
}
LOCKFILE = "nvim/.config/nvim/lazy-lock.json"


def latest_commit():
    result = subprocess.run(
        ["git", "ls-remote", "--exit-code", REPOSITORY, "refs/heads/main"],
        check=True, capture_output=True, text=True, timeout=60,
    )
    commit = result.stdout.split()[0]
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("GitHub returned an invalid commit")
    return commit


def download(commit, asset):
    url = f"https://raw.githubusercontent.com/kiahjh/kiahgawa/{commit}/{asset}"
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read().decode("utf-8")


def update(root=ROOT):
    commit = latest_commit()
    # Fetch and validate everything before changing any installed files.
    contents = {target: download(commit, asset) for asset, target in ASSETS.items()}
    theme = json.loads(contents[ASSETS["extras/opencode/kiahgawa.json"]])
    if not isinstance(theme, dict) or not {"base", "dark"} <= theme.keys():
        raise ValueError("Unexpected OpenCode theme format")
    rex = contents[ASSETS["extras/rex/kiahgawa"]]
    if not all(re.search(rf"^{key}\s*=", rex, re.MULTILINE)
               for key in ("background", "foreground", "palette")):
        raise ValueError("Unexpected Rex theme format")

    lock = json.loads((root / LOCKFILE).read_text())
    lock["kiahgawa"] = {"branch": "main", "commit": commit}
    # Match lazy.nvim's compact entry formatting; preserve unrelated pins.
    contents[LOCKFILE] = "{\n" + ",\n".join(
        f"  {json.dumps(name)}: {{ {json.dumps(value)[1:-1]} }}"
        for name, value in sorted(lock.items())
    ) + "\n}\n"

    for target, content in contents.items():
        path = root / target
        if path.is_symlink():
            raise ValueError(f"Refusing to overwrite a symlink: {path}")
    for target, content in contents.items():
        path = root / target
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".tmp")
        try:
            temporary.write_text(content)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)

    print(f"Updated Kiahgawa themes to {commit}")
    print("Neovim: run :Lazy restore kiahgawa to install the pinned revision.")
    print('Rex: rex do client.theme.import path="$HOME/.config/rex/themes/kiahgawa"')


if __name__ == "__main__":
    update()
