import { useSearchParams } from 'react-router-dom'
import PlannerShell, { type Tab } from '../components/planner/PlannerShell'

const VALID_TABS: Tab[] = ['day', 'week', 'month']

export default function PlannerPage() {
  const [searchParams] = useSearchParams()
  const initialDate = searchParams.get('date') ?? undefined
  const rawTab = searchParams.get('tab')
  const initialTab = VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : undefined

  return <PlannerShell initialDate={initialDate} initialTab={initialTab} />
}
