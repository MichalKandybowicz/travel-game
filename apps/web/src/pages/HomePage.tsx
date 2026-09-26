import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { defaultSettings, useGameStore } from '../store.js'
import { errorLabels } from '../labels.js'
import { deleteCustomMap, loadCustomMaps } from '../customMaps.js'
import type { CustomMap } from '@shared'

export function HomePage() {
  const navigate = useNavigate()
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
  const createRoom = useGameStore((state) => state.createRoom)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [createRequested, setCreateRequested] = useState(false)
  const [customMaps, setCustomMaps] = useState<CustomMap[]>([])
  const [selectedMapId, setSelectedMapId] = useState('')
  const previousRoomCode = useRef<string | undefined>(undefined)
  const hasFinishedGame =
    game?.status === 'FINISHED' || room?.status === 'FINISHED'
  const resumeCode = hasFinishedGame
    ? undefined
    : (account?.activeRoomCode ?? session?.roomCode)

  useEffect(() => {
    if (hasFinishedGame) leaveFinishedGame()
  }, [hasFinishedGame, leaveFinishedGame])

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

  useEffect(() => {
    if (!account) return
    void loadCustomMaps(account.token)
      .then(setCustomMaps)
      .catch(() => undefined)
  }, [account])

  return (
    <main className="home-page">
      <div className="home-wrap">
        <header className="home-nav">
          <Link
            className="home-brand"
            to="/"
            aria-label="Travel Game — strona główna"
          >
            <span className="home-brand-mark" aria-hidden="true">
              ⬡
            </span>
            <span>
              TRAVEL<span className="home-brand-accent">GAME</span>
            </span>
          </Link>
          <span className="home-nav-note">Magiczny wyścig dla 2–4 graczy</span>
        </header>

        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-art" aria-hidden="true" />
          <div className="home-hero-content">
            <span className="home-eyebrow">
              <span aria-hidden="true">✦</span> WYŚCIG PRZEZ ZAKLĘTE KRAINY
            </span>
            <h1 id="home-title">
              Każde zaklęcie
              <br />
              zmienia <em>przeznaczenie.</em>
            </h1>
            <p>
              Otwieraj pradawne portale, buduj talię magicznych mocy i odnajdź
              drogę przez krainy spowite mgłą. Zaproś znajomych do wspólnego
              rytuału.
            </p>

            <form
              className="home-create-form"
              onSubmit={(event) => {
                event.preventDefault()
                if (!connected || (createRequested && !error)) return
                previousRoomCode.current = session?.roomCode
                setCreateRequested(true)
                createRoom(
                  account?.username ?? 'Gracz',
                  {
                    ...defaultSettings,
                    seed: `PATH-${Math.floor(Math.random() * 1000000)}`,
                  },
                  selectedMapId || undefined,
                )
              }}
            >
              {account && (
                <div className="home-map-choice">
                  <label>
                    Źródło mapy
                    <select
                      value={selectedMapId}
                      onChange={(event) => setSelectedMapId(event.target.value)}
                    >
                      <option value="">Generator map</option>
                      {customMaps.map((customMap) => (
                        <option key={customMap.id} value={customMap.id}>
                          {customMap.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Link to="/maps/create">Otwórz kreator map</Link>
                </div>
              )}
              <div className="home-hero-actions">
                <button
                  className="home-create-button"
                  type="submit"
                  disabled={!connected || (createRequested && !error)}
                >
                  {createRequested && !error
                    ? 'Tworzenie pokoju…'
                    : 'Utwórz pokój'}
                  <span aria-hidden="true">↗</span>
                </button>
                <Link className="home-join-link" to="/join">
                  Dołącz do gry <span aria-hidden="true">→</span>
                </Link>
              </div>
            </form>
            {!connected && (
              <small className="home-connection">Łączenie z serwerem…</small>
            )}
            {createRequested && error && (
              <p className="auth-error" role="alert">
                {errorLabels[error.code] ?? error.message}
              </p>
            )}
            {resumeCode && (
              <div className="home-resume">
                <div>
                  <small>Twoja ostatnia wyprawa</small>
                  <strong>Pokój {resumeCode}</strong>
                </div>
                <Link to={`/room/${resumeCode}`}>
                  {room?.status === 'IN_GAME'
                    ? 'Wróć do gry'
                    : 'Wróć do pokoju'}{' '}
                  →
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
                    {leaving ? 'Opuszczanie…' : 'Opuść'}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="home-hero-caption" aria-hidden="true">
            NOWA KRAINA · NOWE ZAKLĘCIA · NOWE PRZEZNACZENIE
          </div>
        </section>

        {error?.code === 'LEAVE_FAILED' && (
          <div className="error-banner" role="alert">
            {errorLabels[error.code]}
          </div>
        )}

        <section className="home-below" aria-label="O grze i koncie">
          <div className="home-features">
            <div className="home-section-heading">
              <span className="home-eyebrow">JAK WYGLĄDA MAGICZNA WYPRAWA</span>
              <h2>
                Proste zasady.
                <br />
                <em>Nieoczywiste decyzje.</em>
              </h2>
            </div>
            <div className="home-feature-grid">
              <article className="home-feature">
                <span
                  className="home-feature-icon home-feature-icon-green"
                  aria-hidden="true"
                >
                  ⬡
                </span>
                <h3>Odkrywaj zaklęte krainy</h3>
                <p>
                  Wybieraj drogę przez zaklęte gaje, kryształowe wody i
                  starożytne ruiny. Każda kraina wymaga innej mocy.
                </p>
              </article>
              <article className="home-feature">
                <span
                  className="home-feature-icon home-feature-icon-gold"
                  aria-hidden="true"
                >
                  ▤
                </span>
                <h3>Buduj talię</h3>
                <p>
                  Zagrywaj karty, zdobywaj złoto i kupuj nowe możliwości na
                  wspólnym rynku.
                </p>
              </article>
              <article className="home-feature">
                <span
                  className="home-feature-icon home-feature-icon-blue"
                  aria-hidden="true"
                >
                  ✦
                </span>
                <h3>Dotrzyj pierwszy</h3>
                <p>
                  Ścigaj się ze znajomymi i wykorzystaj trasę, której inni
                  jeszcze nie dostrzegli.
                </p>
              </article>
            </div>
          </div>

          <section className="home-account" aria-labelledby="account-title">
            {account ? (
              <>
                <span className="home-eyebrow">PROFIL PODRÓŻNIKA</span>
                <h2 id="account-title">Witaj, {account.username}</h2>
                <p>
                  Twoje konto pozwala wrócić do wyprawy również na innym
                  urządzeniu.
                </p>
                <div className="home-custom-maps">
                  <div>
                    <strong>Twoje mapy</strong>
                    <Link to="/maps/create">+ Nowa mapa</Link>
                  </div>
                  {customMaps.length === 0 ? (
                    <small>Nie masz jeszcze zapisanych map.</small>
                  ) : (
                    customMaps.map((customMap) => (
                      <span key={customMap.id}>
                        {customMap.name}
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteCustomMap(account.token, customMap.id)
                            setCustomMaps((maps) =>
                              maps.filter((map) => map.id !== customMap.id),
                            )
                            if (selectedMapId === customMap.id) {
                              setSelectedMapId('')
                            }
                          }}
                        >
                          Usuń
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <button type="button" onClick={() => void logout()}>
                  Wyloguj się
                </button>
              </>
            ) : (
              <>
                <span className="home-eyebrow">ZACHOWAJ SWOJĄ WYPRAWĘ</span>
                <h2 id="account-title">
                  {mode === 'login' ? 'Wróć do gry' : 'Utwórz konto'}
                </h2>
                <p>
                  Zaloguj się, aby móc wrócić do pokoju po zmianie urządzenia
                  lub utracie połączenia.
                </p>
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
                    Hasło
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
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={busy}
                  >
                    {busy
                      ? 'Proszę czekać…'
                      : mode === 'login'
                        ? 'Zaloguj się'
                        : 'Zarejestruj się'}
                  </button>
                </form>
                <button
                  type="button"
                  className="account-switch"
                  onClick={() =>
                    setMode(mode === 'login' ? 'register' : 'login')
                  }
                >
                  {mode === 'login'
                    ? 'Nie masz konta? Zarejestruj się'
                    : 'Masz konto? Zaloguj się'}
                </button>
              </>
            )}
          </section>
        </section>
        <footer className="home-footer">
          TRAVEL GAME <span>·</span> Każda legenda zaczyna się od jednej runy.
        </footer>
      </div>
    </main>
  )
}
