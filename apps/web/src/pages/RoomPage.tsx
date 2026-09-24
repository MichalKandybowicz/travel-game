import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { defaultSettings, useGameStore } from '../store.js'
import { errorLabels } from '../labels.js'
import { MapShapePreview } from '../components/MapShapePreview.js'

const randomSeed = (): string => `PATH-${Math.floor(Math.random() * 100000)}`

export function RoomPage() {
  const navigate = useNavigate()
  const { roomCode = '' } = useParams()
  const room = useGameStore((state) => state.room)
  const game = useGameStore((state) => state.game)
  const session = useGameStore((state) => state.session)
  const account = useGameStore((state) => state.account)
  const error = useGameStore((state) => state.error)
  const reconnect = useGameStore((state) => state.reconnectToRoom)
  const leaveRoom = useGameStore((state) => state.leaveRoom)
  const startGame = useGameStore((state) => state.startGame)
  const updateSettings = useGameStore((state) => state.updateSettings)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (
      !room &&
      (session?.roomCode === roomCode || account?.activeRoomCode === roomCode)
    ) {
      reconnect(roomCode)
    }
  }, [account?.activeRoomCode, reconnect, room, roomCode, session?.roomCode])

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
        <button
          type="button"
          disabled={leaving || session?.roomCode !== roomCode}
          onClick={async () => {
            setLeaving(true)
            if (await leaveRoom()) {
              navigate('/')
            } else {
              setLeaving(false)
            }
          }}
        >
          {leaving ? 'Opuszczanie…' : 'Opuść pokój'}
        </button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {errorLabels[error.code] ?? error.message}
        </div>
      )}
      <div className="layout two-column">
        <div className="lobby-sidebar">
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
          {room && (
            <section className="panel map-shape-panel">
              <div className="panel-header">
                <strong>Kształt mapy</strong>
              </div>
              <MapShapePreview shape={room.mapShape} />
              <p>Kolory odróżniają płatki. Tereny i koszty pozostają ukryte.</p>
            </section>
          )}
        </div>
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
              Liczba połączonych płatków
              <select
                value={settings.petalCount}
                disabled={!isHost}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    petalCount: Number(event.target.value),
                  })
                }
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map(
                  (count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Mgła wojny
              <select
                value={settings.fogMode}
                disabled={!isHost}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    fogMode: event.target.value as typeof settings.fogMode,
                  })
                }
              >
                <option value="NONE">
                  Brak — cała mapa z typami i kosztami
                </option>
                <option value="PETAL">
                  Płatek — bieżący i sąsiedni po dojściu do granicy
                </option>
                <option value="MEDIUM">
                  Średnia — szczegóły do 2 pól, typy do 4
                </option>
                <option value="FULL">
                  Pełna — szczegóły sąsiadów, typy do 2 pól
                </option>
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
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={settings.allowSharedTiles}
                disabled={!isHost}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    allowSharedTiles: event.target.checked,
                  })
                }
              />
              Gracze mogą stać na tym samym polu
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
