import { Routes, Route, Navigate } from 'react-router-dom'
import { GameLibraryProvider } from './context/GameLibraryContext'
import AppShell from './components/AppShell'
import Puzzles from './pages/Puzzles'
import OpeningTrainer from './pages/OpeningTrainer'
import GameReview from './pages/GameReview'
import StatsDashboard from './pages/StatsDashboard'
import Admin from './pages/Admin'

export default function App() {
  return (
    <GameLibraryProvider>
      <AppShell>
        <Routes>
          <Route path="/"                element={<Navigate to="/puzzles" replace />} />
          <Route path="/puzzles"         element={<Puzzles />} />
          <Route path="/opening-trainer" element={<OpeningTrainer />} />
          <Route path="/game-review"     element={<GameReview />} />
          <Route path="/stats"           element={<StatsDashboard />} />
          <Route path="/admin"           element={<Admin />} />
        </Routes>
      </AppShell>
    </GameLibraryProvider>
  )
}
