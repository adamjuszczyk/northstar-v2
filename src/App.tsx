import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './hooks/useAuth'
import { usePrefetch } from './hooks/usePrefetch'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useCarryOverSweep } from './hooks/useCarryOverSweep'
import { useHabitAutoAddSweep } from './hooks/useHabitAutoAddSweep'
import { supabase } from './lib/supabase'
import { clearAllCaches } from './lib/db'
import NavBar from './components/nav/NavBar'
import AuthPage from './pages/AuthPage'
import TodayPage from './pages/TodayPage'
import DayPage from './pages/DayPage'
import WeekPage from './pages/WeekPage'
import MonthPage from './pages/MonthPage'
import GoalsPage from './pages/GoalsPage'
import TreePage from './pages/TreePage'
import PlannerPage from './pages/PlannerPage'
import InboxPage from './pages/InboxPage'
import HabitsPage from './pages/HabitsPage'
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

/**
 * Clears the query cache and local Dexie stores whenever the authenticated
 * user changes (sign-out, sign-in as a different account, session swap) —
 * prevents cached data from one account leaking into another on a shared
 * device. Skips the very first callback (the initial-session fire), since
 * that isn't a user change and would otherwise race with usePrefetch.
 */
function AuthCacheSync() {
  const qc = useQueryClient()
  const prevUserId  = useRef<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null
      if (!initialized.current) {
        initialized.current = true
        prevUserId.current  = uid
        return
      }
      if (uid !== prevUserId.current) {
        prevUserId.current = uid
        qc.clear()
        clearAllCaches()
      }
    })
    return () => subscription.unsubscribe()
  }, [qc])

  return null
}

function AuthedApp() {
  usePrefetch()
  useCarryOverSweep()
  useHabitAutoAddSweep()
  const online = useOnlineStatus()
  return (
    <div className={styles.shell}>
      <NavBar online={online} />
      <main className={styles.main}>
        <Routes>
          <Route path="/"         element={<TodayPage />} />
          <Route path="/day"      element={<DayPage />} />
          <Route path="/week"     element={<WeekPage />} />
          <Route path="/month"    element={<MonthPage />} />
          <Route path="/goals"    element={<GoalsPage />} />
          <Route path="/tree"     element={<TreePage />} />
          <Route path="/planner"  element={<PlannerPage />} />
          <Route path="/inbox"    element={<InboxPage />} />
          <Route path="/habits"   element={<HabitsPage />} />
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
      <AuthCacheSync />
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
