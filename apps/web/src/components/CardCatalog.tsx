import { useRef, useState } from 'react'
import {
  CARD_DEFINITIONS,
  MARKET_CARD_IDS,
  TOKEN_DEFINITIONS,
  type CardDefinition,
  type MovementType,
  type TokenDefinition,
} from '@shared'
import { cardDescription } from '../labels.js'
import { tokenDescription, tokenPresentation } from '../tokenPresentation.js'
import { CardFace } from './CardFace.js'

type CardGroup = 'ALL' | MovementType | 'MIXED' | 'SPELL' | 'CURSE'
type TokenGroup = 'ALL' | 'MOVEMENT' | 'GOLD' | 'UTILITY' | 'CURSE'

const cardGroups: Array<{ id: CardGroup; label: string }> = [
  { id: 'ALL', label: 'Wszystkie' },
  { id: 'GREEN', label: 'Zielone' },
  { id: 'BLUE', label: 'Niebieskie' },
  { id: 'YELLOW', label: 'Żółte' },
  { id: 'WILD', label: 'Uniwersalne' },
  { id: 'MIXED', label: 'Mieszane' },
  { id: 'SPELL', label: 'Zaklęcia' },
  { id: 'CURSE', label: 'Klątwy' },
]

const tokenGroups: Array<{ id: TokenGroup; label: string }> = [
  { id: 'ALL', label: 'Wszystkie' },
  { id: 'MOVEMENT', label: 'Ruch' },
  { id: 'GOLD', label: 'Złoto' },
  { id: 'UTILITY', label: 'Specjalne' },
  { id: 'CURSE', label: 'Klątwy' },
]

const cards = CARD_DEFINITIONS.filter((card) => card.id !== 'hidden')
const marketCards = new Set(MARKET_CARD_IDS)

const matchesCardGroup = (card: CardDefinition, group: CardGroup) =>
  group === 'ALL' ||
  (card.type === 'MOVEMENT' &&
    group === 'MIXED' &&
    !!card.secondaryMovementType) ||
  (card.type === 'MOVEMENT' &&
    (card.movementType === group || card.secondaryMovementType === group)) ||
  (card.type === 'ACTION' && card.actionCategory === group)

const matchesTokenGroup = (token: TokenDefinition, group: TokenGroup) => {
  if (group === 'ALL') return true
  if (group === 'CURSE') return token.effect.kind.startsWith('CURSE_')
  if (group === 'UTILITY') {
    return (
      !['MOVEMENT', 'GOLD'].includes(token.effect.kind) &&
      !token.effect.kind.startsWith('CURSE_')
    )
  }
  return token.effect.kind === group
}

export function CardCatalog() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [section, setSection] = useState<'CARDS' | 'TOKENS'>('CARDS')
  const [cardGroup, setCardGroup] = useState<CardGroup>('ALL')
  const [tokenGroup, setTokenGroup] = useState<TokenGroup>('ALL')
  const visibleCards = cards.filter((card) => matchesCardGroup(card, cardGroup))
  const visibleTokens = TOKEN_DEFINITIONS.filter((token) =>
    matchesTokenGroup(token, tokenGroup),
  )

  return (
    <>
      <button
        type="button"
        className="home-catalog-trigger"
        onClick={() => dialogRef.current?.showModal()}
      >
        <span aria-hidden="true">✧</span> Zobacz wszystkie karty i runy
      </button>
      <dialog
        ref={dialogRef}
        className="market-dialog catalog-dialog"
        aria-labelledby="catalog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close()
        }}
      >
        <div className="market-dialog-content catalog-content">
          <header className="market-dialog-header">
            <div>
              <small>ATLAS MAGII</small>
              <h2 id="catalog-title">Karty i runy</h2>
            </div>
            <button
              type="button"
              className="market-dialog-close"
              aria-label="Zamknij katalog"
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </header>
          <div className="catalog-sections" aria-label="Rodzaj przedmiotów">
            <button
              type="button"
              aria-pressed={section === 'CARDS'}
              onClick={() => setSection('CARDS')}
            >
              Karty <span>{cards.length}</span>
            </button>
            <button
              type="button"
              aria-pressed={section === 'TOKENS'}
              onClick={() => setSection('TOKENS')}
            >
              Runy <span>{TOKEN_DEFINITIONS.length}</span>
            </button>
          </div>
          <div className="catalog-filters" aria-label="Filtruj według typu">
            {section === 'CARDS'
              ? cardGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    aria-pressed={cardGroup === group.id}
                    onClick={() => setCardGroup(group.id)}
                  >
                    {group.label}
                  </button>
                ))
              : tokenGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    aria-pressed={tokenGroup === group.id}
                    onClick={() => setTokenGroup(group.id)}
                  >
                    {group.label}
                  </button>
                ))}
          </div>
          {section === 'CARDS' ? (
            <div className="catalog-grid" aria-label="Karty">
              {visibleCards.map((card) => (
                <article key={card.id} className="catalog-card-item">
                  <div
                    className="card game-card catalog-card"
                    data-movement={card.movementType}
                    data-secondary-movement={card.secondaryMovementType}
                    data-card-type={card.type.toLowerCase()}
                    data-action-category={card.actionCategory?.toLowerCase()}
                  >
                    <CardFace
                      card={card}
                      {...(marketCards.has(card.id)
                        ? { purchaseCost: card.purchaseCost }
                        : {})}
                    />
                  </div>
                  <small>
                    {marketCards.has(card.id) ? 'W sklepie' : 'Karta startowa'}
                  </small>
                  <p>{cardDescription(card)}</p>
                </article>
              ))}
            </div>
          ) : (
            <>
              <p className="catalog-token-rule">
                W jednej rundzie możesz użyć jednej runy. Runy zdobywa się w
                kręgach run.
              </p>
              <div className="catalog-rune-grid" aria-label="Runy">
                {visibleTokens.map((token) => {
                  const presentation = tokenPresentation(token.type)
                  return (
                    <article key={token.type} className="catalog-rune">
                      <div className="catalog-rune-heading">
                        <span className="token" data-tone={presentation.tone}>
                          <span className="token-icon" aria-hidden="true">
                            {presentation.icon}
                          </span>
                        </span>
                        <strong>{presentation.label}</strong>
                      </div>
                      <p>{tokenDescription(token.type)}</p>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  )
}
