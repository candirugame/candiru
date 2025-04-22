# Build stage (unchanged)
FROM denoland/deno:2.2.6 AS builder
WORKDIR /app
COPY . .
RUN deno task build
RUN deno compile \
  --allow-read --allow-write --allow-net --allow-env \
  --target x86_64-unknown-linux-gnu \
  --include dist/ --output candiru main.ts

# Runtime stage (Debian + jemalloc - Explicit Platform - WITH MALLOC_CONF)
FROM debian:bookworm-slim
WORKDIR /app
# Install jemalloc
RUN apt-get update && apt-get install -y libjemalloc2 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/candiru .
EXPOSE 3000
# Ensure executable
RUN chmod +x /app/candiru
# Preload jemalloc
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
# Configure jemalloc: aggressive return + limited arenas + background thread
ENV MALLOC_CONF="dirty_decay_ms:0,muzzy_decay_ms:0,narenas:2,background_thread:true"
CMD ["/app/candiru"]