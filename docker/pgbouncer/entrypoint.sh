#!/bin/sh
set -eu
# Credentials come from .env.prod (POSTGRES_USER / POSTGRES_PASSWORD), never baked into the image.
printf '"%s" "%s"\n' "$POSTGRES_USER" "$POSTGRES_PASSWORD" > /tmp/userlist.txt
exec pgbouncer /etc/pgbouncer/pgbouncer.ini
