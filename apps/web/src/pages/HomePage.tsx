import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <main className="page shell hero-page">
      <h1>Travel Game</h1>
      <p>
        Ścigaj się po mapie heksagonalnej. Zagrywaj karty, by zdobywać punkty
        ruchu i rozwijać swoją talię.
      </p>
      <div className="hero-actions">
        <Link className="primary-link" to="/create">
          Utwórz grę
        </Link>
        <Link className="secondary-link" to="/join">
          Dołącz do gry
        </Link>
      </div>
    </main>
  )
}
