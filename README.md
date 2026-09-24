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
2. Start MongoDB:
   ```bash
   docker compose up -d mongo
   ```
3. Start the server and web app:
   ```bash
   npm run dev
   ```
4. Open the client at `http://localhost:5173`.

The server listens on `http://localhost:3000`. By default it connects to `mongodb://127.0.0.1:27017/travel_game`; set `MONGO_URL` to use another MongoDB instance.

## Test z osobą przez internet

Uruchom `docker compose up --build`. Klient jest dostępny pod `http://localhost:5173`, a połączenia API i Socket.IO przechodzą przez ten sam adres. Do krótkiego testu możesz udostępnić jeden port na dwa sposoby:

- **Tunel:** zainstaluj `cloudflared`, uruchom `cloudflared tunnel --url http://localhost:5173` i wyślij drugiej osobie wygenerowany adres `https://…trycloudflare.com`. Tunel działa, dopóki działają kontenery i proces `cloudflared`.
- **Publiczne IP:** przekieruj w routerze port TCP `5173` na komputer z grą i wyślij adres `http://TWOJE_PUBLICZNE_IP:5173`. To wymaga publicznego adresu IP i reguły zapory zezwalającej na ten port.

Porty MongoDB i API w Docker Compose są dostępne tylko lokalnie. Udostępniony klient Vite jest przeznaczony do krótkich testów, nie do stałego hostowania.

## Konta i powrót do gry

Na stronie głównej można założyć konto z nazwą gracza i hasłem albo zalogować się do istniejącego konta. Po zalogowaniu przycisk **Wróć do gry** prowadzi do aktywnego pokoju. Odświeżenie strony i chwilowa utrata połączenia powodują automatyczną próbę ponownego dołączenia. Gra bez konta nadal działa w tej samej przeglądarce dzięki zapisanemu tokenowi sesji.

Konta, pokoje i stan gry są przechowywane w MongoDB. Kontener `mongo` w Docker Compose używa trwałego wolumenu `mongo-data`, więc restart serwera nie usuwa rozgrywki. Hasła są zapisywane jako skróty, a nie w postaci jawnej.

Przycisk **Opuść pokój** w poczekalni lub **Opuść grę** podczas rozgrywki usuwa bieżące powiązanie z pokojem i przenosi na stronę główną. Pusty pokój w poczekalni jest usuwany. W grze dwuosobowej odejście gracza kończy partię zwycięstwem drugiego; przy większej liczbie graczy rozgrywka trwa dalej.

## Zasady ruchu i terenów

Rozmiar mapy określa rozmiar pojedynczego heksagonalnego **płatka**. Domyślnie mapa ma 3 płatki, a gospodarz może wybrać od 1 do 12. Generator łączy je długimi bokami w nieregularny łańcuch: jeden płatek styka się najwyżej z dwoma innymi. Start i cel leżą na końcowych płatkach; wewnątrz łańcucha pozostaje kilka możliwych tras przez pola.

W poczekalni wszyscy gracze widzą podgląd kształtu wygenerowanej mapy. Podgląd rozróżnia płatki, ale nie pokazuje typów terenów, kosztów ani położenia celu. Zmienia się po aktualizacji ustawień mapy.

W poczekalni można wybrać mgłę wojny:

| Tryb               | Widoczność                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Brak               | Cała mapa, typy pól i koszty.                                                                 |
| Płatek             | Zarys całej mapy; typy i koszty tylko na płatku, na którym stoi gracz.                        |
| Średnia dynamiczna | Typy i koszty do 2 pól od gracza; na odległości 3–4 tylko typy. Reszta mapy jest niewidoczna. |
| Pełna dynamiczna   | Typy i koszty pól sąsiednich; na odległości 2 tylko typy. Reszta mapy jest niewidoczna.       |

Widoczność jest liczona osobno dla każdego gracza i przesuwa się wraz z nim. W trybach dynamicznych wcześniej widziane, ale obecnie odległe pola są ponownie zakrywane.

W swojej turze gracz może zagrać kartę dla punktów ruchu **albo** zamienić ją na złoto. Moneta zamieniona na złoto daje **2 sztuki**, każda inna karta daje **1 sztukę**. Ta sama karta nie może dać jednocześnie ruchu i złota. Złoto służy do zakupów na rynku; żółte punkty służą do ruchu i są od złota niezależne.

Gracz może wejść tylko na sąsiednie pole. Liczba na polu oznacza koszt **wejścia**; ruch zużywa tyle punktów, ile wynosi ten koszt. Zielone punkty służą do wejścia do dżungli, niebieskie do wody, a żółte do wioski. Punkty uniwersalne mogą zastąpić wymagany kolor. Na pola wymagające dowolnego koloru można wydać punkty dowolnego rodzaju.

Podczas tworzenia pokoju gospodarz może wyłączyć możliwość stawania na polu zajętym przez innego gracza. Domyślnie kilku graczy może stać na tym samym polu; gospodarz może zmienić tę zasadę także w poczekalni, przed rozpoczęciem gry.

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

Zakup karty na rynku wymaga tylko złota. W jednej turze można kupić **jedną kartę**. Kupiona karta trafia na stos odrzuconych. Po zakończeniu tury zagrane karty trafiają na stos odrzuconych, a **niezagrane pozostają na ręce**. Na początku kolejnej tury gracz dobiera karty do stanu 4 na ręce. Niewykorzystane punkty ruchu i złoto przepadają po zakończeniu tury.

Na rynku na początku gry pojawiają się cztery losowe, różne karty. Po każdym zakupie sprzedana oferta znika, a serwer dobiera następną, dzięki czemu na rynku stale są cztery oferty. Po wykorzystaniu puli dostępnych rodzajów kart pula jest tasowana ponownie. Do kart dostępnych na rynku należą także **Doświadczony żeglarz** (+2 niebieskie punkty ruchu, koszt 4) i **Mistrz kupiecki** (+3 żółte punkty ruchu, koszt 5).

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
