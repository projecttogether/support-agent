# One image for every process. The command selects the role:
#   all      admin interface and Slack bot (default)
#   web      admin interface only (port 3000)
#   bot      Slack bot only
#   migrate  apply database migrations, then exit
#   cli …    the operator command, e.g. `cli settings list` (docs/deployment.md)

FROM node:26.13.1-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

FROM base AS deps
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build
# The Deploy workflow's builds upload the source maps of the server and the
# web app to Sentry, which finds them by the debug IDs the build wrote into
# the bundles (scripts/inject-debug-ids.mjs). Without the token (the secret
# SENTRY_AUTH_TOKEN of the repository), nothing is uploaded.
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    if [ -n "$SENTRY_AUTH_TOKEN" ]; then \
      export SENTRY_CLI_NO_TELEMETRY=1 SENTRY_CLI_NO_UPDATE_CHECK=1 \
      && node_modules/.bin/sentry sourcemap upload apps/server/dist \
      && node_modules/.bin/sentry sourcemap upload apps/web/dist; \
    fi

FROM base AS prod-deps
RUN npm ci --omit=dev --workspace @support-agent/server --include-workspace-root=false --no-audit --no-fund

FROM node:26.13.1-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    BOT_HEARTBEAT_FILE=/tmp/bot-heartbeat
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /app/apps/server/drizzle ./apps/server/drizzle
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# `cli …` in a terminal of a running container, e.g. with
# `docker compose exec web cli settings list`.
RUN printf '#!/bin/sh\nexec docker-entrypoint.sh cli "$@"\n' > /usr/local/bin/cli \
    && chmod 755 /usr/local/bin/cli
# The Deploy workflow sets the version (the first 12 characters of the
# commit); images built from source have none.
ARG APP_VERSION=""
ENV APP_VERSION=${APP_VERSION}
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["all"]
