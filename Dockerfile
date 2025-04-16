# Build stage
FROM denoland/deno:2.2.6 AS builder
WORKDIR /app
COPY . .
RUN deno task build
# Ensure the compile target matches your deployment architecture
RUN deno compile \
  --target x86_64-unknown-linux-gnu \
  --allow-read --allow-write --allow-net --allow-env \
  --include dist/ --output candiru main.ts

# Runtime stage (Distroless)
# Using cc-debian12 as it includes glibc needed by the compiled binary
FROM gcr.io/distroless/cc-debian12

# Set working directory to /tmp, which is writable by nonroot
WORKDIR /tmp

# Copy the application binary into /tmp AND set its ownership
# Format is --chown=UID:GID
COPY --from=builder --chown=65532:65532 /app/candiru .

# Optionally add MALLOC_ARENA_MAX if needed (glibc is still used)
ENV MALLOC_ARENA_MAX=2

EXPOSE 3000

# Switch to the non-root user
USER 65532:65532

# Execute the binary from the /tmp directory
CMD ["/tmp/candiru"]
