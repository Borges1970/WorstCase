# Use Node 20 LTS as base
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files for both client and server
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies for both client and server
RUN cd client && npm install
RUN cd server && npm install

# Copy all source files
COPY . .

# Build the React client
RUN cd client && npm run build

# Set working directory to server
WORKDIR /app/server

# Expose port
EXPOSE 4000

# Start the server
CMD ["node", "server.js"]