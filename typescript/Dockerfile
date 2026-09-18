# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (dev deps are needed for esbuild/tsc)
RUN npm ci

# Copy source code (see .dockerignore for what is excluded)
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY --chown=node:node package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application from builder
COPY --chown=node:node --from=builder /app/dist ./dist

# Run as the unprivileged user shipped with the official Node image
USER node

# Expose port (default PORT in src/index.ts is 3000)
EXPOSE 3000

# Container-level health check against GET /health (wget ships with alpine)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/health" || exit 1

# Start the application
CMD ["node", "dist/index.js"]
