# Stage 1: Build the Deno application
# Use a specific Deno version matching your initial attempt for consistency
FROM denoland/deno:2.2.6 AS builder
WORKDIR /app
COPY . .
# Assuming you have 'build' and 'start' tasks in deno.json
# 'build' likely prepares static assets (like your original 'dist/')
# 'start' should define how to run the main script (e.g., "deno run --allow... main.ts")
RUN deno task build
RUN deno compile \
  --allow-read --allow-write --allow-net --allow-env \
  --target x86_64-unknown-linux-gnu \
  --include dist/ --output candiru main.ts # Include built assets if needed

# Stage 2: Build mimalloc from source for compatibility
# Using Debian slim as a base for build tools
FROM debian:bookworm-slim AS mimalloc_builder
# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    make \
    g++ \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Clone and build mimalloc (use a specific stable tag for reproducibility)
ARG MIMALLOC_VERSION=v2.1.7
RUN git clone --depth 1 --branch ${MIMALLOC_VERSION} https://github.com/microsoft/mimalloc.git /mimalloc_src
WORKDIR /mimalloc_src
RUN mkdir -p out/release
WORKDIR /mimalloc_src/out/release
# Build the secure, static version for production use
# MI_BUILD_STATIC=ON helps avoid potential runtime library issues
# MI_SECURE=ON enables security mitigations
RUN cmake ../.. -DCMAKE_BUILD_TYPE=Release -DMI_BUILD_STATIC=ON -DMI_SECURE=ON
RUN make

# Stage 3: Final runtime image
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime dependencies (ca-certificates for HTTPS, etc.)
# libgcc and libstdc++ should be present, but explicitly adding doesn't hurt
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libgcc1 \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Copy mimalloc library from the builder stage
# Copy the specific version built (e.g., libmimalloc-secure.so.2.1)
# Adjust the exact filename based on the MIMALLOC_VERSION used
COPY --from=mimalloc_builder /mimalloc_src/out/release/libmimalloc-secure.so.2.1 /usr/local/lib/
# Create a symlink for the major version .so.2
RUN ln -s /usr/local/lib/libmimalloc-secure.so.2.1 /usr/local/lib/libmimalloc-secure.so.2

# Copy the compiled application binary from the first stage
COPY --from=builder /app/candiru .

# Ensure the application is executable
RUN chmod +x /app/candiru

# Preload the mimalloc library
# Use the major version symlink for LD_PRELOAD
ENV LD_PRELOAD=/usr/local/lib/libmimalloc-secure.so.2

EXPOSE 3000
# Run the compiled application
CMD ["/app/candiru"]
