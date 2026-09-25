FROM node:22-alpine

WORKDIR /app

# Copy monorepo structure
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY apps/web/tsconfig*.json ./

ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN npm ci && \
    npm run build --workspace=@travel-game/web

EXPOSE 8080

CMD ["npm", "run", "start", "--workspace=@travel-game/web"]
