# Define Deno version (using the version from your current Dockerfile)
ARG DENO_VERSION=2.4.2
ARG BIN_IMAGE=denoland/deno:bin-${DENO_VERSION}

# Stage to get the Deno binary
FROM ${BIN_IMAGE} AS bin

# Stage to get tini init system
FROM buildpack-deps:20.04-curl AS tini
ARG TINI_VERSION=0.19.0
ARG TARGETARCH
# Download tini for the target architecture
RUN curl -fsSL https://github.com/krallin/tini/releases/download/v${TINI_VERSION}/tini-${TARGETARCH} \
    --output /tini \
  && chmod +x /tini

# Final runtime stage using distroless/cc for a minimal image
FROM gcr.io/distroless/cc

# Set the working directory inside the container
WORKDIR /app

# Set Deno environment variables
ENV DENO_DIR=/deno-dir/
ENV DENO_INSTALL_ROOT=/usr/local
ARG DENO_VERSION
ENV DENO_VERSION=${DENO_VERSION}

# Copy the Deno binary from the 'bin' stage
COPY --from=bin /deno /bin/deno

# Copy tini from the 'tini' stage
COPY --from=tini /tini /tini

# Copy Deno configuration files
COPY deno.json .
COPY import_map.json .

# Copy the rest of your application source code
COPY . .

RUN ["/bin/deno", "task", "build"]

# Cache application dependencies using Deno
# This step downloads and caches the modules needed by main.ts
# Use exec form because distroless doesn't have /bin/sh
#RUN ["/bin/deno", "cache", "main.ts"]
RUN ["/bin/deno", "task", "cache"]

# Expose the port your application listens on
EXPOSE 3000

# Set the entrypoint to run Deno via tini
# tini handles signal forwarding and zombie reaping
ENTRYPOINT ["/tini", "--", "/bin/deno"]

# Set the default command to run your main application file
# Includes the necessary permissions based on your 'start' task in deno.json
CMD ["run", "--allow-read", "--allow-env", "--allow-net", "--allow-write", "main.ts"]
