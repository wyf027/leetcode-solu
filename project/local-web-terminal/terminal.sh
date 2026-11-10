#!/bin/sh
set -eu

case "$#:${1-}" in
  1:serve|1:attach) ;;
  *)
    printf 'Usage: %s serve | attach\n' "$0" >&2
    exit 2
    ;;
esac

if ! command -v tmux >/dev/null 2>&1; then
  printf 'Install tmux before running this script.\n' >&2
  exit 1
fi

if [ "$1" = attach ]; then
  exec tmux -L leetcode-web-terminal new-session -A -s shared -c "$PWD"
fi

if ! command -v ttyd >/dev/null 2>&1; then
  printf 'Install ttyd before starting the web terminal.\n' >&2
  exit 1
fi

port=${WEB_TERMINAL_PORT:-7681}
case "$port" in
  0*|*[!0-9]*|??????*) port=0 ;;
esac
if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  printf 'WEB_TERMINAL_PORT must be a port number from 1 to 65535.\n' >&2
  exit 2
fi

exec ttyd -i 127.0.0.1 -p "$port" -W -O \
  tmux -L leetcode-web-terminal new-session -A -s shared -c "$PWD"
