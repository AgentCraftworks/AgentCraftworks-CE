# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY typescript/package.json ./typescript/package.json

# Install dependencies
RUN npm ci

COPY typescript ./typescript

# Build the application
RUN npm run build --workspace=typescript

# Production stage
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY typescript/package.json ./typescript/package.json

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/typescript/dist ./typescript/dist

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "typescript/dist/index.js"]
