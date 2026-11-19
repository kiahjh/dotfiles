_default:
  @just --choose

test:
  @python3 -B -m unittest discover -s scripts/tests -v
  @just themes-test
  @just test-xcode-mcp-router
  @bun test ./gt/.local/scripts/
  @./capslock/.local/scripts/capslock-test
  @./focal/.local/scripts/focal-test

test-xcode-mcp-router:
  @uv run --python 3.12 --with mcp==2.3.0 python -B -m unittest discover -s scripts/xcode-mcp-router-tests -v

capslock-install:
  @./capslock/.local/scripts/capslock-install

capslock-uninstall:
  @./capslock/.local/scripts/capslock-uninstall
  @stow -D capslock

focal-install:
  @./focal/.local/scripts/focal-install

focal-uninstall:
  @./focal/.local/scripts/focal-uninstall
  @stow -D focal

themes-test:
  @python3 -B -m unittest discover -s themes/tests -v
  @nvim --headless -u NONE -i NONE -n -l themes/tests/neovim.lua

stow:
  @stow agents
  @stow git
  @stow ohmyzsh
  @stow stow
  @stow bin
  @stow capslock
  @stow focal
  @stow gt
  @stow zellij
  @stow ghostty
  @stow rex
  @stow nvim
  @stow opencode
  @stow pi
