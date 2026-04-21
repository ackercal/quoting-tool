import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import ProjectPage from './pages/ProjectPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/projects/:id" element={<ProjectPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
