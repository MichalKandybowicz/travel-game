import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HexMap } from '../components/HexMap.js'
import { DeckPreview } from '../components/DeckPreview.js'
import { Market } from '../components/Market.js'
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
        <p>Łączenie z pokojem {roomCode}...</p>
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
        <span>Pokój {room?.roomCode ?? game.roomCode}</span>
        <span>Tura {game.turnNumber}</span>
        <span>
          Gra teraz:{' '}
          {
            game.players.find((player) => player.id === game.currentPlayerId)
              ?.name
          }
        </span>
        <span>Ziarno: {game.seed}</span>
        {game.winnerId && (
          <strong>
            Zwycięzca:{' '}
            {game.players.find((player) => player.id === game.winnerId)?.name}
          </strong>
        )}
      </header>
      {error && (
        <div className="error-banner" role="alert" onClick={clearError}>
          {errorLabels[error.code] ?? error.message}
        </div>
      )}
      <section className="game-layout">
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
                <div>
                  Ruch: zielone {player.availableMovement.GREEN} / niebieskie{' '}
                  {player.availableMovement.BLUE} / żółte{' '}
                  {player.availableMovement.YELLOW} / dowolne{' '}
                  {player.availableMovement.WILD}
                </div>
                <div>Złoto: {player.availableGold}</div>
                <div>{player.connected ? 'połączony' : 'rozłączony'}</div>
              </li>
            ))}
          </ul>
        </aside>
        <HexMap
          game={game}
          playerId={session?.playerId}
          isActive={isActive}
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
      <DeckPreview player={localPlayer} />
      <div className="turn-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!isActive}
          onClick={endTurn}
        >
          Zakończ turę
        </button>
      </div>
    </main>
  )
}
