FROM node:21-slim AS base

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get upgrade --assume-yes \
  && rm -rf /var/lib/apt/lists/*

USER node
RUN mkdir /home/node/app
WORKDIR /home/node/app
COPY --chown=node:node ./package.json ./package-lock.json ./



FROM base AS installer
ENV NODE_ENV=development
RUN npm ci



FROM installer AS tester
COPY --chown=node:node . .
CMD ["npm", "run", "check-and-build"]



# An alternative to creating this layer is to trust npm prune --production.
FROM base AS node_modules
ENV NODE_ENV=production
RUN npm ci --production



# Requires tsc.
FROM installer AS builder
ENV NODE_ENV=production
COPY --chown=node:node . .
RUN npm run build



# The base image should be the same as the base image of base. Yet using ARG for
# the base image irritates hadolint and might break Dependabot.
FROM node:21-slim AS production

ARG DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get -y --no-install-recommends install \
  'ca-certificates' \
  'tini' \
  && rm -rf /var/lib/apt/lists/*

USER node
RUN mkdir /home/node/app
WORKDIR /home/node/app
COPY \
  --chown=node:node \
  --from=builder \
  /home/node/app/dist \
  ./dist
COPY \
  --chown=node:node \
  --from=node_modules \
  /home/node/app/node_modules \
  ./node_modules

ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "./dist/index.js"]
