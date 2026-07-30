import { useSearchParams, Navigate } from 'react-router-dom'

// Permanent redirect shim — Day/Week/Month became separate sidebar items
// and routes in v3 (SPEC §6.1), replacing the tabbed /planner screen.
// Kept so every pre-existing /planner?tab=…&date=… link — including
// anything Atlas holds — still lands correctly.
const TAB_TO_PATH: Record<string, string> = {
  day:   '/day',
  week:  '/week',
  month: '/month',
}

export default function PlannerPage() {
  const [searchParams] = useSearchParams()
  const tab  = searchParams.get('tab') ?? 'day'
  const date = searchParams.get('date')
  const path = TAB_TO_PATH[tab] ?? '/day'
  const target = date ? `${path}?date=${encodeURIComponent(date)}` : path

  return <Navigate to={target} replace />
}
