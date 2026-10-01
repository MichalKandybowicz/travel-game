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

Na stronie głównej wpisz nazwę gracza i kliknij **Utwórz pokój**. Pokój powstanie od razu z domyślnymi ustawieniami, a mapa i zasady można zmienić w poczekalni przed rozpoczęciem gry.

Przycisk **Zobacz wszystkie karty i runy** na stronie głównej otwiera katalog z opisami wszystkich dostępnych kart i run. Karty można filtrować według rodzaju ruchu, zaklęć i klątw, a runy według ruchu, złota, efektów specjalnych i klątw.

The server listens on `http://localhost:3000`. By default it connects to `mongodb://127.0.0.1:27017/travel_game`; set `MONGO_URL` to use another MongoDB instance.

### Dodawanie kart podczas testów

Po uruchomieniu przez `npm run dev` dołącz do rozpoczętej gry i otwórz konsolę przeglądarki. Dostępne są komendy:

```js
travelGameDev.listCards() // lista kart z numerami
await travelGameDev.addCard(1) // dodaje kartę nr 1 na Twoją rękę
```

Można tak dodać każdą grywalną kartę, również zaklęcie lub klątwę. Numer bierze się z kolumny `number` w wyniku `listCards()`. Nadal działa też tekstowe ID, np. `addCard('explorer')`. Komenda działa tylko w trybie `dev`; serwer odrzuca ją przy zwykłym uruchomieniu gry.

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

Rozmiar krawędzi segmentu określa długość każdej strony heksagonalnego **płatka**: od 5 do 9 pól, domyślnie 7. Domyślnie mapa ma 3 płatki, a gospodarz może wybrać od 1 do 12. Generator łączy je długimi bokami w nieregularny łańcuch: jeden płatek styka się najwyżej z dwoma innymi. Start i cel leżą na końcowych płatkach; wewnątrz łańcucha pozostaje kilka możliwych tras przez pola.

W poczekalni wszyscy gracze widzą podgląd kształtu wygenerowanej mapy. Podgląd rozróżnia płatki, ale nie pokazuje typów terenów, kosztów ani położenia celu. Zmienia się po aktualizacji ustawień mapy.

W poczekalni **Ustawienia gry** są nad graczami i mapą. Można tam włączyć przenikanie graczy oraz mgłę wojny. Po włączeniu mgły samodzielnie ustawia się zasięg widoczności **typu pola** na 2–6 heksów lub całą planszę oraz zasięg widoczności **kosztu wejścia** na 1–4 heksy lub całą planszę. Widoczność kosztu odkrywa również typ pola, jeśli jej zasięg jest większy. Podgląd kształtu i **Ustawienia mapy** są w jednym panelu obok listy graczy. Przycisk **Rozpocznij grę** znajduje się obok **Opuść pokój**.

Przy włączonej mgle nieznane pola pozostają na mapie jako szare heksy ze znakiem **?**. Znany typ pola z ukrytym kosztem pokazuje **?** zamiast kosztu. Widoczność jest liczona osobno dla każdego gracza i przesuwa się wraz z pionkiem; odległe pola ponownie się zasłaniają.

W swojej turze gracz może zagrać kartę dla punktów ruchu **albo** zamienić ją na złoto. Liczba punktów ruchu i złota wynika z wartości zapisanych na danej karcie; interfejs tworzy opisy z tych samych danych. Ta sama karta nie może dać jednocześnie ruchu i złota. Złoto służy do zakupów na rynku; żółte punkty służą do ruchu i są od złota niezależne.

Każda karta na ręce ma opis i przycisk **Użyj**. Otwiera on okno z możliwymi sposobami zagrania: ruchem albo akcją specjalną oraz wymianą na złoto. Przy każdym wyborze widać efekt i informację, czy karta wróci po przetasowaniu. Przycisk **Runy** otwiera podobne okno z opisami dostępnych run; runa klątwy pozwala tam wskazać przeciwnika.

Karty zaklęć i klątw można **użyć i usunąć** albo **wymienić na 1 złoto**. Wymieniona karta trafia po turze na stos odrzuconych i wraca do talii przy przetasowaniu; użycie efektu usuwa ją z gry. W jednej turze można użyć kilku zaklęć i klątw, jeśli są na ręce.

Gracz może wejść tylko na sąsiednie pole. Liczba na polu oznacza koszt **wejścia**; ruch zużywa tyle punktów, ile wynosi ten koszt. Zielone punkty służą do wejścia do dżungli, niebieskie do wody, a żółte na pustyni. Punkty uniwersalne mogą zastąpić wymagany kolor. Na pola wymagające dowolnego koloru można wydać punkty dowolnego rodzaju. Jeśli dostępnych jest kilka rodzajów punktów, gracz wybiera, które z nich wydać; może połączyć różne rodzaje w jednej płatności.

Mapę można przesuwać przeciąganiem myszą, a przybliżać i oddalać kółkiem myszy. Przyciski kierunkowe i skali pozostają dostępne.

Kliknięcie pola, na które nie można teraz wejść, otwiera informacje o terenie, znanym koszcie pola i koszcie przejścia z aktualnej pozycji, powodzie niedostępności oraz możliwych działaniach. Nieodkryte typy i koszty pozostają ukryte również w tym oknie.

Cała krawędź pierwszego płatka przeciwna do sąsiedniego płatka stanowi **pola startowe** — na mapie generowanej automatycznie dostępnych jest od 5 do 9 miejsc, zależnie od wybranego rozmiaru. W kreatorze własnej mapy wymagane są co najmniej 4 pola startowe; można dodać więcej. Po uruchomieniu gry gracze widzą swoją początkową rękę i wybierają wolne pola kolejno, w kolejności z poczekalni. Przed wyborem widoczność typów i kosztów jest liczona od każdego dostępnego pola startowego według ustawionych zasięgów; pozostałe pola nie odsłaniają się automatycznie. Można kliknąć pole na mapie lub przycisk nad nią. Ostatni wybierający wykonuje pierwszą turę; dalsza kolejność tur jest odwrotna do kolejności wyboru pól.

Licznik **Runda** zmienia się dopiero po turze wszystkich graczy. **Ruch X z Y** pokazuje, który gracz wykonuje teraz swoją turę w bieżącej rundzie.

Podczas tworzenia pokoju gospodarz może wyłączyć możliwość stawania na polu zajętym przez innego gracza. Domyślnie kilku graczy może stać na tym samym polu; gospodarz może zmienić tę zasadę także w poczekalni, przed rozpoczęciem gry. Limit graczy i botów odpowiada liczbie pól startowych aktualnej mapy. Zmiana mapy lub rozmiaru nie może zmniejszyć liczby startów poniżej liczby osób w pokoju.

| Teren     | Koszt wejścia                                  | Efekt                                                         |
| --------- | ---------------------------------------------- | ------------------------------------------------------------- |
| Dżungla   | 1–4 zielone lub uniwersalne punkty             | Brak dodatkowego efektu.                                      |
| Woda      | 1–3 niebieskie lub uniwersalne punkty          | Brak dodatkowego efektu.                                      |
| Pustynia  | 1–4 żółte lub uniwersalne punkty               | Brak dodatkowego efektu.                                      |
| Rumowisko | 2–4 punkty dowolnego koloru                    | Brak dodatkowego efektu.                                      |
| Krąg run  | 1–5 punktów dowolnego koloru                   | Przy pierwszym wejściu wybierasz jedną z trzech losowych run. |
| Góry      | Nie można wejść                                | Pole zablokowane.                                             |
| Start     | 1 punkt dowolnego koloru przy ponownym wejściu | Jedno z pól początkowych, wybieranych przed pierwszą turą.    |
| Cel       | 1 punkt dowolnego koloru                       | Wejście kończy grę zwycięstwem.                               |

Generator tworzy góry w połączonych grupach po 3–5 pól. Rzeki biegną od pól sąsiadujących z górami do zewnętrznej krawędzi mapy, a pozostała woda tworzy zwarte jeziora. Kręgi run nie zajmują środkowego pola płatka i leżą co najmniej ¼ promienia płatka od jego krawędzi; między każdą parą są co najmniej 3 pełne heksy (odległość co najmniej 4). Pola początkowe i końcowe oraz wyznaczone trasy nie są blokowane górami.

Zakup karty na rynku wymaga tylko złota. W jednej turze można kupić **jedną kartę**. Kupiona karta od razu trafia na rękę i można ją zagrać jeszcze w tej samej turze. Po zakończeniu tury zagrane karty trafiają na stos odrzuconych, a **niezagrane pozostają na ręce**. Gracz od razu dobiera karty do stanu **5 na ręce**, więc ma nową rękę także podczas tur przeciwników i może stracić kartę wskutek klątwy. Na początku gry również dobiera 5 kart. Niewykorzystane punkty ruchu i złoto przepadają po zakończeniu tury.

Talia startowa zawiera **4 Odkrywców** (zielone), **3 Monety** (żółte), **2 Żeglarzy** (niebieskie) i **1 Iskrę wędrowca** (uniwersalna: 1 ruchu albo 1 złoto), łącznie 10 kart. Na początku gracz dobiera 5 kart.

Na rynku na początku gry pojawiają się cztery losowe, różne karty. Po każdym zakupie sprzedana oferta znika, a serwer dobiera następną, dzięki czemu na rynku stale są cztery oferty. Po wykorzystaniu puli dostępnych rodzajów kart pula jest tasowana ponownie. Wśród mocniejszych kart są **Przewodnik**, **Kapitan**, **Karawana** i **Pionier**. Ich ruch, wartość w złocie i cena są pokazywane na podstawie aktualnych definicji kart.

W sklepie są też karty mieszane: las i woda, las i pustynia oraz pustynia i woda, każda w dwóch poziomach mocy. Zagrana na ruch karta mieszana dodaje punkty obu kolorów; zagrana na złoto daje tylko wskazaną wartość złota.

Wszystkie karty kosztują o 1 złoto mniej. Druidka, Zaklinacz fal i Kupiec piasków kosztują po **3 złota**, a Pustynny biegacz **4 złota**. Ochronny krąg kosztuje **5 złota**, a klątwy **3–9 złota**, zależnie od efektu.

Przycisk **Otwórz sklep** pokazuje okno z czterema kartami, ich cenami i aktualną ilością złota gracza. Karty, których nie można teraz kupić, są oznaczone jako niedostępne.

Runy ruchu i złota mają teraz wartości **+2, +3 albo +4**. W jednej rundzie można użyć jednej runy.
Po pierwszym wejściu do kręgu run pojawia się losowy opis wydarzenia i wybór jednej z trzech różnych, losowych run. Podczas wyboru mapa pozostaje widoczna i można ją przesuwać oraz przybliżać, aby sprawdzić teren przed podjęciem decyzji. Oferta czeka na decyzję gracza również po odświeżeniu strony. Bot wybiera jedną z oferowanych run automatycznie.
Karta **Zamiana losu** i runa wymiany ręki odrzucają wskazane karty i dobierają **5 kart**, także gdy przed wymianą na ręce były cztery karty.
Po użyciu **Eliksiru odnowy** wartości i opisy kart pozostają widoczne podczas wyboru karty do odrzucenia. Odrzucenie wybiera się na ilustracji karty.

## Klątwy i ochrona

**Pieczęć pola** kosztuje 9 złota. Po zagraniu wybierz na mapie puste, dostępne pole w odległości do 2 heksów od swojego pionka. Pole pozostaje zablokowane dla wszystkich do początku twojej następnej tury. Nie można wybrać pola startu, celu, góry ani pola zajętego przez pionek.

Po zagraniu klątwy pojawia się powiadomienie z jej nazwą, dokładnym opisem działania i krótkim efektem wizualnym między graczem rzucającym a celem. Klątwa sklepu wskazuje sklep; zablokowana klątwa pokazuje efekt ochrony. Krąg wędrowców pokazuje pozostałych graczy oraz nazwy i dokładne działanie ich aktywnych klątw i ochrony. Własne efekty widać obok punktów ruchu i złota nad ręką. Na mapie dodatkowy koszt następnego przejścia oznacza fioletowe **+1** przy wyjściach z pola gracza; opis nad mapą wyjaśnia też ukrycie kosztów i blokadę pola. Informacje znikają, gdy odpowiadający im efekt zostanie wykorzystany lub wygaśnie.

Klątwa podnosząca koszt ruchu działa do następnego udanego przejścia. Bot uwzględnia ten dodatkowy punkt przy wyborze kart, run i trasy; jeśli w danej turze nie ma wystarczających zasobów, efekt pozostaje aktywny.

Bot porównuje dostępne pola startowe według przewidywanego kosztu drogi, terenów i kart w swojej talii. Trasę przelicza po każdym ruchu. Korzysta z odkrytych pól i kosztów oraz publicznego kształtu mapy; zakrytym polom przypisuje szacunkowy koszt, bez odczytywania ich ukrytego terenu. Gdy cel jest zakryty, kieruje się ku końcowi ostatniego segmentu, a po jego odkryciu planuje drogę do dokładnego pola celu.

## Docker

```bash
docker compose up --build
```
