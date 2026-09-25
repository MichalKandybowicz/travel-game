import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '../store.js'
import { errorLabels } from '../labels.js'

export function JoinPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const room = useGameStore((state) => state.room)
  const session = useGameStore((state) => state.session)
  const account = useGameStore((state) => state.account)
  const error = useGameStore((state) => state.error)
  const joinRoom = useGameStore((state) => state.joinRoom)
  const [roomCode, setRoomCode] = useState(
    (searchParams.get('code') ?? '').toUpperCase().slice(0, 5),
  )
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
    <main className="page shell journey-page join-page">
      <nav className="journey-nav" aria-label="Nawigacja">
        <Link className="home-brand" to="/">
          <span className="home-brand-mark" aria-hidden="true">
            ⬡
          </span>
          <span>
            TRAVEL<span className="home-brand-accent">GAME</span>
          </span>
        </Link>
        <Link className="journey-back" to="/">
          ← Strona główna
        </Link>
      </nav>
      <div className="join-layout">
        <div className="join-visual">
          <div className="join-visual-copy">
            <span className="home-eyebrow">WYPRAWA CZEKA</span>
            <h1>
              Najlepsze trasy odkrywa się <em>razem.</em>
            </h1>
            <p>
              Wpisz kod od gospodarza i dołącz do wspólnego wyścigu przez
              nieznane.
            </p>
          </div>
        </div>
        <section className="join-form-panel" aria-labelledby="join-title">
          <span className="home-eyebrow">DOŁĄCZ DO POKOJU</span>
          <h2 id="join-title">Masz już kod?</h2>
          <p>Pokój otworzy się po wpisaniu pięcioznakowego kodu zaproszenia.</p>
          <form
            className="join-form"
            onSubmit={(event) => {
              event.preventDefault()
              const code = roomCode.trim()
              setRequestedRoomCode(code)
              joinRoom(code, (account?.username ?? playerName).trim())
            }}
          >
            <label>
              Kod pokoju
              <input
                className="join-code-input"
                value={roomCode}
                maxLength={5}
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCDE"
                onChange={(event) =>
                  setRoomCode(event.target.value.toUpperCase())
                }
                required
              />
            </label>
            <label>
              Nazwa gracza
              <input
                value={account?.username ?? playerName}
                maxLength={24}
                disabled={Boolean(account)}
                onChange={(event) => setPlayerName(event.target.value)}
                required
              />
            </label>
            {requestedRoomCode && error && (
              <p className="auth-error" role="alert">
                {errorLabels[error.code] ?? error.message}
              </p>
            )}
            <button
              type="submit"
              className="primary-button join-submit"
              disabled={
                roomCode.trim().length !== 5 ||
                Boolean(requestedRoomCode && !error)
              }
            >
              {requestedRoomCode && !error ? 'Dołączanie…' : 'Dołącz do gry'}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <small className="join-form-footnote">
            Nie masz kodu? Poproś znajomego o zaproszenie albo utwórz własny
            pokój.
          </small>
        </section>
      </div>
    </main>
  )
}
