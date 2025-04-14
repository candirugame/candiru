# Build stage (unchanged)
FROM denoland/deno:2.2.9 AS builder
WORKDIR /app
COPY . .
RUN deno task build
RUN deno compile \
  --allow-read --allow-write --allow-net --allow-env \
  --include dist/ --output candiru main.ts

# Runtime stage (updated)
FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/candiru .
EXPOSE 3000
CMD ["/app/candiru", "--v8-flags=--optimize-for-memory,--max-old-space-size=128"]
