import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { defaultSettings, useGameStore } from '../store.js'
import { errorLabels } from '../labels.js'
import { MapShapePreview } from '../components/MapShapePreview.js'
import { PlayerBadge } from '../components/PlayerBadge.js'
import { PlayerSymbol } from '../components/PlayerSymbol.js'
import { PLAYER_COLORS, PLAYER_SYMBOLS } from '@shared'
import {
  playerColor,
  playerSymbol,
  playerSymbolLabels,
} from '../playerColors.js'

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
  const updateAppearance = useGameStore((state) => state.updateAppearance)
  const updatePlayerName = useGameStore((state) => state.updatePlayerName)
  const addBot = useGameStore((state) => state.addBot)
  const removeBot = useGameStore((state) => state.removeBot)
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
  const myIndex =
    room?.players.findIndex((player) => player.id === session?.playerId) ?? -1
  const me = myIndex >= 0 ? room?.players[myIndex] : undefined
  const myColor = playerColor(Math.max(0, myIndex), me?.color)
  const mySymbol = playerSymbol(Math.max(0, myIndex), me?.symbol)

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
      <div className="layout lobby-layout">
        <section className="panel lobby-players-panel">
          <div className="panel-header">
            <div>
              <small className="panel-kicker">UCZESTNICY</small>
              <h2>
                Gracze <span>{playerCount}/4</span>
              </h2>
            </div>
            {isHost && room?.status === 'LOBBY' && (
              <button
                type="button"
                className="lobby-add-bot"
                disabled={playerCount >= 4}
                onClick={addBot}
              >
                + Dodaj bota
              </button>
            )}
          </div>
          <ul className="player-list">
            {room?.players.map((player, index) => (
              <li key={player.id}>
                <PlayerBadge
                  index={index}
                  color={player.color}
                  symbol={player.symbol}
                />
                <span className="lobby-player-copy">
                  <strong>{player.name}</strong>
                  <small>
                    {player.isBot
                      ? 'Bot'
                      : player.connected
                        ? 'Połączony'
                        : 'Łączy się ponownie'}
                  </small>
                </span>
                {player.id === room.hostPlayerId && (
                  <span className="lobby-host-badge">Gospodarz</span>
                )}
                {isHost && player.isBot && (
                  <button
                    type="button"
                    className="lobby-remove-bot"
                    aria-label={`Usuń ${player.name}`}
                    title={`Usuń ${player.name}`}
                    onClick={() => removeBot(player.id)}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="lobby-player-hint">
            Do rozpoczęcia gry potrzeba co najmniej dwóch graczy.
          </p>
          {me && room?.status === 'LOBBY' && (
            <div className="player-appearance-picker">
              <strong>Twój gracz</strong>
              <form
                className="lobby-player-name"
                onSubmit={(event) => {
                  event.preventDefault()
                  const name = String(
                    new FormData(event.currentTarget).get('playerName') ?? '',
                  ).trim()
                  if (name && name !== me.name) updatePlayerName(name)
                }}
              >
                <label htmlFor="lobby-player-name">Nazwa gracza</label>
                <div>
                  <input
                    key={me.name}
                    id="lobby-player-name"
                    name="playerName"
                    defaultValue={me.name}
                    minLength={1}
                    maxLength={24}
                    required
                  />
                  <button type="submit">
                    Zapisz
                  </button>
                </div>
              </form>
              <span>Kolor</span>
              <div
                className="appearance-options"
                role="group"
                aria-label="Kolor pionka"
              >
                {PLAYER_COLORS.map((color) => {
                  const taken = room.players.some(
                    (player) => player.id !== me.id && player.color === color,
                  )
                  return (
                    <button
                      key={color}
                      type="button"
                      className="appearance-color"
                      style={{ backgroundColor: color }}
                      aria-label={`Kolor ${PLAYER_COLORS.indexOf(color) + 1}${taken ? ' — zajęty' : ''}`}
                      aria-pressed={myColor === color}
                      disabled={taken}
                      onClick={() => updateAppearance(color, mySymbol)}
                    />
                  )
                })}
              </div>
              <span>Symbol</span>
              <div
                className="appearance-options"
                role="group"
                aria-label="Symbol pionka"
              >
                {PLAYER_SYMBOLS.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    className="appearance-symbol"
                    style={{ backgroundColor: myColor }}
                    aria-label={playerSymbolLabels[symbol]}
                    aria-pressed={mySymbol === symbol}
                    title={playerSymbolLabels[symbol]}
                    onClick={() => updateAppearance(myColor, symbol)}
                  >
                    <PlayerSymbol symbol={symbol} size={19} />
                  </button>
                ))}
              </div>
            </div>
          )}
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
              Min. obozów na płatek
              <select
                value={settings.campCountMinPerPetal}
                disabled={!isHost}
                onChange={(event) => {
                  const minimum = Number(event.target.value)
                  updateSettings({
                    ...settings,
                    campCountMinPerPetal: minimum,
                    campCountMaxPerPetal: Math.max(
                      minimum,
                      settings.campCountMaxPerPetal,
                    ),
                  })
                }}
              >
                {Array.from({ length: 4 }, (_, count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Maks. obozów na płatek
              <select
                value={settings.campCountMaxPerPetal}
                disabled={!isHost}
                onChange={(event) => {
                  const maximum = Number(event.target.value)
                  updateSettings({
                    ...settings,
                    campCountMinPerPetal: Math.min(
                      settings.campCountMinPerPetal,
                      maximum,
                    ),
                    campCountMaxPerPetal: maximum,
                  })
                }}
              >
                {Array.from({ length: 5 }, (_, index) => index + 1).map(
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
