import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGameStore } from '../store.js'

export function JoinPage() {
  const navigate = useNavigate()
  const room = useGameStore((state) => state.room)
  const session = useGameStore((state) => state.session)
  const joinRoom = useGameStore((state) => state.joinRoom)
  const [roomCode, setRoomCode] = useState('')
  const [playerName, setPlayerName] = useState(session?.playerName ?? 'Gracz 2')

  useEffect(() => {
    if (room?.roomCode && session?.roomCode === room.roomCode) {
      navigate(`/room/${room.roomCode}`)
    }
  }, [navigate, room?.roomCode, session?.roomCode])

  return (
    <main className="page shell">
      <div className="page-header">
        <h1>Dołącz do pokoju</h1>
        <Link to="/">Wróć</Link>
      </div>
      <div className="form-grid">
        <label>
          Kod pokoju
          <input
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          />
        </label>
        <label>
          Nazwa gracza
          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className="primary-button"
        onClick={() => joinRoom(roomCode.trim(), playerName.trim())}
      >
        Dołącz do gry
      </button>
    </main>
  )
}
