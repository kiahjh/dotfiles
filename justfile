_default:
  @just --choose

test:
  @bun test ./gt/.local/scripts/gt.test.ts ./pi/.pi/agent/skills/multi-character-code-council/mcc.test.ts

stow:
  @stow agents
  @stow git
  @stow ohmyzsh
  @stow stow
  @stow bin
  @stow gt
  @stow zellij
  @stow ghostty
  @stow nvim
  @stow opencode
  @stow pi
