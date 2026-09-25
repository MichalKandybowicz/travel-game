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
  UNKNOWN: 'Nieodkryte',
  START: 'Start',
  GOAL: 'Cel',
  JUNGLE: 'Dżungla',
  WATER: 'Woda',
  DESERT: 'Pustynia',
  RUBBLE: 'Rumowisko',
  CAMP: 'Obóz',
  MOUNTAIN: 'Góry',
}

export const cardLabels: Record<string, { name: string }> = {
  hidden: { name: 'Ukryta karta' },
  explorer: { name: 'Odkrywca' },
  herbalist: { name: 'Zielarz' },
  scout: { name: 'Zwiadowca' },
  ranger: { name: 'Łowca' },
  pathfinder: { name: 'Przewodnik' },
  sailor: { name: 'Żeglarz' },
  seasoned_sailor: { name: 'Doświadczony żeglarz' },
  navigator: { name: 'Nawigator' },
  captain: { name: 'Kapitan' },
  admiral: { name: 'Admirał' },
  coin: { name: 'Moneta' },
  trader: { name: 'Kupiec' },
  treasurer: { name: 'Skarbnik' },
  master_trader: { name: 'Mistrz kupiecki' },
  caravan: { name: 'Karawana' },
  adventurer: { name: 'Poszukiwacz przygód' },
  trailblazer: { name: 'Pionier' },
  wayfarer: { name: 'Wędrowiec' },
}

export function cardDescription(card: CardDefinition): string {
  if (card.id === 'hidden') {
    return 'Karta innego gracza.'
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
