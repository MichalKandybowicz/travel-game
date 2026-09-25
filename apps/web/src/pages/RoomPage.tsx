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
  const [copied, setCopied] = useState(false)

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
    <main className="page shell journey-page lobby-page">
      <nav className="journey-nav" aria-label="Nawigacja">
        <span className="home-brand">
          <span className="home-brand-mark" aria-hidden="true">
            ⬡
          </span>
          <span>
            TRAVEL<span className="home-brand-accent">GAME</span>
          </span>
        </span>
        <span className="journey-nav-label">Przygotowanie wyprawy</span>
      </nav>
      <header className="journey-header lobby-header">
        <div>
          <span className="home-eyebrow">WYPRAWA ZARAZ SIĘ ZACZNIE</span>
          <h1>Poczekalnia</h1>
          <p>
            Zaproszenie jest gotowe. Zbierz graczy i ustalcie, jak będzie
            wyglądać mapa.
          </p>
        </div>
        <div className="lobby-header-actions">
          <div className="room-code-badge">
            <small>KOD POKOJU</small>
            <strong>{room?.roomCode ?? roomCode}</strong>
          </div>
          <button
            type="button"
            disabled={!room}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${window.location.origin}/join?code=${roomCode}`,
                )
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? 'Skopiowano' : 'Kopiuj link'}
          </button>
          <button
            type="button"
            className="lobby-leave-button"
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
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {errorLabels[error.code] ?? error.message}
        </div>
      )}
      <div className="layout two-column lobby-layout">
        <div className="lobby-sidebar">
          <section className="panel lobby-players-panel">
            <div className="panel-header">
              <div>
                <small className="panel-kicker">UCZESTNICY</small>
                <h2>
                  Gracze <span>{playerCount}/4</span>
                </h2>
              </div>
            </div>
            <ul className="player-list">
              {room?.players.map((player, index) => (
                <li key={player.id}>
                  <span className="lobby-player-avatar" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="lobby-player-copy">
                    <strong>{player.name}</strong>
                    <small>
                      {player.connected ? 'Połączony' : 'Łączy się ponownie'}
                    </small>
                  </span>
                  {player.id === room.hostPlayerId && (
                    <span className="lobby-host-badge">Gospodarz</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="lobby-player-hint">
              Do rozpoczęcia gry potrzeba co najmniej dwóch graczy.
            </p>
          </section>
          {room && (
            <section className="panel map-shape-panel">
              <div className="panel-header">
                <div>
                  <small className="panel-kicker">PODGLĄD WYPRAWY</small>
                  <h2>Kształt mapy</h2>
                </div>
              </div>
              <MapShapePreview shape={room.mapShape} />
              <p>Kolory odróżniają płatki. Tereny i koszty pozostają ukryte.</p>
            </section>
          )}
        </div>
        <section className="panel lobby-settings-panel">
          <div className="panel-header">
            <div>
              <small className="panel-kicker">TWOJA TRASA</small>
              <h2>Ustawienia mapy</h2>
              <p>
                {isHost
                  ? 'Dopasuj wyprawę przed startem.'
                  : 'Gospodarz ustala zasady tej wyprawy.'}
              </p>
            </div>
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
            <div className="hero-actions lobby-start-actions">
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
