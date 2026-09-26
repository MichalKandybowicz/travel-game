import { useRef } from 'react'
import { CARD_BY_ID } from '@shared'
import type { GameState, PlayerState } from '@shared'
import { cardDescription } from '../labels.js'
import { CardFace } from './CardFace.js'

interface MarketProps {
  game: GameState
  player: PlayerState | undefined
  isActive: boolean
  onBuyCard: (cardId: string) => void
}

export function Market({ game, player, isActive, onBuyCard }: MarketProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const availableGold = player?.availableGold ?? 0
  const hasBoughtThisTurn = player?.hasBoughtThisTurn ?? false
  const isLocked = Boolean(
    game.marketLockedUntilPlayerId || player?.marketBlocked,
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="market-trigger"
        onClick={() => dialogRef.current?.showModal()}
      >
        <span>
          <strong>Magiczny bazar</strong>
          <small>Zaklęcia i artefakty: {game.market.length}</small>
          {isLocked && <small>Bazar spowity klątwą</small>}
        </span>
        <span className="market-trigger-arrow" aria-hidden="true">
          →
        </span>
      </button>
      <dialog
        ref={dialogRef}
        className="market-dialog"
        aria-labelledby="market-title"
        onClose={() => triggerRef.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            dialogRef.current?.close()
          }
        }}
      >
        <div className="market-dialog-content">
          <header className="market-dialog-header">
            <div>
              <small>Wędrowny kram zaklęć</small>
              <h2 id="market-title">Magiczny bazar</h2>
            </div>
            <button
              type="button"
              className="market-dialog-close"
              aria-label="Zamknij sklep"
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </header>
          <div className="market-dialog-summary">
            <div className="market-gold">
              <span>Twoje magiczne złoto</span>
              <strong>{availableGold}</strong>
            </div>
            <p>
              {isLocked
                ? 'Klątwa blokuje wszystkie zakupy do kolejnej tury gracza, który jej użył.'
                : hasBoughtThisTurn
                  ? 'Zakup w tej turze został wykorzystany.'
                  : 'Możesz kupić jedną kartę w swojej turze. Oferta uzupełni się po zakupie.'}
            </p>
          </div>
          <div
            className="market-card-grid"
            aria-label="Karty dostępne w sklepie"
          >
            {game.market.map((cardId) => {
              const card = CARD_BY_ID[cardId]
              if (!card) return null
              const affordable = availableGold >= card.purchaseCost
              const canBuy =
                isActive && affordable && !hasBoughtThisTurn && !isLocked
              return (
                <button
                  key={card.id}
                  type="button"
                  className="card game-card market-card"
                  data-movement={card.movementType}
                  data-card-type={card.type.toLowerCase()}
                  data-action-category={card.actionCategory?.toLowerCase()}
                  disabled={!canBuy}
                  title={cardDescription(card)}
                  onClick={() => {
                    onBuyCard(card.id)
                    dialogRef.current?.close()
                  }}
                >
                  <CardFace card={card} purchaseCost={card.purchaseCost} />
                  <span className="market-card-status">
                    {isLocked
                      ? 'Sklep zablokowany klątwą'
                      : hasBoughtThisTurn
                        ? 'Zakup wykorzystany'
                        : !isActive
                          ? 'Poczekaj na swoją turę'
                          : affordable
                            ? 'Kup kartę'
                            : `Brakuje ${card.purchaseCost - availableGold} złota`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </dialog>
    </>
  )
}
