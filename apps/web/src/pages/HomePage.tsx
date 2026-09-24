import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <main className="page shell hero-page">
      <h1>Travel Game</h1>
      <p>
        Race across an original procedural hex map with deck-building movement
        cards.
      </p>
      <div className="hero-actions">
        <Link className="primary-link" to="/create">
          Create Game
        </Link>
        <Link className="secondary-link" to="/join">
          Join Game
        </Link>
      </div>
    </main>
  )
}
