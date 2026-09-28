import { randomUUID } from 'node:crypto'
import {
  CARD_BY_ID,
  type CardDefinition,
  type GameState,
} from '../../../packages/shared/src/index.js'

export const devToolsEnabled = (env: {
  TRAVEL_GAME_DEV_TOOLS?: string
  npm_lifecycle_event?: string
  NODE_ENV?: string
}): boolean =>
  env.TRAVEL_GAME_DEV_TOOLS === '1' &&
  env.npm_lifecycle_event === 'dev' &&
  env.NODE_ENV !== 'production'

export const addDevCard = (
  game: GameState,
  playerId: string,
  cardId: string,
): CardDefinition => {
  if (game.status !== 'ACTIVE' && game.status !== 'CHOOSING_START') {
    throw new Error('Kartę można dodać tylko w rozpoczętej grze.')
  }
  if (!Object.hasOwn(CARD_BY_ID, cardId) || cardId === 'hidden') {
    throw new Error(
      `Nieznana karta: ${cardId}. Sprawdź travelGameDev.listCards().`,
    )
  }
  const player = game.players.find((entry) => entry.id === playerId)
  if (!player) {
    throw new Error('Nie znaleziono gracza w tej grze.')
  }
  player.hand.push({ cardId, instanceId: `dev-${randomUUID()}` })
  return CARD_BY_ID[cardId]!
}
