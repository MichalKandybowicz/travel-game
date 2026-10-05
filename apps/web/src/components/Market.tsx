import { useRef } from 'react'
import { CARD_BY_ID, getMarketTier, MARKET_CARD_COPY_LIMIT } from '@shared'
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
  const cursePriceIncrease = player?.nextPurchaseCostIncrease ?? 0
  const isLocked = Boolean(
    game.marketLockedUntilPlayerId || player?.marketBlocked,
  )
  const defaultOfferLifetime = Math.max(4, Math.ceil(game.players.length * 1.2))
  const formatTurnsRemaining = (turns: number): string => {
    if (turns <= 1) return 'Zniknie za 1 turę'
    if (turns < 5) return `Zniknie za ${turns} tury`
    return `Zniknie za ${turns} tur`
  }

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
          {cursePriceIncrease > 0 && (
            <small>Klątwa ubóstwa: ceny +{cursePriceIncrease}</small>
          )}
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
                : cursePriceIncrease > 0
                  ? `Klątwa ubóstwa podnosi cenę następnego zakupu o ${cursePriceIncrease} złota. Efekt zniknie po zakupie.`
                  : hasBoughtThisTurn
                    ? 'Zakup w tej turze został wykorzystany.'
                    : 'Możesz kupić jedną kartę w swojej turze. Kupiona karta trafi od razu na rękę. Oferta uzupełni się po zakupie.'}
            </p>
          </div>
          <div
            className="market-card-grid"
            aria-label="Karty dostępne w sklepie"
          >
            {game.market.map((cardId, index) => {
              const card = CARD_BY_ID[cardId]
              if (!card) return null
              const effectiveCost = card.purchaseCost + cursePriceIncrease
              const tier = getMarketTier(card.purchaseCost)
              const copiesPurchased = game.cardPurchaseCounts?.[cardId] ?? 0
              const expiresAtTurn = game.marketOfferExpiresAtTurns?.[index]
              const turnsRemaining = Math.max(
                1,
                typeof expiresAtTurn === 'number'
                  ? expiresAtTurn - game.turnNumber
                  : defaultOfferLifetime,
              )
              const affordable = availableGold >= effectiveCost
              const canBuy =
                isActive && affordable && !hasBoughtThisTurn && !isLocked
              return (
                <button
                  key={`${card.id}-${index}`}
                  type="button"
                  className="card game-card market-card"
                  data-movement={card.movementType}
                  data-secondary-movement={card.secondaryMovementType}
                  data-card-type={card.type.toLowerCase()}
                  data-action-category={card.actionCategory?.toLowerCase()}
                  data-tier={tier}
                  disabled={!canBuy}
                  title={cardDescription(card)}
                  onClick={() => {
                    onBuyCard(card.id)
                    dialogRef.current?.close()
                  }}
                >
                  <span className="market-card-tier">
                    Tier {tier} · kupiono {copiesPurchased}/
                    {MARKET_CARD_COPY_LIMIT}
                  </span>
                  <CardFace card={card} purchaseCost={effectiveCost} />
                  <span className="market-card-expiry">
                    <span
                      className="market-card-expiry-icon"
                      aria-hidden="true"
                    >
                      ↻
                    </span>
                    <span>{formatTurnsRemaining(turnsRemaining)}</span>
                  </span>
                  <span className="market-card-status">
                    {isLocked
                      ? 'Sklep zablokowany klątwą'
                      : hasBoughtThisTurn
                        ? 'Zakup wykorzystany'
                        : !isActive
                          ? 'Poczekaj na swoją turę'
                          : affordable
                            ? 'Kup kartę'
                            : `Brakuje ${effectiveCost - availableGold} złota`}
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
