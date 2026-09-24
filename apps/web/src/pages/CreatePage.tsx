import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { MapSettings } from '@shared'
import { defaultSettings, useGameStore } from '../store.js'
import { errorLabels } from '../labels.js'

const randomSeed = (): string => `PATH-${Math.floor(Math.random() * 100000)}`

export function CreatePage() {
  const navigate = useNavigate()
  const session = useGameStore((state) => state.session)
  const account = useGameStore((state) => state.account)
  const room = useGameStore((state) => state.room)
  const error = useGameStore((state) => state.error)
  const createRoom = useGameStore((state) => state.createRoom)
  const [playerName, setPlayerName] = useState('Gracz 1')
  const [settings, setSettings] = useState<MapSettings>(defaultSettings)
  const [createRequested, setCreateRequested] = useState(false)
  const previousRoomCode = useRef(session?.roomCode)

  useEffect(() => {
    if (
      createRequested &&
      room?.status === 'LOBBY' &&
      room.roomCode !== previousRoomCode.current &&
      session?.roomCode === room.roomCode
    ) {
      navigate(`/room/${room.roomCode}`)
    }
  }, [createRequested, navigate, room, session?.roomCode])

  const canSubmit = useMemo(() => playerName.trim().length > 0, [playerName])

  return (
    <main className="page shell">
      <div className="page-header">
        <h1>Utwórz pokój</h1>
        <Link to="/">Wróć</Link>
      </div>
      <div className="form-grid">
        <label>
          Nazwa gracza
          <input
            value={account?.username ?? playerName}
            disabled={Boolean(account)}
            onChange={(event) => setPlayerName(event.target.value)}
          />
        </label>
        <label>
          Ziarno mapy
          <div className="inline-field">
            <input
              value={settings.seed}
              onChange={(event) =>
                setSettings({ ...settings, seed: event.target.value })
              }
            />
            <button
              type="button"
              onClick={() => setSettings({ ...settings, seed: randomSeed() })}
            >
              Losuj
            </button>
          </div>
        </label>
        <label>
          Rozmiar mapy
          <select
            value={settings.mapSize}
            onChange={(event) =>
              setSettings({
                ...settings,
                mapSize: event.target.value as MapSettings['mapSize'],
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
            onChange={(event) =>
              setSettings({
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
            onChange={(event) =>
              setSettings({
                ...settings,
                fogMode: event.target.value as MapSettings['fogMode'],
              })
            }
          >
            <option value="NONE">Brak — cała mapa z typami i kosztami</option>
            <option value="PETAL">
              Płatek — szczegóły tylko na bieżącym płatku
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
            onChange={(event) =>
              setSettings({
                ...settings,
                difficulty: event.target.value as MapSettings['difficulty'],
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
            onChange={(event) =>
              setSettings({
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
            onChange={(event) =>
              setSettings({
                ...settings,
                allowSharedTiles: event.target.checked,
              })
            }
          />
          Gracze mogą stać na tym samym polu
        </label>
      </div>
      <button
        type="button"
        className="primary-button"
        disabled={!canSubmit || (createRequested && !error)}
        onClick={() => {
          previousRoomCode.current = session?.roomCode
          setCreateRequested(true)
          createRoom((account?.username ?? playerName).trim(), settings)
        }}
      >
        {createRequested && !error ? 'Tworzenie pokoju…' : 'Utwórz pokój'}
      </button>
      {createRequested && error && (
        <p className="auth-error" role="alert">
          {errorLabels[error.code] ?? error.message}
        </p>
      )}
    </main>
  )
}
