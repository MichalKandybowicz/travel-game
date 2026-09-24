import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '../store.js'
import { errorLabels } from '../labels.js'

export function HomePage() {
  const account = useGameStore((state) => state.account)
  const session = useGameStore((state) => state.session)
  const room = useGameStore((state) => state.room)
  const game = useGameStore((state) => state.game)
  const leaveFinishedGame = useGameStore((state) => state.leaveFinishedGame)
  const authError = useGameStore((state) => state.authError)
  const error = useGameStore((state) => state.error)
  const connected = useGameStore((state) => state.connected)
  const register = useGameStore((state) => state.register)
  const login = useGameStore((state) => state.login)
  const logout = useGameStore((state) => state.logout)
  const leaveRoom = useGameStore((state) => state.leaveRoom)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const hasFinishedGame =
    game?.status === 'FINISHED' || room?.status === 'FINISHED'
  const resumeCode = hasFinishedGame
    ? undefined
    : (account?.activeRoomCode ?? session?.roomCode)

  useEffect(() => {
    if (hasFinishedGame) {
      leaveFinishedGame()
    }
  }, [hasFinishedGame, leaveFinishedGame])

  return (
    <main className="page shell hero-page">
      <h1>Travel Game</h1>
      <p>
        Ścigaj się po mapie heksagonalnej. Zagrywaj karty, by zdobywać punkty
        ruchu i rozwijać swoją talię.
      </p>
      <div className="hero-actions">
        {resumeCode && (
          <>
            <Link className="primary-link" to={`/room/${resumeCode}`}>
              {room?.status === 'IN_GAME' ? 'Wróć do gry' : 'Wróć do pokoju'} (
              {resumeCode})
            </Link>
            {session?.roomCode === resumeCode && (
              <button
                type="button"
                disabled={leaving || !connected}
                onClick={async () => {
                  setLeaving(true)
                  await leaveRoom()
                  setLeaving(false)
                }}
              >
                {leaving
                  ? 'Opuszczanie…'
                  : room?.status === 'IN_GAME'
                    ? 'Opuść grę'
                    : 'Opuść pokój'}
              </button>
            )}
          </>
        )}
        <Link className="primary-link" to="/create">
          Utwórz grę
        </Link>
        <Link className="secondary-link" to="/join">
          Dołącz do gry
        </Link>
      </div>
      {error?.code === 'LEAVE_FAILED' && (
        <div className="error-banner" role="alert">
          {errorLabels[error.code]}
        </div>
      )}
      <section className="panel account-panel">
        {account ? (
          <>
            <strong>Konto: {account.username}</strong>
            <p>Możesz wrócić do swojej gry po ponownym zalogowaniu.</p>
            <button type="button" onClick={() => void logout()}>
              Wyloguj
            </button>
          </>
        ) : (
          <>
            <strong>{mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}</strong>
            <p>Załóż konto, aby odzyskać grę po utracie połączenia.</p>
            <form
              className="account-form"
              onSubmit={async (event) => {
                event.preventDefault()
                setBusy(true)
                await (mode === 'login'
                  ? login(username, password)
                  : register(username, password))
                setBusy(false)
              }}
            >
              <label>
                Nazwa gracza
                <input
                  value={username}
                  minLength={3}
                  maxLength={24}
                  autoComplete="username"
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </label>
              <label>
                Hasło (co najmniej 8 znaków)
                <input
                  type="password"
                  value={password}
                  minLength={8}
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {authError && (
                <p className="auth-error" role="alert">
                  {authError}
                </p>
              )}
              <button type="submit" className="primary-button" disabled={busy}>
                {mode === 'login' ? 'Zaloguj' : 'Zarejestruj'}
              </button>
            </form>
            <button
              type="button"
              className="account-switch"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login'
                ? 'Nie masz konta? Zarejestruj się'
                : 'Masz konto? Zaloguj się'}
            </button>
          </>
        )}
      </section>
    </main>
  )
}
