# Build stage
FROM denoland/deno:2.2.3 AS builder
WORKDIR /app
COPY . .
# Cache the dependencies
RUN deno cache main.ts

# Production stage
FROM denoland/deno:2.2.3
WORKDIR /app
# Set the DENO_DIR environment variable
ENV DENO_DIR=/app/.deno
# Copy application files
COPY --from=builder --chown=deno:deno /app .
# Copy the Deno cache directory specifically
COPY --from=builder --chown=deno:deno /deno-dir /app/.deno
# Run the application
USER deno
EXPOSE 3000
CMD ["deno", "run", "--allow-all", "main.ts"]