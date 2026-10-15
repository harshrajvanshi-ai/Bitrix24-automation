# Node.js 20 Alpine Base Image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source
COPY . .

# Ensure storage directory exists with proper permissions
RUN mkdir -p storage config public views src

# Expose port
EXPOSE 3000

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Start server
CMD ["node", "server.js"]
