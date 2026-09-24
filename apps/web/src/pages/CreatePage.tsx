import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { MapSettings } from '@shared'
import { defaultSettings, useGameStore } from '../store.js'

const randomSeed = (): string => `PATH-${Math.floor(Math.random() * 100000)}`

export function CreatePage() {
  const navigate = useNavigate()
  const session = useGameStore((state) => state.session)
  const room = useGameStore((state) => state.room)
  const createRoom = useGameStore((state) => state.createRoom)
  const [playerName, setPlayerName] = useState('Player 1')
  const [settings, setSettings] = useState<MapSettings>(defaultSettings)

  useEffect(() => {
    if (room?.roomCode && session?.roomCode === room.roomCode) {
      navigate(`/room/${room.roomCode}`)
    }
  }, [navigate, room?.roomCode, session?.roomCode])

  const canSubmit = useMemo(() => playerName.trim().length > 0, [playerName])

  return (
    <main className="page shell">
      <div className="page-header">
        <h1>Create Room</h1>
        <Link to="/">Back</Link>
      </div>
      <div className="form-grid">
        <label>
          Player name
          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
          />
        </label>
        <label>
          Seed
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
              Randomize
            </button>
          </div>
        </label>
        <label>
          Map size
          <select
            value={settings.mapSize}
            onChange={(event) =>
              setSettings({
                ...settings,
                mapSize: event.target.value as MapSettings['mapSize'],
              })
            }
          >
            <option value="SMALL">Small</option>
            <option value="MEDIUM">Medium</option>
            <option value="LARGE">Large</option>
          </select>
        </label>
        <label>
          Difficulty
          <select
            value={settings.difficulty}
            onChange={(event) =>
              setSettings({
                ...settings,
                difficulty: event.target.value as MapSettings['difficulty'],
              })
            }
          >
            <option value="EASY">Easy</option>
            <option value="NORMAL">Normal</option>
            <option value="HARD">Hard</option>
          </select>
        </label>
        <label>
          Route count
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
      </div>
      <button
        type="button"
        className="primary-button"
        disabled={!canSubmit}
        onClick={() => createRoom(playerName.trim(), settings)}
      >
        Create Room
      </button>
    </main>
  )
}
