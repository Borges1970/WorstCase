# Use Node 20 LTS as base
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files for client first
COPY client/package*.json ./client/

# Install client dependencies
WORKDIR /app/client
RUN npm install

# Copy client source and build
COPY client/ ./
RUN npm run build

# Switch to app root and copy server files
WORKDIR /app
COPY server/package*.json ./server/

# Install server dependencies
WORKDIR /app/server
RUN npm install

# Copy server source and data
COPY server/ ./
COPY data/ ../data/

# Expose port
EXPOSE 4000

# Start the server
CMD ["node", "server.js"]