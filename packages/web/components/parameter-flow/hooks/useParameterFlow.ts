import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ParameterData {
  name: string
  value: unknown
  status: 'pending' | 'active' | 'completed' | 'failed'
}

interface StageState {
  parameters: ParameterData[]
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped'
}

interface ParameterTransfer {
  isActive: boolean
  status: 'pending' | 'active' | 'completed' | 'failed'
  paramCount: number
}

export function useParameterFlow(courseId: string) {
  const [stageStates, setStageStates] = useState<Record<string, StageState>>({})
  const [parameterTransfers, setParameterTransfers] = useState<Record<string, ParameterTransfer>>(
    {}
  )
  const [isLoading, setIsLoading] = useState(true)

  // Store timeout IDs for cleanup on unmount
  const timeoutIds = useRef<Set<NodeJS.Timeout>>(new Set())

  // Fetch initial state from generation_trace
  const fetchInitialState = useCallback(async () => {
    const supabase = createClient()

    // Fetch recent parameter-related traces
    const { data: traces } = await supabase
      .from('generation_trace')
      .select('*')
      .eq('course_id', courseId)
      .in('step_name', ['parameter_store', 'parameter_propagate', 'parameter_validate'])
      .order('created_at', { ascending: false })
      .limit(50)

    if (traces) {
      const states: Record<string, StageState> = {}
      const transfers: Record<string, ParameterTransfer> = {}

      for (const trace of traces) {
        const stage = trace.stage

        // Initialize stage state if not exists
        if (!states[stage]) {
          states[stage] = {
            parameters: [],
            status: trace.error_data ? 'failed' : 'completed',
          }
        }

        // Extract parameters from output_data
        if (trace.output_data && typeof trace.output_data === 'object') {
          const params = Object.keys(trace.output_data).map((key) => ({
            name: key,
            value: (trace.output_data as Record<string, unknown>)[key],
            status: 'completed' as const,
          }))
          states[stage].parameters = params
        }

        // Track parameter propagation
        if (trace.step_name === 'parameter_propagate' && trace.input_data) {
          const inputData = trace.input_data as { targetStage?: string }
          if (inputData.targetStage) {
            const transferKey = `${stage}_to_${inputData.targetStage}`
            transfers[transferKey] = {
              isActive: false,
              status: 'completed',
              paramCount: states[stage]?.parameters.length || 0,
            }
          }
        }
      }

      setStageStates(states)
      setParameterTransfers(transfers)
    }

    setIsLoading(false)
  }, [courseId])

  // Subscribe to real-time updates
  useEffect(() => {
    void fetchInitialState()

    const supabase = createClient()

    // Subscribe to generation_trace changes
    const channel = supabase
      .channel(`parameter-flow-${courseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'generation_trace',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          const trace = payload.new as any

          // Only process parameter-related events
          if (
            !['parameter_store', 'parameter_propagate', 'parameter_validate'].includes(
              trace.step_name
            )
          ) {
            return
          }

          const stage = trace.stage

          setStageStates((prev) => ({
            ...prev,
            [stage]: {
              parameters: trace.output_data
                ? Object.keys(trace.output_data).map((key) => ({
                    name: key,
                    value: trace.output_data[key],
                    status: 'completed' as const,
                  }))
                : prev[stage]?.parameters || [],
              status: trace.error_data ? 'failed' : 'completed',
            },
          }))

          // Handle propagation events
          if (trace.step_name === 'parameter_propagate') {
            const inputData = trace.input_data as { targetStage?: string }
            if (inputData?.targetStage) {
              const transferKey = `${stage}_to_${inputData.targetStage}`
              setParameterTransfers((prev) => ({
                ...prev,
                [transferKey]: {
                  isActive: true,
                  status: 'active',
                  paramCount: Object.keys(trace.output_data || {}).length,
                },
              }))

              // Reset animation after delay (with cleanup tracking)
              const timeoutId = setTimeout(() => {
                setParameterTransfers((prev) => ({
                  ...prev,
                  [transferKey]: {
                    ...prev[transferKey],
                    isActive: false,
                    status: 'completed',
                  },
                }))
                timeoutIds.current.delete(timeoutId)
              }, 2000)
              timeoutIds.current.add(timeoutId)
            }
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
      // Clear all pending timeouts to prevent memory leaks
      timeoutIds.current.forEach(clearTimeout)
      timeoutIds.current.clear()
    }
  }, [courseId, fetchInitialState])

  return {
    stageStates,
    parameterTransfers,
    isLoading,
  }
}
