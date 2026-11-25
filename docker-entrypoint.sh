#!/bin/sh
set -e
case "$1" in
  all|web|bot|migrate)
    export APP_ROLE="$1"
    shift
    exec node /app/apps/server/dist/main.mjs "$@"
    ;;
  cli)
    # The operator command (docs/deployment.md): `cli settings …`.
    shift
    exec node /app/apps/server/dist/cli.mjs "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
