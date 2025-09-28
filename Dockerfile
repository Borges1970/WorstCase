# Multi-stage build for production
FROM node:20-alpine AS builder

# Build client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy server package files and install dependencies
COPY server/package*.json ./
RUN npm ci --only=production

# Copy server source
COPY server/ ./

# Copy built client from builder stage
COPY --from=builder /app/client/build ../client/build

# Copy data files
COPY data/ ../data/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the server
CMD ["node", "server.js"]