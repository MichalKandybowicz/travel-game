FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server

RUN npm ci && npm run build --workspace=@travel-game/server

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=@travel-game/server"]
