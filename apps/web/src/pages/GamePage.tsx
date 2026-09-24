import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HexMap } from '../components/HexMap.js'
import { DeckPreview } from '../components/DeckPreview.js'
import { Market } from '../components/Market.js'
import { PlayedCards } from '../components/PlayedCards.js'
import { PlayerHand } from '../components/PlayerHand.js'
import { useGameStore } from '../store.js'
import { errorLabels } from '../labels.js'
import { playerColor } from '../playerColors.js'

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
  const buyCard = useGameStore((state) => state.buyCard)
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

  return (
    <main className="page shell game-shell">
      <header className="panel top-bar">
        <span>Pokój {room?.roomCode ?? game.roomCode}</span>
        <span>Tura {game.turnNumber}</span>
        {game.status === 'FINISHED' ? (
          <strong>Gra zakończona</strong>
        ) : (
          <span>
            Gra teraz:{' '}
            {
              game.players.find((player) => player.id === game.currentPlayerId)
                ?.name
            }
          </span>
        )}
        {game.settings.fogMode === 'NONE' && <span>Ziarno: {game.seed}</span>}
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
        <div className="game-sidebar">
          <aside className="panel sidebar">
            <div className="panel-header">
              <strong>Gracze</strong>
            </div>
            <ul className="player-list">
              {game.players.map((player, index) => (
                <li key={player.id}>
                  <div className="sidebar-player-heading">
                    <span
                      className="player-number"
                      style={{ backgroundColor: playerColor(index) }}
                    >
                      {index + 1}
                    </span>
                    <strong>{player.name}</strong>
                    {player.id === session?.playerId && <small>Ty</small>}
                  </div>
                  <small>{player.connected ? 'połączony' : 'rozłączony'}</small>
                </li>
              ))}
            </ul>
          </aside>
          <PlayedCards game={game} />
          <Market
            game={game}
            player={localPlayer}
            isActive={isActive}
            onBuyCard={buyCard}
          />
        </div>
        <div className="game-main">
          <PlayerHand
            player={localPlayer}
            isActive={isActive}
            onPlayCard={playCard}
            onEndTurn={endTurn}
          />
          <HexMap
            game={game}
            playerId={session?.playerId}
            isActive={isActive}
            onSelectHex={movePlayer}
          />
        </div>
      </section>
      <DeckPreview player={localPlayer} />
    </main>
  )
}
