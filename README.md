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

## Zasady ruchu i terenów

W swojej turze gracz zagrywa karty z ręki, aby otrzymać punkty ruchu. Może wejść tylko na sąsiednie pole. Liczba na polu oznacza koszt **wejścia**; ruch zużywa tyle punktów, ile wynosi ten koszt. Zielone punkty służą do wejścia do dżungli, niebieskie do wody, a żółte do wioski. Punkty uniwersalne mogą zastąpić wymagany kolor. Na pola wymagające dowolnego koloru można wydać punkty dowolnego rodzaju. Zagranie żółtej karty daje również złoto; wydanie żółtych punktów na ruch zmniejsza dostępną ilość złota.

| Teren     | Koszt wejścia                                     | Efekt                                                                  |
| --------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Dżungla   | Liczba na polu, zielone lub uniwersalne punkty    | Brak dodatkowego efektu.                                               |
| Woda      | Liczba na polu, niebieskie lub uniwersalne punkty | Brak dodatkowego efektu.                                               |
| Wioska    | Liczba na polu, żółte lub uniwersalne punkty      | Brak dodatkowego efektu.                                               |
| Rumowisko | Liczba na polu (1–3), punkty dowolnego koloru     | Brak dodatkowego efektu.                                               |
| Obóz      | 1 punkt dowolnego koloru                          | Obecnie brak dodatkowego efektu. Usuwanie kart z talii jest planowane. |
| Góry      | Nie można wejść                                   | Pole zablokowane.                                                      |
| Start     | 1 punkt dowolnego koloru przy ponownym wejściu    | Miejsce początkowe graczy.                                             |
| Cel       | 1 punkt dowolnego koloru                          | Wejście kończy grę zwycięstwem.                                        |

Zakup karty na rynku wymaga żółtych punktów ruchu i odpowiadającej im ilości złota. Kupiona karta trafia na stos odrzuconych. Niewykorzystane punkty ruchu i złoto przepadają po zakończeniu tury.

Na rynku na początku gry pojawiają się cztery losowe, różne karty. Po każdym zakupie sprzedana oferta znika, a serwer dobiera następną, dzięki czemu na rynku stale są cztery oferty. Po wykorzystaniu puli dostępnych rodzajów kart pula jest tasowana ponownie. Do kart dostępnych na rynku należą także **Doświadczony żeglarz** (+2 niebieskie punkty ruchu, koszt 4) i **Mistrz kupiecki** (+3 żółte punkty ruchu oraz 3 sztuki złota, koszt 5).

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
