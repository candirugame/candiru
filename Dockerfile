FROM denoland/deno:2.0.5
LABEL authors="Candiru <team@candiru.xyz>"

# Set working directory
WORKDIR /app

# Install curl
USER root
RUN apt-get update && apt-get install -y curl

# Copy the project files
COPY . .

# Ensure the deno user has ownership of the necessary files and directories
RUN chown -R deno:deno /app

# Switch back to deno user
USER deno

# Expose the port
EXPOSE 3000

# Run the task
CMD ["task", "start"]
