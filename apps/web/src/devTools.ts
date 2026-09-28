import { CARD_DEFINITIONS, EVENTS } from '../../../packages/shared/src/index.js'
import { getSocket, useGameStore } from './store.js'

type AddCardResult =
  { ok: true; cardId: string; name: string } | { ok: false; message: string }

interface TravelGameDev {
  listCards: () => { number: number; id: string; name: string; type: string }[]
  addCard: (card: number | string) => Promise<{ cardId: string; name: string }>
}

const playableCards = CARD_DEFINITIONS.filter((card) => card.id !== 'hidden')

declare global {
  interface Window {
    travelGameDev?: TravelGameDev
  }
}

export const installDevTools = (): void => {
  window.travelGameDev = {
    listCards: () =>
      playableCards.map(({ id, name, type }, index) => ({
        number: index + 1,
        id,
        name,
        type,
      })),
    addCard: async (card) => {
      const { session, game, connected } = useGameStore.getState()
      if (!connected || !session || !game) {
        throw new Error('Najpierw dołącz do rozpoczętej gry.')
      }
      const cardId =
        typeof card === 'number'
          ? playableCards[card - 1]?.id
          : typeof card === 'string'
            ? card.trim()
            : undefined
      if (!cardId) {
        throw new Error('Podaj numer z listCards() lub tekstowe ID karty.')
      }
      const result = (await getSocket()
        .timeout(5000)
        .emitWithAck(EVENTS.gameDevAddCard, {
          roomCode: session.roomCode,
          playerId: session.playerId,
          cardId,
        })) as AddCardResult
      if (!result.ok) throw new Error(result.message)
      return { cardId: result.cardId, name: result.name }
    },
  }
}
