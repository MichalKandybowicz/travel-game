import { useEffect, useRef, useState } from 'react'
import { CARD_BY_ID, type CurseEvent } from '@shared'
import { useNavigate, useParams } from 'react-router-dom'
import { HexMap } from '../components/HexMap.js'
import { CardFace } from '../components/CardFace.js'
import { Market } from '../components/Market.js'
import { PlayedCards } from '../components/PlayedCards.js'
import { PlayerHand } from '../components/PlayerHand.js'
import { useGameStore } from '../store.js'
import { cardDescription, errorLabels } from '../labels.js'
import { PlayerBadge } from '../components/PlayerBadge.js'
import { PlayerEffects } from '../components/PlayerEffects.js'
import { cardLabels } from '../labels.js'
import { tokenDescription, tokenPresentation } from '../tokenPresentation.js'
import { CampReward } from '../components/CampReward.js'
import {
  getTurnSoundVolume,
  playCurseSound,
  playTurnSound,
  prepareTurnSound,
  setTurnSoundVolume,
} from '../turnSound.js'

const gameIntroStorageKey = 'travel-game-hide-intro-v1'

const readIntroPreference = (): boolean => {
  try {
    return localStorage.getItem(gameIntroStorageKey) === 'true'
  } catch {
    return false
  }
}

export function GamePage() {
  const navigate = useNavigate()
  const { roomCode = '' } = useParams()
  const game = useGameStore((state) => state.game)
  const room = useGameStore((state) => state.room)
  const session = useGameStore((state) => state.session)
  const account = useGameStore((state) => state.account)
  const connected = useGameStore((state) => state.connected)
  const error = useGameStore((state) => state.error)
  const clearError = useGameStore((state) => state.clearError)
  const reconnect = useGameStore((state) => state.reconnectToRoom)
  const playCard = useGameStore((state) => state.playCard)
  const undoCardPlay = useGameStore((state) => state.undoCardPlay)
  const movePlayer = useGameStore((state) => state.movePlayer)
  const moveDragon = useGameStore((state) => state.moveDragon)
  const chooseStart = useGameStore((state) => state.chooseStart)
  const buyCard = useGameStore((state) => state.buyCard)
  const useToken = useGameStore((state) => state.useToken)
  const chooseCampReward = useGameStore((state) => state.chooseCampReward)
  const playActionCard = useGameStore((state) => state.useActionCard)
  const discardCard = useGameStore((state) => state.discardCard)
  const endTurn = useGameStore((state) => state.endTurn)
  const leaveFinishedGame = useGameStore((state) => state.leaveFinishedGame)
  const leaveRoom = useGameStore((state) => state.leaveRoom)
  const [leaving, setLeaving] = useState(false)
  const [soundVolume, setSoundVolume] = useState(getTurnSoundVolume)
  const [showGameIntro, setShowGameIntro] = useState(
    () => !readIntroPreference(),
  )
  const [hideGameIntro, setHideGameIntro] = useState(false)
  const [visibleCurse, setVisibleCurse] = useState<CurseEvent>()
  const [pendingHexCurse, setPendingHexCurse] = useState<{
    cardInstanceId: string
    targetPlayerId?: string
  }>()
  const [focusHexRequest, setFocusHexRequest] = useState<{ hexId: string }>()
  const seenCurseId = useRef(game?.latestCurse?.instanceId)
  const runeChoiceRef = useRef<HTMLDivElement>(null)
  const gameIntroDialogRef = useRef<HTMLDialogElement>(null)
  const mapAreaRef = useRef<HTMLDivElement>(null)
  const gameInfoRef = useRef<HTMLDetailsElement>(null)
  const pendingCampId = game?.players.find(
    (player) => player.id === session?.playerId,
  )?.pendingCampReward?.campId
  const previousTurn = useRef(
    game && {
      roomCode: game.roomCode,
      turnNumber: game.turnNumber,
      status: game.status,
    },
  )

  const closeGameIntro = () => {
    if (hideGameIntro) {
      try {
        localStorage.setItem(gameIntroStorageKey, 'true')
      } catch {
        // Ignore storage errors in private windows.
      }
    }
    setShowGameIntro(false)
    gameIntroDialogRef.current?.close()
  }

  useEffect(() => {
    window.addEventListener('pointerdown', prepareTurnSound)
    window.addEventListener('keydown', prepareTurnSound)
    return () => {
      window.removeEventListener('pointerdown', prepareTurnSound)
      window.removeEventListener('keydown', prepareTurnSound)
    }
  }, [])

  useEffect(() => {
    if (!game) return
    const previous = previousTurn.current
    if (
      previous?.roomCode === game.roomCode &&
      game.status === 'ACTIVE' &&
      game.currentPlayerId === session?.playerId &&
      (previous.status === 'CHOOSING_START' ||
        game.turnNumber > previous.turnNumber)
    ) {
      playTurnSound()
    }
    previousTurn.current = {
      roomCode: game.roomCode,
      turnNumber: game.turnNumber,
      status: game.status,
    }
  }, [game, session?.playerId])

  useEffect(() => {
    const curse = game?.latestCurse
    if (!curse || curse.instanceId === seenCurseId.current) return
    seenCurseId.current = curse.instanceId
    playCurseSound()
    setVisibleCurse(curse)
    const timeout = window.setTimeout(() => setVisibleCurse(undefined), 10000)
    return () => window.clearTimeout(timeout)
  }, [game?.latestCurse])

  useEffect(() => {
    if (pendingCampId) {
      runeChoiceRef.current?.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      })
    }
  }, [pendingCampId])

  useEffect(() => {
    if (!game || !showGameIntro || game.status === 'FINISHED') return
    if (!gameIntroDialogRef.current?.open) {
      gameIntroDialogRef.current?.showModal()
    }
  }, [game, showGameIntro])

  useEffect(() => {
    if (!session && !account) {
      navigate('/')
      return
    }
    if (
      !game &&
      (session?.roomCode === roomCode || account?.activeRoomCode === roomCode)
    ) {
      reconnect(roomCode)
    }
  }, [account, game, navigate, reconnect, roomCode, session])

  if (!game) {
    return (
      <main className="page shell">
        <p>Łączenie z pokojem {roomCode}...</p>
      </main>
    )
  }

  const localPlayer = game.players.find(
    (player) => player.id === session?.playerId,
  )
  const winner = game.players.find((player) => player.id === game.winnerId)
  const isActive =
    connected &&
    game.currentPlayerId === session?.playerId &&
    game.status === 'ACTIVE'
  const isChoosingStart = game.status === 'CHOOSING_START'
  const isMyStartChoice =
    connected && isChoosingStart && game.currentPlayerId === session?.playerId
  const moveInRound =
    game.players.findIndex((player) => player.id === game.currentPlayerId) + 1
  const startIds = game.map.startHexIds ?? [game.map.startHexId]
  const curseName = visibleCurse?.cardId
    ? (cardLabels[visibleCurse.cardId]?.name ??
      CARD_BY_ID[visibleCurse.cardId]?.name)
    : visibleCurse?.tokenType
      ? tokenPresentation(visibleCurse.tokenType).label
      : ''
  const curseCard = visibleCurse?.cardId
    ? CARD_BY_ID[visibleCurse.cardId]
    : undefined
  const curseDescription = curseCard
    ? cardDescription(curseCard)
    : visibleCurse?.tokenType
      ? tokenDescription(visibleCurse.tokenType)
      : undefined
  const curseCaster = game.players.find(
    (player) => player.id === visibleCurse?.playerId,
  )
  const curseTarget = game.players.find(
    (player) => player.id === visibleCurse?.targetPlayerId,
  )

  return (
    <main className="page shell journey-page game-shell">
      <dialog
        ref={gameIntroDialogRef}
        className="game-intro-dialog"
        aria-labelledby="game-intro-title"
        onCancel={(event) => {
          event.preventDefault()
          closeGameIntro()
        }}
      >
        <div className="game-intro-content">
          <header>
            <small>Krótki przewodnik</small>
            <h2 id="game-intro-title">Najważniejsze zasady wyprawy</h2>
          </header>
          <div className="game-intro-grid">
            <article>
              <span aria-hidden="true">🏁</span>
              <strong>Cel gry</strong>
              <p>Dotrzyj swoim pionkiem do pradawnego portalu przed innymi.</p>
            </article>
            <article>
              <span aria-hidden="true">🃏</span>
              <strong>Karty</strong>
              <p>
                Używaj kart jako ruchu albo jako złota. Kupione karty trafiają
                od razu na rękę.
              </p>
            </article>
            <article>
              <span aria-hidden="true">💰</span>
              <strong>Magiczny bazar</strong>
              <p>
                Oferty znikają po kilku turach. Pod kartą widać, za ile tur
                zmieni się oferta.
              </p>
            </article>
            <article>
              <span aria-hidden="true">✦</span>
              <strong>Runy i klątwy</strong>
              <p>
                Kręgi run dają jednorazowe efekty. Klątwy mogą blokować ruch,
                sklep lub karty przeciwnika.
              </p>
            </article>
            {(game.dragons?.length ?? 0) > 0 && (
              <article>
                <span aria-hidden="true">🐉</span>
                <strong>Smoki</strong>
                <p>
                  Czerwona strefa blokuje pola przy smoku, a dalszy pierścień
                  dodaje koszt +2 dowolnego ruchu. Smoka możesz przesunąć za 6
                  dowolnego ruchu. Po kolejce graczy smok rusza się losowo o 1–2
                  pola.
                </p>
              </article>
            )}
          </div>
          <label className="game-intro-checkbox">
            <input
              type="checkbox"
              checked={hideGameIntro}
              onChange={(event) => setHideGameIntro(event.target.checked)}
            />
            Nie pokazuj więcej
          </label>
          <div className="game-intro-actions">
            <button
              type="button"
              className="primary-button"
              onClick={closeGameIntro}
            >
              Zaczynam
            </button>
          </div>
        </div>
      </dialog>
      {visibleCurse && (
        <div className="curse-popup" role="alert" aria-live="assertive">
          <div className="curse-popup-body">
            <small>Rzucono klątwę</small>
            <strong>{curseName}</strong>
            <div
              className="curse-popup-cast"
              data-blocked={visibleCurse.blocked ? 'true' : undefined}
            >
              <div className="curse-popup-person">
                {curseCaster && (
                  <PlayerBadge
                    index={game.players.indexOf(curseCaster)}
                    color={curseCaster.color}
                    symbol={curseCaster.symbol}
                  />
                )}
                <span>{curseCaster?.name ?? 'Gracz'}</span>
              </div>
              <div className="curse-popup-magic" aria-hidden="true">
                <span>✦</span>
              </div>
              <div className="curse-popup-person">
                {curseTarget ? (
                  <PlayerBadge
                    index={game.players.indexOf(curseTarget)}
                    color={curseTarget.color}
                    symbol={curseTarget.symbol}
                  />
                ) : (
                  <span className="curse-popup-market-icon" aria-hidden="true">
                    ◈
                  </span>
                )}
                <span>
                  {curseTarget?.name ??
                    (visibleCurse.targetHexId ? 'Pole na mapie' : 'Sklep')}
                </span>
              </div>
            </div>
            {curseDescription && (
              <p className="curse-popup-description">{curseDescription}</p>
            )}
            {visibleCurse.blocked && (
              <p className="curse-popup-blocked">
                Ochronny krąg zablokował klątwę
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Zamknij powiadomienie o klątwie"
            onClick={() => setVisibleCurse(undefined)}
          >
            ×
          </button>
        </div>
      )}
      {game.status === 'FINISHED' && (
        <section className="game-result" role="status" aria-live="polite">
          <div className="game-result-icon" aria-hidden="true">
            ★
          </div>
          <div className="game-result-copy">
            <small>Gra zakończona</small>
            <h1>
              {game.winnerId === session?.playerId
                ? 'Wygrałeś!'
                : `Zwycięzca: ${winner?.name ?? 'nieznany gracz'}`}
            </h1>
            <p>
              {winner?.name ?? 'Gracz'} dotarł do celu w rundzie{' '}
              {game.roundNumber ?? 1}.
            </p>
          </div>
          <div className="game-result-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                leaveFinishedGame()
                navigate('/')
              }}
            >
              Strona główna
            </button>
          </div>
        </section>
      )}
      {!connected && (
        <div className="error-banner" role="status">
          Połączenie przerwane. Próba powrotu do gry trwa automatycznie…
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert" onClick={clearError}>
          {errorLabels[error.code] ?? error.message}
        </div>
      )}
      <section className="game-layout">
        <details ref={gameInfoRef} className="game-info-drawer">
          <summary>
            <span aria-hidden="true">☰</span>
            <span>
              {isChoosingStart
                ? 'Wybór startu'
                : `Runda ${game.roundNumber ?? 1}`}
            </span>
            <small>
              {game.status === 'ACTIVE'
                ? `Ruch ${moveInRound} z ${game.players.length}`
                : 'Informacje o grze'}
            </small>
          </summary>
          <div className="game-info-content">
            <header className="panel top-bar">
              <div className="game-brand-small">
                <span aria-hidden="true">⬡</span>
                <strong>
                  TRAVEL<span>GAME</span>
                </strong>
              </div>
              <div className="game-room-line">
                <small>POKÓJ</small>
                <strong>{room?.roomCode ?? game.roomCode}</strong>
              </div>
              <div className="game-turn-line">
                <small>ETAP WYPRAWY</small>
                <strong>
                  {isChoosingStart
                    ? 'Wybór startu'
                    : `Runda ${game.roundNumber ?? 1}`}
                </strong>
                {!isChoosingStart && game.status === 'ACTIVE' && (
                  <span>
                    Ruch {moveInRound} z {game.players.length}
                  </span>
                )}
              </div>
              <label className="game-sound-control">
                <span>
                  GŁOŚNOŚĆ DŹWIĘKU <strong>{soundVolume}%</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={soundVolume}
                  aria-label="Głośność dźwięku końca tury"
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setSoundVolume(value)
                    setTurnSoundVolume(value)
                  }}
                />
              </label>
              {game.status === 'FINISHED' ? (
                <div className="game-current-player">
                  <small>STATUS</small>
                  <strong>Gra zakończona</strong>
                </div>
              ) : (
                <div className="game-current-player">
                  <small>
                    {isChoosingStart ? 'WYBIERA POLE' : 'GRA TERAZ'}
                  </small>
                  <strong>
                    {
                      game.players.find(
                        (player) => player.id === game.currentPlayerId,
                      )?.name
                    }
                  </strong>
                </div>
              )}
              {game.settings.fogMode === 'NONE' && (
                <small className="game-seed">Ziarno: {game.seed}</small>
              )}
              {game.status === 'ACTIVE' && (
                <button
                  type="button"
                  disabled={!isActive || !localPlayer?.canUndoCardPlay}
                  onClick={undoCardPlay}
                >
                  Cofnij zagranie karty
                </button>
              )}
              {game.status !== 'FINISHED' && (
                <button
                  type="button"
                  disabled={leaving}
                  onClick={async () => {
                    setLeaving(true)
                    if (await leaveRoom()) {
                      navigate('/')
                    } else {
                      setLeaving(false)
                    }
                  }}
                >
                  {leaving ? 'Opuszczanie…' : 'Opuść grę'}
                </button>
              )}
            </header>
            <div className="game-sidebar">
              <aside className="panel sidebar game-players-panel">
                <div className="panel-header">
                  <div>
                    <small className="panel-kicker">KRĄG WĘDROWCÓW</small>
                    <h2>Magowie</h2>
                  </div>
                </div>
                <ul className="player-list">
                  {game.players.map((player, index) =>
                    player.id === session?.playerId ? null : (
                      <li key={player.id}>
                        <div className="sidebar-player-heading">
                          <button
                            type="button"
                            className="sidebar-player-focus"
                            aria-label={`Pokaż ${player.name} na mapie`}
                            title={`Pokaż ${player.name} na mapie`}
                            onClick={() => {
                              setFocusHexRequest({ hexId: player.position })
                              if (gameInfoRef.current)
                                gameInfoRef.current.open = false
                              mapAreaRef.current?.scrollIntoView({
                                block: 'start',
                                behavior: 'smooth',
                              })
                            }}
                          >
                            <PlayerBadge
                              index={index}
                              color={player.color}
                              symbol={player.symbol}
                            />
                          </button>
                          <strong>{player.name}</strong>
                        </div>
                        <div className="sidebar-player-status">
                          <small>
                            {player.connected ? 'połączony' : 'rozłączony'}
                          </small>
                        </div>
                        <PlayerEffects player={player} game={game} />
                        <PlayedCards player={player} />
                      </li>
                    ),
                  )}
                </ul>
              </aside>
            </div>
          </div>
        </details>
        <div className="game-main">
          <div ref={mapAreaRef} className="game-map-choice-layout">
            <HexMap
              game={game}
              playerId={session?.playerId}
              isActive={isActive && !localPlayer?.pendingCampReward}
              canChooseStart={isMyStartChoice}
              focusOnPlayer={pendingCampId}
              focusHexRequest={focusHexRequest}
              onSelectHex={movePlayer}
              onMoveDragon={moveDragon}
              onChooseStart={chooseStart}
              blockTargeting={isActive && !!pendingHexCurse}
              onBlockHex={(hexId) => {
                if (!pendingHexCurse) return
                playActionCard(
                  pendingHexCurse.cardInstanceId,
                  pendingHexCurse.targetPlayerId,
                  hexId,
                )
                setPendingHexCurse(undefined)
              }}
            />
          </div>
          <div className="game-hand-column">
            {isChoosingStart && (
              <section className="panel start-choice" aria-live="polite">
                <strong>
                  {isMyStartChoice
                    ? 'Wybierz pole startowe'
                    : 'Czekamy na wybór pola startowego'}
                </strong>
                <p>
                  Gracze wybierają kolejno. Ostatnia osoba wybierająca
                  rozpocznie grę, a tury pójdą w odwrotnej kolejności.
                </p>
                <div className="start-choice-options">
                  {startIds.map((hexId, index) => {
                    const occupant = game.players.find(
                      (player) => player.position === hexId,
                    )
                    return (
                      <button
                        key={hexId}
                        type="button"
                        disabled={!isMyStartChoice || !!occupant}
                        onClick={() => chooseStart(hexId)}
                      >
                        Pole {index + 1}
                        {occupant ? ` — ${occupant.name}` : ''}
                      </button>
                    )
                  })}
                </div>
                {localPlayer && (
                  <div className="starting-hand-preview">
                    <strong>Twoja ręka na start</strong>
                    <div className="card-grid hand-card-grid">
                      {localPlayer.hand.map((card) => {
                        const definition = CARD_BY_ID[card.cardId]
                        return definition ? (
                          <div
                            key={card.instanceId}
                            className="card game-card hand-card"
                            data-movement={definition.movementType}
                            data-secondary-movement={
                              definition.secondaryMovementType
                            }
                            data-card-type={definition.type.toLowerCase()}
                          >
                            <CardFace card={definition} compact />
                          </div>
                        ) : null
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}
            {!isChoosingStart && (
              <PlayerHand
                game={game}
                player={localPlayer}
                opponents={game.players.filter(
                  (player) => player.id !== localPlayer?.id,
                )}
                isActive={isActive}
                onPlayCard={playCard}
                onUseToken={useToken}
                onUseActionCard={playActionCard}
                onChooseHexCurseCard={(cardInstanceId, targetPlayerId) =>
                  setPendingHexCurse({
                    cardInstanceId,
                    ...(targetPlayerId ? { targetPlayerId } : {}),
                  })
                }
                onDiscardCard={discardCard}
                onEndTurn={() => {
                  setPendingHexCurse(undefined)
                  endTurn()
                }}
                roundNumber={game.roundNumber ?? 1}
                market={
                  <Market
                    game={game}
                    player={localPlayer}
                    isActive={isActive}
                    onBuyCard={buyCard}
                  />
                }
              />
            )}
            {localPlayer?.pendingCampReward && (
              <div ref={runeChoiceRef} className="game-rune-choice">
                <CampReward player={localPlayer} onChoose={chooseCampReward} />
              </div>
            )}
            {isActive && pendingHexCurse && (
              <div className="hex-curse-prompt" role="status">
                <span>Wybierz pole na mapie dla tej klątwy.</span>
                <button
                  type="button"
                  onClick={() => setPendingHexCurse(undefined)}
                >
                  Anuluj
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
