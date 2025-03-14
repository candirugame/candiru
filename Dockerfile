# Build stage
FROM denoland/deno:2.2.3 AS builder
WORKDIR /app
COPY . .
# Pre-download all npm dependencies
RUN deno cache --node-modules-dir npm:vite npm:@deno/vite-plugin@^1.0.0
# Cache dependencies and build
RUN deno cache --import-map=import_map.json main.ts
RUN deno task build

# Production stage
FROM denoland/deno:alpine-2.2.3
WORKDIR /app
# Create node_modules with proper permissions
RUN mkdir -p /app/node_modules && chown -R deno:deno /app
# Copy only what's needed for runtime
COPY --from=builder --chown=deno:deno /app/main.ts ./
COPY --from=builder --chown=deno:deno /app/import_map.json ./
COPY --from=builder --chown=deno:deno /app/dist/ ./dist/
COPY --from=builder --chown=deno:deno /app/deno.json ./
# Copy node_modules directory
COPY --from=builder --chown=deno:deno /app/node_modules/ ./node_modules/
# Copy cache files
COPY --from=builder --chown=deno:deno /deno-dir/ /deno-dir/
USER deno
EXPOSE 3000
CMD ["task", "startnobuild"]
