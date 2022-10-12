FROM node:16-bullseye-slim AS base

ARG PULSAR_VERSION
# The fingerprint for the GPG key can be found from
# https://downloads.apache.org/pulsar/KEYS
# and can be verified by using a search engine to find other uses for it.
ARG PULSAR_GPG_FINGERPRINT=C6027CC38D525CEAF0256A74772D77990D717CBC
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get upgrade --assume-yes \
  && apt-get --assume-yes --quiet --no-install-recommends install \
  # Add packages for downloading and verifying the Pulsar C++ client.
  'ca-certificates' \
  'gnupg' \
  'wget' \
  # Follow https://pulsar.apache.org/docs/en/client-libraries-cpp/ .
  'cmake' \
  'google-mock' \
  'libboost-all-dev' \
  'libcurl4-openssl-dev' \
  'libgtest-dev' \
  'libjsoncpp-dev' \
  'liblog4cxx-dev' \
  'libprotobuf-dev' \
  'libssl-dev' \
  'protobuf-compiler' \
  # Add more tools for compiling the Pulsar Node.js client.
  'build-essential' \
  'python2' \
  'python3' \
  && rm -rf /var/lib/apt/lists/*

USER node
RUN mkdir /home/node/pulsar-cpp
WORKDIR /home/node/pulsar-cpp

RUN wget \
  --progress=dot:giga \
  "https://www.apache.org/dyn/mirrors/mirrors.cgi?action=download&filename=pulsar/pulsar-${PULSAR_VERSION}/DEB/apache-pulsar-client.deb" \
  --output-document='./apache-pulsar-client.deb' \
  && wget \
  --progress=dot:giga \
  "https://www.apache.org/dyn/mirrors/mirrors.cgi?action=download&filename=pulsar/pulsar-${PULSAR_VERSION}/DEB/apache-pulsar-client.deb.asc" \
  --output-document='./apache-pulsar-client.deb.asc' \
  && wget \
  --progress=dot:giga \
  "https://www.apache.org/dyn/mirrors/mirrors.cgi?action=download&filename=pulsar/pulsar-${PULSAR_VERSION}/DEB/apache-pulsar-client-dev.deb" \
  --output-document='./apache-pulsar-client-dev.deb' \
  && wget \
  --progress=dot:giga \
  "https://www.apache.org/dyn/mirrors/mirrors.cgi?action=download&filename=pulsar/pulsar-${PULSAR_VERSION}/DEB/apache-pulsar-client-dev.deb.asc" \
  --output-document='./apache-pulsar-client-dev.deb.asc' \
  && gpg \
  --batch \
  --keyserver hkps://keyserver.ubuntu.com \
  --recv-keys "${PULSAR_GPG_FINGERPRINT}" \
  && gpg \
  --batch \
  --verify \
  ./apache-pulsar-client.deb.asc \
  ./apache-pulsar-client.deb \
  && gpg \
  --batch \
  --verify \
  ./apache-pulsar-client-dev.deb.asc \
  ./apache-pulsar-client-dev.deb

USER root
RUN apt-get --assume-yes --quiet --no-install-recommends install \
  ./apache-pulsar-client*.deb \
  && rm -r \
  /home/node/pulsar-cpp \
  /usr/lib/libpulsarwithdeps.a \
  /usr/lib/libpulsar.a \
  /usr/lib/libpulsarnossl.so*

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



# An alternative to using a separate layer is to trust npm prune --production.
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
FROM node:16-bullseye-slim AS production

ARG DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get -y --no-install-recommends install \
  'ca-certificates' \
  'tini' \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/lib/libpulsar.so* /usr/lib/

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
