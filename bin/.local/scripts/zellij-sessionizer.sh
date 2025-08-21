#!/usr/bin/env bash

SESSION=$(find ~ ~/active-projects ~/oss-contributions ~/self-hosted ~/inactive-projects ~/learning ~/temp -mindepth 1 -maxdepth 1 -type d | fzf --style full --preview 'tree {}');
SESSION_NAME=$(basename "$SESSION" | tr . _);

if zellij list-sessions | grep -q "$SESSION_NAME"; then
  zellij attach "$SESSION_NAME";
else
  cd "$SESSION" && zellij -s "$SESSION_NAME";
fi  
