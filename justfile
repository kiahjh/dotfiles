_default:
  @just --choose

test:
  @python3 -B -m unittest discover -s scripts/tests -v
  @just test-xcode-mcp-router
  @bun test ./gt/.local/scripts/gt.test.ts ./gt/.local/scripts/gt-support.test.ts ./gt/.local/scripts/codex-gertrude-task.test.ts ./pi/.pi/agent/skills/multi-character-code-council/mcc.test.ts
  @./capslock/.local/scripts/capslock-test

test-xcode-mcp-router:
  @uv run --python 3.12 --with mcp==2.3.0 python -B -m unittest discover -s scripts/xcode-mcp-router-tests -v

capslock-install:
  @./capslock/.local/scripts/capslock-install

capslock-uninstall:
  @./capslock/.local/scripts/capslock-uninstall
  @stow -D capslock

themes-update:
  @python3 -B scripts/themes-update.py

user-review-build:
  @cd agents/.agents/skills/user-review/app && bun install --frozen-lockfile && node scripts/sync-theme.ts && bun run build

user-review-test:
  @cd agents/.agents/skills/user-review/app && bun run test && bun run test:browser

user-review-demo:
  @node agents/.agents/skills/user-review/app/bin/user-review.mjs demo

stow:
  @stow agents
  @stow git
  @stow ohmyzsh
  @stow stow
  @stow bin
  @stow capslock
  @stow gt
  @stow zellij
  @stow ghostty
  @stow rex
  @stow nvim
  @stow opencode
  @stow pi
