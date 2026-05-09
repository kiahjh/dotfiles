_default:
  @just --choose

test:
  @bun test ./bin/.local/scripts/gt.test.ts

stow:
  @stow git
  @stow ohmyzsh
  @stow stow
  @stow bin
  @stow zellij
  @stow ghostty
  @stow nvim
  @stow opencode
  @stow pi

