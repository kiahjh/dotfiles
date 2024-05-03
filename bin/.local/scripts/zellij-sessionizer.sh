#!/usr/bin/env bash

SESSION=$(find ~ ~/active-projects ~/self-hosted ~/inactive-projects ~/learning -mindepth 1 -maxdepth 1 -type d | fzf);
SESSION_NAME=$(basename "$SESSION" | tr . _);

if zellij list-sessions | grep -q "$SESSION_NAME"; then
  zellij attach "$SESSION_NAME";
else
  cd "$SESSION" && zellij -s "$SESSION_NAME";
fi  
