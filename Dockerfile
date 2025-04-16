# Build stage (remains the same)
FROM denoland/deno:2.2.6 AS builder
WORKDIR /app
COPY . .
RUN deno task build
RUN deno compile \
  --allow-read --allow-write --allow-net --allow-env \
  --include dist/ --output candiru main.ts

# Runtime stage (Debian with tuned jemalloc for x86_64)
FROM debian:bookworm-slim

# Install jemalloc
RUN apt-get update && \
    apt-get install -y libjemalloc2 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/candiru .

# Set LD_PRELOAD to use jemalloc
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Tune jemalloc to release memory more aggressively
# dirty_decay_ms: Time (ms) to hold unused dirty pages before purging. 0 = purge immediately.
# muzzy_decay_ms: Time (ms) to hold unused muzzy pages before purging. 0 = purge immediately.
ENV MALLOC_CONF=dirty_decay_ms:0,muzzy_decay_ms:0

EXPOSE 3000
CMD ["/app/candiru"]
