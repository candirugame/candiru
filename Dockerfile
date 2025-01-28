# Build stage
FROM denoland/deno:2.1.2 AS builder
WORKDIR /app

# Copy all source files
COPY . .

# Cache dependencies
RUN deno cache --import-map=import_map.json main.ts

# Build the application
RUN deno task build

# Runtime stage
FROM denoland/deno:2.1.2
WORKDIR /app

# Install curl for runtime
USER root
RUN apt-get update && apt-get install -y curl

# Copy ALL source files and build artifacts
COPY --from=builder /app/ ./

# Copy the Deno cache
COPY --from=builder /deno-dir/ /deno-dir/

# Set permissions
RUN chown -R deno:deno /app

USER deno
EXPOSE 3000
CMD ["task", "startnobuild"]
