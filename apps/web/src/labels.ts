import type { CardDefinition, MovementType, TerrainType } from '@shared'

export const movementLabels: Record<MovementType, string> = {
  GREEN: 'zielone',
  BLUE: 'niebieskie',
  YELLOW: 'żółte',
  WILD: 'dowolne',
}

export const terrainLabels: Record<TerrainType, string> = {
  UNKNOWN: 'Nieodkryte',
  START: 'Start',
  GOAL: 'Cel',
  JUNGLE: 'Dżungla',
  WATER: 'Woda',
  VILLAGE: 'Wioska',
  RUBBLE: 'Rumowisko',
  CAMP: 'Obóz',
  MOUNTAIN: 'Góry',
}

export const cardLabels: Record<string, { name: string }> = {
  hidden: { name: 'Ukryta karta' },
  explorer: { name: 'Odkrywca' },
  scout: { name: 'Zwiadowca' },
  ranger: { name: 'Łowca' },
  pathfinder: { name: 'Przewodnik' },
  sailor: { name: 'Żeglarz' },
  seasoned_sailor: { name: 'Doświadczony żeglarz' },
  captain: { name: 'Kapitan' },
  coin: { name: 'Moneta' },
  trader: { name: 'Kupiec' },
  master_trader: { name: 'Mistrz kupiecki' },
  caravan: { name: 'Karawana' },
  adventurer: { name: 'Poszukiwacz przygód' },
  trailblazer: { name: 'Pionier' },
}

export function cardDescription(card: CardDefinition): string {
  if (card.id === 'hidden') {
    return 'Karta innego gracza.'
  }

  const movement = `${card.movementValue} ${movementLabels[card.movementType]} ${
    card.movementValue === 1 ? 'punkt' : 'punkty'
  } ruchu`
  const gold =
    card.goldValue > 0
      ? ` albo ${card.goldValue} ${
          card.goldValue === 1 ? 'sztukę' : 'sztuki'
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
