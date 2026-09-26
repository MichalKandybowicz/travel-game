import type { CardDefinition, MovementType, TerrainType } from '@shared'

export const movementLabels: Record<MovementType, string> = {
  GREEN: 'zielone',
  BLUE: 'niebieskie',
  YELLOW: 'żółte',
  WILD: 'dowolne',
}

const movementSingular: Record<MovementType, string> = {
  GREEN: 'zielony',
  BLUE: 'niebieski',
  YELLOW: 'żółty',
  WILD: 'dowolny',
}

const movementGenitive: Record<MovementType, string> = {
  GREEN: 'zielonych',
  BLUE: 'niebieskich',
  YELLOW: 'żółtych',
  WILD: 'dowolnych',
}

const usesNominativePlural = (value: number): boolean =>
  value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14)

export const movementUnitLabel = (
  type: MovementType,
  value: number,
): string => {
  if (value === 1) return `${movementSingular[type]} punkt ruchu`
  if (usesNominativePlural(value)) {
    return `${movementLabels[type]} punkty ruchu`
  }
  return `${movementGenitive[type]} punktów ruchu`
}

export const terrainLabels: Record<TerrainType, string> = {
  UNKNOWN: 'Mgła tajemnic',
  START: 'Brama wyprawy',
  GOAL: 'Pradawny portal',
  JUNGLE: 'Zaklęty gaj',
  WATER: 'Kryształowe wody',
  DESERT: 'Złote pustkowia',
  RUBBLE: 'Starożytne ruiny',
  CAMP: 'Krąg mocy',
  MOUNTAIN: 'Góry runiczne',
}

export const cardLabels: Record<string, { name: string }> = {
  hidden: { name: 'Ukryta karta' },
  explorer: { name: 'Leśny adept' },
  herbalist: { name: 'Druidka' },
  scout: { name: 'Strażnik gaju' },
  ranger: { name: 'Łowca cieni' },
  pathfinder: { name: 'Arcydruid' },
  sailor: { name: 'Uczeń przypływu' },
  seasoned_sailor: { name: 'Zaklinacz fal' },
  navigator: { name: 'Astromanta' },
  captain: { name: 'Władca sztormu' },
  admiral: { name: 'Lewiatan' },
  coin: { name: 'Złota runa' },
  trader: { name: 'Alchemik' },
  treasurer: { name: 'Strażnik skarbca' },
  master_trader: { name: 'Mistrz transmutacji' },
  caravan: { name: 'Karawana cudów' },
  adventurer: { name: 'Wędrowny mag' },
  trailblazer: { name: 'Tkacz szlaków' },
  wayfarer: { name: 'Władca portali' },
  shortcut_map: { name: 'Zwój tajemnych przejść' },
  second_wind: { name: 'Eliksir odnowy' },
  merchant_caravan: { name: 'Widmowy bazar' },
  steal_plans: { name: 'Kradzież wspomnień' },
  guide: { name: 'Duch przewodnik' },
  phase_walk: { name: 'Widmowy krok' },
  reshuffle_hand: { name: 'Zamiana losu' },
  echo_power: { name: 'Echo mocy' },
  protective_circle: { name: 'Ochronny krąg' },
  path_fracture: { name: 'Pęknięcie szlaku' },
  fog_of_forgetting: { name: 'Mgła zapomnienia' },
  poverty_curse: { name: 'Klątwa ubóstwa' },
  tangled_roots: { name: 'Splątane korzenie' },
  closed_market: { name: 'Zamknięty bazar' },
}

export function cardDescription(card: CardDefinition): string {
  if (card.id === 'hidden') {
    return 'Karta innego gracza.'
  }
  if (card.type === 'ACTION') {
    const descriptions = {
      MAP_SHORTCUT:
        'Następny ruch może przeskoczyć przez jedno zablokowane pole.',
      SECOND_WIND: 'Dobierz dwie karty, a następnie odrzuć jedną z ręki.',
      MERCHANT_CARAVAN: 'Możesz kupić w tej turze drugą kartę.',
      STEAL_PLANS: 'Wybrany przeciwnik odrzuca losową kartę z ręki.',
      GUIDE: 'Następne sąsiednie przejście kosztuje 1 dowolnego ruchu.',
      PHASE_WALK:
        'Do końca tury możesz wchodzić na pola zajęte przez innych graczy.',
      RESHUFFLE_HAND: 'Odrzuć całą rękę i dobierz tyle samo kart.',
      ECHO_POWER: 'Skopiuj ostatnią zagraną kartę ruchu lub złota.',
      PROTECTIVE_CIRCLE: 'Ignoruj następną klątwę wymierzoną w ciebie.',
      PATH_FRACTURE: 'Wybrany gracz płaci o 1 więcej za następne przejście.',
      FOG_OF_FORGETTING:
        'Wybrany gracz nie widzi rozpoznanych kosztów do końca swojej tury.',
      POVERTY_CURSE: 'Wybrany gracz traci do 2 niewydanych sztuk złota.',
      TANGLED_ROOTS: 'Wybrany gracz nie może użyć skrótu w następnej turze.',
      CLOSED_MARKET: 'Blokuje zakupy wybranego gracza w jego następnej turze.',
    } as const
    return card.actionEffect
      ? descriptions[card.actionEffect]
      : 'Jednorazowa karta akcji.'
  }

  const movement = `${card.movementValue} ${movementUnitLabel(
    card.movementType,
    card.movementValue,
  )}`
  const gold =
    card.goldValue > 0
      ? ` albo ${card.goldValue} ${
          card.goldValue === 1
            ? 'sztukę'
            : usesNominativePlural(card.goldValue)
              ? 'sztuki'
              : 'sztuk'
        } złota`
      : ''

  return `Daje ${movement}${gold}.`
}

export const errorLabels: Record<string, string> = {
  NOT_YOUR_TURN: 'Teraz jest tura innego gracza.',
  INVALID_MOVE: 'Możesz przejść tylko na sąsiednie pole.',
  NOT_ENOUGH_MOVEMENT: 'Brakuje punktów ruchu odpowiedniego rodzaju.',
  CARD_NOT_IN_HAND: 'Nie masz tej karty na ręce.',
  NOT_ENOUGH_GOLD: 'Brakuje złota na zakup tej karty.',
  TOKEN_LIMIT: 'W tej rundzie wykorzystałeś już jeden żeton.',
  TOKEN_NOT_FOUND: 'Nie masz tego żetonu.',
  MARKET_LOCKED: 'Sklep jest obecnie zablokowany klątwą.',
  PURCHASE_LIMIT: 'Możesz kupić tylko jedną kartę w swojej turze.',
  HEX_BLOCKED: 'To pole jest zablokowane.',
  HEX_OCCUPIED: 'To pole jest zajęte przez innego gracza.',
  LEAVE_FAILED:
    'Nie udało się opuścić pokoju. Sprawdź połączenie i spróbuj ponownie.',
  ROOM_NOT_FOUND: 'Nie znaleziono pokoju.',
  GAME_ALREADY_STARTED: 'Gra już się rozpoczęła.',
  GAME_NOT_STARTED: 'Gra jeszcze się nie rozpoczęła.',
  PLAYER_NOT_FOUND: 'Nie znaleziono gracza.',
  ROOM_FULL: 'Pokój jest pełny.',
  INVALID_ACTION: 'Nie można wykonać tej akcji.',
}
