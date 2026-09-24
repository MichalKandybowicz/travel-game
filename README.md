# travel-game

Travel Game is an original online turn-based deck-building racing game MVP built as a TypeScript monorepo.

## Stack

- Node.js + TypeScript
- Fastify + Socket.IO
- React + Vite + SVG
- Zod for shared validation
- Vitest for unit tests
- ESLint + Prettier
- Docker Compose for local multi-service startup

## Repository structure

```text
apps/
  server/        Fastify + Socket.IO authoritative server
  web/           React + Vite client
packages/
  shared/        Shared types, cards, schemas, events
  game-engine/   Pure turn, deck, movement, and market logic
  map-generator/ Deterministic seeded hex map generation
```

## Scripts

```bash
npm install
npm run dev
npm run build
npm run test
npm run lint
```

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server and web app:
   ```bash
   npm run dev
   ```
3. Open the client at `http://localhost:5173`.

The server listens on `http://localhost:3000`.

## Docker

```bash
docker compose up --build
```

## MVP features implemented

- Room creation and join by room code
- Lobby with map settings editing by the host
- Deterministic seeded procedural hex map generation
- Map validation and analysis statistics
- Server-authoritative multiplayer turn flow over Socket.IO
- Shared market, deck shuffling, drawing, playing cards, movement, buying, and turn rotation
- Winner detection on reaching the goal
- Reconnection using a persisted session token
- SVG hex map with hover, selection, reachable highlight, zoom, pan, and player tokens

## Recommended next tasks

1. Add explicit ready states and host-side ready checks before starting.
2. Implement optional camp deck-trashing interactions in the UI.
3. Add bots and solo practice rooms.
4. Add richer market rules, supply piles, and more card abilities.
5. Add persistence for daily challenges, rankings, and resumable matches.
