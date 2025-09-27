# Use Node 20 LTS as base
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json first for caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Expose port
EXPOSE 3000

# Start React dev server
CMD ["npm", "start"]
