'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
  useCallback,
} from 'react'
import { useSupabase } from '@/lib/supabase/browser-client'
import { RealtimeChannel, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'

// Conditional logging - only in development
const isDev = process.env.NODE_ENV === 'development'
const log = (...args: unknown[]): void => {
  if (isDev) console.log('[LogsRealtimeProvider]', ...args)
}

type LogsRealtimeContextType = {
  /** True when new logs have arrived since last clearNewLogs() */
  hasNewLogs: boolean
  /** True when Supabase realtime channel is connected */
  isConnected: boolean
  /** Clear the new logs indicator */
  clearNewLogs: () => void
  /** Trigger for child components to refetch - increment to trigger */
  refreshTrigger: number
  /** Request a data refresh (increments refreshTrigger and clears hasNewLogs) */
  requestRefresh: () => void
}

const LogsRealtimeContext = createContext<LogsRealtimeContextType | undefined>(undefined)

export function LogsRealtimeProvider({ children }: { children: ReactNode }) {
  const { supabase, session, isLoading } = useSupabase()
  const [hasNewLogs, setHasNewLogs] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Subscribe to error_logs INSERT events for live notification
  // generation_trace removed: each INSERT sent full row (10-500 KB prompt_text/completion_text),
  // then client filtered by error_data — use audit polling instead
  useEffect(() => {
    if (isLoading || !session) {
      log('Waiting for auth before setting up subscription')
      return
    }

    // Cleanup previous subscription
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current)
    }

    log('Setting up realtime subscription for admin logs')

    const channel = supabase
      .channel('admin-logs-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'error_logs',
        },
        (payload) => {
          log('New error_log received:', payload.new)
          setHasNewLogs(true)
        }
      )
      .subscribe((status) => {
        log('Subscription status:', status)
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          setIsConnected(true)
          log('Successfully subscribed to realtime channel')
        } else if (
          status === REALTIME_SUBSCRIBE_STATES.CLOSED ||
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
        ) {
          setIsConnected(false)
          log('Channel status:', status)
        }
      })

    channelRef.current = channel

    return () => {
      const currentChannel = channelRef.current

      if (currentChannel) {
        try {
          void currentChannel.unsubscribe()
          void supabase.removeChannel(currentChannel)
        } catch (error) {
          console.error('[LogsRealtimeProvider] Cleanup error:', error)
        } finally {
          channelRef.current = null
          setIsConnected(false)
        }
      }
    }
  }, [supabase, isLoading, session])

  const clearNewLogs = useCallback(() => {
    setHasNewLogs(false)
  }, [])

  const requestRefresh = useCallback(() => {
    setHasNewLogs(false)
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  return (
    <LogsRealtimeContext.Provider
      value={{
        hasNewLogs,
        isConnected,
        clearNewLogs,
        refreshTrigger,
        requestRefresh,
      }}
    >
      {children}
    </LogsRealtimeContext.Provider>
  )
}

export function useLogsRealtime() {
  const context = useContext(LogsRealtimeContext)
  if (context === undefined) {
    throw new Error('useLogsRealtime must be used within a LogsRealtimeProvider')
  }
  return context
}
