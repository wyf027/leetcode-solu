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

if ! command -v socat >/dev/null 2>&1; then
  printf 'Install socat before starting the web terminal.\n' >&2
  exit 1
fi

socket_dir=$(mktemp -d /tmp/leetcode-web-terminal.XXXXXXXX)
socket_path=$socket_dir/ttyd.sock
ttyd_pid=
proxy_pid=

cleanup() {
  for pid in "$proxy_pid" "$ttyd_pid"; do
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$proxy_pid" "$ttyd_pid"; do
    if [ -n "$pid" ]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
  rm -f "$socket_path"
  rmdir "$socket_dir"
}

trap cleanup 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# A private Unix socket keeps ttyd off TCP even when interface lookup fails.
ttyd -i "$socket_path" -W -O \
  tmux -L leetcode-web-terminal new-session -A -s shared -c "$PWD" &
ttyd_pid=$!

attempt=0
while [ ! -S "$socket_path" ]; do
  if ! kill -0 "$ttyd_pid" 2>/dev/null; then
    wait "$ttyd_pid"
    exit 1
  fi
  if [ "$attempt" -ge 100 ]; then
    printf 'Timed out waiting for the web terminal socket.\n' >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 0.1
done

socat "TCP4-LISTEN:$port,bind=127.0.0.1,reuseaddr,fork" "UNIX-CONNECT:$socket_path" &
proxy_pid=$!

while kill -0 "$ttyd_pid" 2>/dev/null && kill -0 "$proxy_pid" 2>/dev/null; do
  sleep 1
done
if kill -0 "$ttyd_pid" 2>/dev/null; then
  wait "$proxy_pid"
else
  wait "$ttyd_pid"
fi
