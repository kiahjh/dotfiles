#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIRS=(
  "$HOME"
  "$HOME/active-projects"
  "$HOME/active-projects/gertrude"
  "$HOME/oss-contributions"
  "$HOME/self-hosted"
  "$HOME/inactive-projects"
  "$HOME/learning"
  "$HOME/temp"
)

expand_path() {
  case "$1" in
    "~") printf '%s\n' "$HOME" ;;
    "~/"*) printf '%s/%s\n' "$HOME" "${1#~/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

if [[ $# -gt 0 ]]; then
  SESSION=$(expand_path "$1")
else
  EXISTING_PROJECT_DIRS=()
  for dir in "${PROJECT_DIRS[@]}"; do
    [[ -d "$dir" ]] && EXISTING_PROJECT_DIRS+=("$dir")
  done

  SESSION=$(find "${EXISTING_PROJECT_DIRS[@]}" -mindepth 1 -maxdepth 1 -type d | fzf --style full --preview 'tree {}') || exit 0
fi

if [[ ! -d "$SESSION" ]]; then
  echo "No such directory: $SESSION" >&2
  exit 1
fi

SESSION=$(cd "$SESSION" && pwd)
SESSION_NAME=$(basename "$SESSION" | tr . _)

if zellij list-sessions --short --no-formatting | grep -Fx -- "$SESSION_NAME" >/dev/null; then
  exec zellij attach "$SESSION_NAME"
else
  cd "$SESSION"
  exec zellij -s "$SESSION_NAME"
fi
