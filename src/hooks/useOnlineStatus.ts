import { useState, useEffect, useRef } from 'react'
import { replayQueue } from '../lib/syncQueue'
import { useAuth } from './useAuth'
import { useQueryClient } from '@tanstack/react-query'

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  const { user } = useAuth()
  const qc = useQueryClient()
  const wasOffline = useRef(!navigator.onLine)

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
      if (wasOffline.current && user) {
        wasOffline.current = false
        // Replay any queued writes then refresh affected queries
        replayQueue(user.id).then(() => {
          qc.invalidateQueries({ queryKey: ['ns_day_items'] })
          qc.invalidateQueries({ queryKey: ['ns_inbox'] })
        })
      }
    }
    function handleOffline() {
      setOnline(false)
      wasOffline.current = true
    }
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [user, qc])

  return online
}
