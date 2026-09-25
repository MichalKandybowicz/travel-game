FROM node:22-alpine

WORKDIR /app

# Copy monorepo structure
COPY package*.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY apps/web/tsconfig*.json ./

ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL

# Install and build only web
RUN npm ci && \
    npm run build --workspace=@travel-game/web

RUN npm install -g http-server

EXPOSE 8080

CMD ["sh", "-c", "http-server apps/web/dist -p \"${PORT:-8080}\" --gzip -c-1"]
