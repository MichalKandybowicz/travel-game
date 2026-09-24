import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { defaultSettings, useGameStore } from '../store.js'

const randomSeed = (): string => `PATH-${Math.floor(Math.random() * 100000)}`

export function RoomPage() {
  const navigate = useNavigate()
  const { roomCode = '' } = useParams()
  const room = useGameStore((state) => state.room)
  const game = useGameStore((state) => state.game)
  const session = useGameStore((state) => state.session)
  const reconnect = useGameStore((state) => state.reconnectToRoom)
  const startGame = useGameStore((state) => state.startGame)
  const updateSettings = useGameStore((state) => state.updateSettings)

  useEffect(() => {
    if (session?.roomCode === roomCode && !room) {
      reconnect(roomCode)
    }
  }, [reconnect, room, roomCode, session?.roomCode])

  useEffect(() => {
    if (game && roomCode === game.roomCode) {
      navigate(`/game/${roomCode}`)
    }
  }, [game, navigate, roomCode])

  const isHost = session?.playerId === room?.hostPlayerId
  const settings = room?.settings ?? defaultSettings
  const playerCount = room?.players.length ?? 0
  const canStart = useMemo(
    () => Boolean(isHost && playerCount >= 2),
    [isHost, playerCount],
  )

  return (
    <main className="page shell">
      <div className="page-header">
        <div>
          <h1>Poczekalnia</h1>
          <p>Pokój: {room?.roomCode ?? roomCode}</p>
        </div>
        <Link to="/">Strona główna</Link>
      </div>
      <div className="layout two-column">
        <section className="panel">
          <div className="panel-header">
            <strong>Gracze</strong>
          </div>
          <ul className="player-list">
            {room?.players.map((player) => (
              <li key={player.id}>
                {player.name} –{' '}
                {player.connected ? 'połączony' : 'łączy się ponownie'}
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <div className="panel-header">
            <strong>Ustawienia mapy</strong>
          </div>
          <div className="form-grid compact-grid">
            <label>
              Ziarno mapy
              <input
                value={settings.seed}
                disabled={!isHost}
                onChange={(event) =>
                  updateSettings({ ...settings, seed: event.target.value })
                }
              />
            </label>
            <label>
              Rozmiar mapy
              <select
                value={settings.mapSize}
                disabled={!isHost}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    mapSize: event.target.value as typeof settings.mapSize,
                  })
                }
              >
                <option value="SMALL">Mała</option>
                <option value="MEDIUM">Średnia</option>
                <option value="LARGE">Duża</option>
              </select>
            </label>
            <label>
              Trudność
              <select
                value={settings.difficulty}
                disabled={!isHost}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    difficulty: event.target
                      .value as typeof settings.difficulty,
                  })
                }
              >
                <option value="EASY">Łatwa</option>
                <option value="NORMAL">Normalna</option>
                <option value="HARD">Trudna</option>
              </select>
            </label>
            <label>
              Liczba tras
              <input
                type="number"
                min={1}
                max={4}
                value={settings.routeCount}
                disabled={!isHost}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    routeCount: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          {isHost && (
            <div className="hero-actions">
              <button
                type="button"
                onClick={() =>
                  updateSettings({ ...settings, seed: randomSeed() })
                }
              >
                Losuj ziarno
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!canStart}
                onClick={startGame}
              >
                Rozpocznij grę
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
