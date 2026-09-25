import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HexMap } from '../components/HexMap.js'
import { DeckPreview } from '../components/DeckPreview.js'
import { Market } from '../components/Market.js'
import { PlayedCards } from '../components/PlayedCards.js'
import { PlayerHand } from '../components/PlayerHand.js'
import { useGameStore } from '../store.js'
import { errorLabels } from '../labels.js'
import { PlayerBadge } from '../components/PlayerBadge.js'

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
  const movePlayer = useGameStore((state) => state.movePlayer)
  const chooseStart = useGameStore((state) => state.chooseStart)
  const buyCard = useGameStore((state) => state.buyCard)
  const useToken = useGameStore((state) => state.useToken)
  const endTurn = useGameStore((state) => state.endTurn)
  const leaveFinishedGame = useGameStore((state) => state.leaveFinishedGame)
  const leaveRoom = useGameStore((state) => state.leaveRoom)
  const [leaving, setLeaving] = useState(false)

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
  const startIds = game.map.startHexIds ?? [game.map.startHexId]

  return (
    <main className="page shell journey-page game-shell">
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
              {winner?.name ?? 'Gracz'} dotarł do celu w turze {game.turnNumber}
              .
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
              {isChoosingStart ? 'Wybór startu' : `Tura ${game.turnNumber}`}
            </strong>
          </div>
          {game.status === 'FINISHED' ? (
            <div className="game-current-player">
              <small>STATUS</small>
              <strong>Gra zakończona</strong>
            </div>
          ) : (
            <div className="game-current-player">
              <small>{isChoosingStart ? 'WYBIERA POLE' : 'GRA TERAZ'}</small>
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
                <small className="panel-kicker">WYPRAWA</small>
                <h2>Gracze</h2>
              </div>
            </div>
            <ul className="player-list">
              {game.players.map((player, index) => (
                <li key={player.id}>
                  <div className="sidebar-player-heading">
                    <PlayerBadge
                      index={index}
                      color={player.color}
                      symbol={player.symbol}
                    />
                    <strong>{player.name}</strong>
                    {player.id === session?.playerId && <small>Ty</small>}
                  </div>
                  <div className="sidebar-player-status">
                    <small>
                      {player.connected ? 'połączony' : 'rozłączony'}
                    </small>
                    <span title="Najniższa suma punktów ruchu potrzebna do celu">
                      Do celu: <strong>{player.remainingRouteCost ?? '—'}</strong>
                    </span>
                  </div>
                  <PlayedCards game={game} player={player} />
                </li>
              ))}
            </ul>
          </aside>
        </div>
        <div className="game-main">
          {isChoosingStart && (
            <section className="panel start-choice" aria-live="polite">
              <strong>
                {isMyStartChoice
                  ? 'Wybierz pole startowe'
                  : 'Czekamy na wybór pola startowego'}
              </strong>
              <p>
                Gracze wybierają kolejno. Ostatnia osoba wybierająca rozpocznie
                grę, a tury pójdą w odwrotnej kolejności.
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
            </section>
          )}
          {!isChoosingStart && (
            <PlayerHand
              player={localPlayer}
              opponents={game.players.filter(
                (player) => player.id !== localPlayer?.id,
              )}
              isActive={isActive}
              onPlayCard={playCard}
              onUseToken={useToken}
              onEndTurn={endTurn}
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
          <HexMap
            game={game}
            playerId={session?.playerId}
            isActive={isActive}
            canChooseStart={isMyStartChoice}
            onSelectHex={movePlayer}
            onChooseStart={chooseStart}
          />
        </div>
      </section>
      <DeckPreview player={localPlayer} />
    </main>
  )
}
