import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { GamePage } from './pages/GamePage.js'
import { HomePage } from './pages/HomePage.js'
import { JoinPage } from './pages/JoinPage.js'
import { MapCreatorPage } from './pages/MapCreatorPage.js'
import { RoomPage } from './pages/RoomPage.js'
import { useGameStore } from './store.js'

function App() {
  const initialize = useGameStore((state) => state.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/create" element={<Navigate to="/" replace />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/maps/create" element={<MapCreatorPage />} />
      <Route path="/room/:roomCode" element={<RoomPage />} />
      <Route path="/game/:roomCode" element={<GamePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
