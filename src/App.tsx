import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from './hooks/useAuth'
import { usePrefetch } from './hooks/usePrefetch'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import NavBar from './components/nav/NavBar'
import AuthPage from './pages/AuthPage'
import TodayPage from './pages/TodayPage'
import TreePage from './pages/TreePage'
import PlannerPage from './pages/PlannerPage'
import InboxPage from './pages/InboxPage'
import SettingsPage from './pages/SettingsPage'
import styles from './App.module.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime:    1000 * 60 * 60,
    },
  },
})

function AuthedApp() {
  usePrefetch()
  const online = useOnlineStatus()
  return (
    <div className={styles.shell}>
      <NavBar online={online} />
      <main className={styles.main}>
        <Routes>
          <Route path="/"         element={<TodayPage />} />
          <Route path="/tree"     element={<TreePage />} />
          <Route path="/planner"  element={<PlannerPage />} />
          <Route path="/inbox"    element={<InboxPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className={styles.loading}>
        <span className={styles.loadingStar}>✦</span>
      </div>
    )
  }

  if (!session) {
    return (
      <div className={styles.authWrapper}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*"     element={<Navigate to="/auth" replace />} />
        </Routes>
      </div>
    )
  }

  return <AuthedApp />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className={styles.root}>
          <div className={styles.ambient} />
          <div className={styles.dots} />
          <div className={styles.vignette} />
          <AppRoutes />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
