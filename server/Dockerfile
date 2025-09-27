# Use Node 20 LTS as base
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json first for caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Files will be mounted via volume in docker-compose

# Expose port
EXPOSE 4000

# Start server with nodemon for dev-friendly auto-reload
CMD ["npx", "nodemon", "server.js"]
