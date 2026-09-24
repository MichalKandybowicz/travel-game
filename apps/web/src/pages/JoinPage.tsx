import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGameStore } from '../store.js'

export function JoinPage() {
  const navigate = useNavigate()
  const room = useGameStore((state) => state.room)
  const session = useGameStore((state) => state.session)
  const joinRoom = useGameStore((state) => state.joinRoom)
  const [roomCode, setRoomCode] = useState('')
  const [playerName, setPlayerName] = useState(
    session?.playerName ?? 'Player 2',
  )

  useEffect(() => {
    if (room?.roomCode && session?.roomCode === room.roomCode) {
      navigate(`/room/${room.roomCode}`)
    }
  }, [navigate, room?.roomCode, session?.roomCode])

  return (
    <main className="page shell">
      <div className="page-header">
        <h1>Join Room</h1>
        <Link to="/">Back</Link>
      </div>
      <div className="form-grid">
        <label>
          Room code
          <input
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          />
        </label>
        <label>
          Player name
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
        Join Game
      </button>
    </main>
  )
}
