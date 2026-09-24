import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HexMap } from '../components/HexMap.js'
import { Market } from '../components/Market.js'
import { PlayerHand } from '../components/PlayerHand.js'
import { useGameStore } from '../store.js'

export function GamePage() {
  const navigate = useNavigate()
  const { roomCode = '' } = useParams()
  const game = useGameStore((state) => state.game)
  const room = useGameStore((state) => state.room)
  const session = useGameStore((state) => state.session)
  const error = useGameStore((state) => state.error)
  const clearError = useGameStore((state) => state.clearError)
  const reconnect = useGameStore((state) => state.reconnectToRoom)
  const playCard = useGameStore((state) => state.playCard)
  const movePlayer = useGameStore((state) => state.movePlayer)
  const buyCard = useGameStore((state) => state.buyCard)
  const endTurn = useGameStore((state) => state.endTurn)

  useEffect(() => {
    if (!session) {
      navigate('/')
      return
    }
    if (!game && session.roomCode === roomCode) {
      reconnect(roomCode)
    }
  }, [game, navigate, reconnect, roomCode, session])

  if (!game) {
    return (
      <main className="page shell">
        <p>Connecting to room {roomCode}...</p>
      </main>
    )
  }

  const localPlayer = game.players.find(
    (player) => player.id === session?.playerId,
  )
  const isActive =
    game.currentPlayerId === session?.playerId && game.status === 'ACTIVE'

  return (
    <main className="page shell game-shell">
      <header className="panel top-bar">
        <span>Room {room?.roomCode ?? game.roomCode}</span>
        <span>Turn {game.turnNumber}</span>
        <span>
          Current{' '}
          {
            game.players.find((player) => player.id === game.currentPlayerId)
              ?.name
          }
        </span>
        <span>Seed {game.seed}</span>
        {game.winnerId && (
          <strong>
            Winner:{' '}
            {game.players.find((player) => player.id === game.winnerId)?.name}
          </strong>
        )}
      </header>
      {error && (
        <div className="error-banner" role="alert" onClick={clearError}>
          {error.code}: {error.message}
        </div>
      )}
      <section className="game-layout">
        <aside className="panel sidebar">
          <div className="panel-header">
            <strong>Players</strong>
          </div>
          <ul className="player-list">
            {game.players.map((player) => (
              <li key={player.id}>
                <strong>{player.name}</strong>
                <div>
                  Movement: G {player.availableMovement.GREEN} / B{' '}
                  {player.availableMovement.BLUE} / Y{' '}
                  {player.availableMovement.YELLOW} / W{' '}
                  {player.availableMovement.WILD}
                </div>
                <div>Gold: {player.availableGold}</div>
                <div>{player.connected ? 'connected' : 'offline'}</div>
              </li>
            ))}
          </ul>
        </aside>
        <HexMap
          game={game}
          playerId={session?.playerId}
          onSelectHex={movePlayer}
        />
        <Market
          game={game}
          player={localPlayer}
          isActive={isActive}
          onBuyCard={buyCard}
        />
      </section>
      <PlayerHand
        player={localPlayer}
        isActive={isActive}
        onPlayCard={playCard}
      />
      <div className="turn-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!isActive}
          onClick={endTurn}
        >
          End Turn
        </button>
      </div>
    </main>
  )
}
