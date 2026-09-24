import type { MovementType, TerrainType } from '@shared'

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

export const cardLabels: Record<string, { name: string; description: string }> =
  {
    hidden: { name: 'Ukryta karta', description: 'Karta innego gracza.' },
    explorer: { name: 'Odkrywca', description: 'Daje 1 zielony punkt ruchu.' },
    scout: { name: 'Zwiadowca', description: 'Daje 2 zielone punkty ruchu.' },
    ranger: { name: 'Łowca', description: 'Daje 3 zielone punkty ruchu.' },
    pathfinder: {
      name: 'Przewodnik',
      description: 'Daje 4 zielone punkty ruchu albo 1 sztukę złota.',
    },
    sailor: { name: 'Żeglarz', description: 'Daje 1 niebieski punkt ruchu.' },
    seasoned_sailor: {
      name: 'Doświadczony żeglarz',
      description: 'Daje 2 niebieskie punkty ruchu.',
    },
    captain: {
      name: 'Kapitan',
      description: 'Daje 3 niebieskie punkty ruchu albo 1 sztukę złota.',
    },
    coin: {
      name: 'Moneta',
      description: 'Daje 1 żółty punkt ruchu albo 2 sztuki złota.',
    },
    trader: {
      name: 'Kupiec',
      description: 'Daje 2 żółte punkty ruchu albo 1 sztukę złota.',
    },
    master_trader: {
      name: 'Mistrz kupiecki',
      description: 'Daje 3 żółte punkty ruchu albo 1 sztukę złota.',
    },
    caravan: {
      name: 'Karawana',
      description: 'Daje 4 żółte punkty ruchu albo 1 sztukę złota.',
    },
    adventurer: {
      name: 'Poszukiwacz przygód',
      description: 'Daje 1 dowolny punkt ruchu.',
    },
    trailblazer: {
      name: 'Pionier',
      description: 'Daje 2 dowolne punkty ruchu albo 1 sztukę złota.',
    },
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
