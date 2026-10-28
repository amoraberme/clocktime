# PgBouncer in transaction mode: the local stand-in for Neon's pooled ("-pooler") endpoint.
FROM alpine:3.22.7
RUN apk add --no-cache pgbouncer
COPY pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER nobody
EXPOSE 6432
ENTRYPOINT ["/entrypoint.sh"]
