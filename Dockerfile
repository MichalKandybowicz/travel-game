# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy monorepo structure
COPY package*.json ./
COPY packages ./packages
COPY apps/web ./apps/web

# Build web app only
RUN npm ci && \
    npm run build --workspace=@travel-game/web

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Install http-server for serving static files
RUN npm install -g http-server

# Copy built files from builder
COPY --from=builder /app/apps/web/dist ./public

EXPOSE 8080

CMD ["http-server", "public", "-p", "8080", "--gzip", "-c-1"]

