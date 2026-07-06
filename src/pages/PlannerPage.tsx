import { useSearchParams } from 'react-router-dom'
import PlannerShell from '../components/planner/PlannerShell'

export default function PlannerPage() {
  const [searchParams] = useSearchParams()
  const initialDate = searchParams.get('date') ?? undefined

  return <PlannerShell initialDate={initialDate} />
}
