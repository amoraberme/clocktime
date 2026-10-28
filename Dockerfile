# ClockTime production image: the app (`next start`) plus the tooling the local production copy
# runs from the same image (migrations, seeding, the cron runner and load tests).
FROM node:22.22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies first, so code changes don't reinstall them. postinstall runs `prisma generate`,
# which only needs a syntactically valid URL at build time.
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm install --frozen-lockfile

COPY . .
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they're build arguments.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ARG NEXT_PUBLIC_SALES_EMAIL=""
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_SALES_EMAIL=$NEXT_PUBLIC_SALES_EMAIL
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1
# Keep-alive longer than nginx's (4 s), so the proxy, not the app, closes idle connections.
CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000", "--keepAliveTimeout", "65000"]
