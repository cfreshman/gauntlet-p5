# Build stage
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build web client
WORKDIR /app/web-client
COPY web-client/package*.json ./
RUN npm ci
COPY web-client .
RUN npm run build

# Production stage
FROM node:20-slim

# Set environment
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built web client and server code
COPY --from=builder /app/web-client/dist ./web-client/dist
COPY src ./src

# Create log directory
RUN mkdir -p logs

# Expose ports
EXPOSE 3000 3014 5907

# Start all services
CMD ["npm", "run", "web:with-mcp"] 