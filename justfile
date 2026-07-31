_default:
  @just --choose

test:
  @bun test ./gt/.local/scripts/gt.test.ts ./pi/.pi/agent/skills/multi-character-code-council/mcc.test.ts
  @./capslock/.local/scripts/capslock-test

capslock-install:
  @./capslock/.local/scripts/capslock-install

capslock-uninstall:
  @./capslock/.local/scripts/capslock-uninstall
  @stow -D capslock

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
  @stow nvim
  @stow opencode
  @stow pi
