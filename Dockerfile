# Build stage
FROM denoland/deno:2.2.3 AS builder
WORKDIR /app
COPY . .
RUN deno cache --import-map=import_map.json main.ts
RUN deno task build

# Runtime stage
FROM denoland/deno:alpine-2.2.3
WORKDIR /app
USER root
COPY --from=builder /app/ ./
COPY --from=builder /deno-dir/ /deno-dir/
RUN chown -R deno:deno /app
USER deno
EXPOSE 3000
CMD ["task", "startnobuild"]
