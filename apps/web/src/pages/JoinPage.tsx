import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGameStore } from '../store.js'
import { errorLabels } from '../labels.js'

export function JoinPage() {
  const navigate = useNavigate()
  const room = useGameStore((state) => state.room)
  const session = useGameStore((state) => state.session)
  const account = useGameStore((state) => state.account)
  const error = useGameStore((state) => state.error)
  const joinRoom = useGameStore((state) => state.joinRoom)
  const [roomCode, setRoomCode] = useState('')
  const [playerName, setPlayerName] = useState(session?.playerName ?? 'Gracz 2')
  const [requestedRoomCode, setRequestedRoomCode] = useState<string>()

  useEffect(() => {
    if (
      requestedRoomCode &&
      room?.roomCode === requestedRoomCode &&
      session?.roomCode === requestedRoomCode
    ) {
      navigate(`/room/${room.roomCode}`)
    }
  }, [navigate, requestedRoomCode, room?.roomCode, session?.roomCode])

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
            value={account?.username ?? playerName}
            disabled={Boolean(account)}
            onChange={(event) => setPlayerName(event.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className="primary-button"
        disabled={!roomCode.trim() || Boolean(requestedRoomCode && !error)}
        onClick={() => {
          const code = roomCode.trim()
          setRequestedRoomCode(code)
          joinRoom(code, (account?.username ?? playerName).trim())
        }}
      >
        {requestedRoomCode && !error ? 'Dołączanie…' : 'Dołącz do gry'}
      </button>
      {requestedRoomCode && error && (
        <p className="auth-error" role="alert">
          {errorLabels[error.code] ?? error.message}
        </p>
      )}
    </main>
  )
}
