FROM denoland/deno:2.0.0
LABEL authors="isaacthoman"

# Set working directory
WORKDIR /app

# Install curl and git
USER root
RUN apt-get update && apt-get install -y curl git

# Change ownership of /app to the deno user
RUN chown -R deno:deno /app

# Switch back to deno user
USER deno

# Copy the project files
COPY . .

# Expose the port
EXPOSE 3000

# Run the generate-version task before the start task
CMD ["deno", "task", "generate-version"]