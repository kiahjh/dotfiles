#!/bin/bash
# Fire It Up's ngrok row: tunnel the task's API so a phone on another network can
# reach it. ngrok's usual screen puts the URL too low for a short pane, so show
# the URL first and then only warnings and errors.
set -uo pipefail
port=${1:?usage: gertrude_ngrok.sh API_PORT}

printf 'Starting ngrok for the API on port %s…\n' "$port"
ngrok http "$port" --log stdout --log-format logfmt 2>&1 | while IFS= read -r line; do
  if [[ $line == *'msg="started tunnel"'* && $line =~ url=(https://[^[:space:]]+) ]]; then
    printf '\n  \033[1mPhone API URL:\033[0m %s\n' "${BASH_REMATCH[1]}"
    printf '  forwards to http://127.0.0.1:%s\n' "$port"
    [[ -n ${inspector:-} ]] && printf '  requests: http://%s\n' "$inspector"
  elif [[ $line == *'msg="starting web service"'* && $line =~ addr=([^[:space:]]+) ]]; then
    inspector=${BASH_REMATCH[1]}
  elif [[ $line == *lvl=eror* || $line == *lvl=crit* || ( $line == *lvl=warn* && $line != *update* && $line != *"can't bind default web address"* ) || $line != t=* ]]; then
    printf '%s\n' "${line#t=* }"
  fi
done
