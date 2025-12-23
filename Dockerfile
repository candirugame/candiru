# syntax=docker/dockerfile:1.7-labs
ARG DENO_VERSION=2.5.4
ARG BIN_IMAGE=denoland/deno:bin-${DENO_VERSION}

# Stage: get the Deno binary
FROM ${BIN_IMAGE} AS bin

# Stage: get tini
FROM buildpack-deps:22.04-curl AS tini
ARG TINI_VERSION=0.19.0
ARG TARGETARCH
RUN curl -fsSL https://github.com/krallin/tini/releases/download/v${TINI_VERSION}/tini-${TARGETARCH} \
    --output /tini \
  && chmod +x /tini

# Stage: builder
FROM debian:bookworm-slim AS builder
WORKDIR /app
ENV DENO_DIR=/deno-dir
RUN mkdir -p "$DENO_DIR"

# Copy Deno binary into builder
COPY --from=bin /deno /bin/deno

# Copy dependency manifests first for better layer caching
COPY deno.json import_map.json ./

# Cache dependencies before copying source (cache survives source changes)
RUN --mount=type=cache,target=/tmp/deno-cache bash -c "set -euo pipefail \
  && export DENO_DIR=/tmp/deno-cache \
  && /bin/deno cache --import-map=import_map.json main.ts || true"

# Copy rest of app
COPY . .

# Build and cache final deps
RUN --mount=type=cache,target=/tmp/deno-cache bash -c "set -euo pipefail \
  && export DENO_DIR=/tmp/deno-cache \
  && /bin/deno task build \
  && /bin/deno task cache \
  && mkdir -p /deno-dir \
  && rm -rf /deno-dir/* \
  && cp -a /tmp/deno-cache/. /deno-dir"

# Final runtime stage
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 1993 --user-group deno \
  && mkdir -p /deno-dir /app

ENV DENO_DIR=/deno-dir
ENV DENO_INSTALL_ROOT=/usr/local
ARG DENO_VERSION
ENV DENO_VERSION=${DENO_VERSION}

COPY --from=bin /deno /usr/bin/deno
COPY --from=tini /tini /tini
RUN chmod +x /usr/bin/deno /tini

COPY --chown=deno:deno --from=builder /app /app
COPY --chown=deno:deno --from=builder /deno-dir /deno-dir

WORKDIR /app
EXPOSE 3000

USER deno

ENTRYPOINT ["/tini", "--", "/usr/bin/deno"]
CMD ["task", "startnobuild"]
