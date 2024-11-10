FROM denoland/deno:2.0.5
LABEL authors="isaacthoman"

# Set working directory
WORKDIR /app

# Install curl
USER root
RUN apt-get update && apt-get install -y curl  # or wget, depending on what you want

# Change ownership of /app to the deno user
RUN chown -R deno:deno /app

# Switch back to deno user
USER deno

# Copy the project files
COPY . .

# Expose the port
EXPOSE 3000

# Run the task
CMD ["task", "start"]