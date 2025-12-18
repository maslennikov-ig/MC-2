import { useState, useCallback } from 'react'

export interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApi<T>() {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null
  })

  const execute = useCallback(async (apiCall: () => Promise<T>) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    
    try {
      const data = await apiCall()
      setState({ data, loading: false, error: null })
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setState({ data: null, loading: false, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }, [])

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return {
    ...state,
    execute,
    reset
  }
}

// Specialized hook for mutations (POST, PUT, DELETE)
export function useMutation<TData, TVariables = void>() {
  const [state, setState] = useState<ApiState<TData>>({
    data: null,
    loading: false,
    error: null
  })

  const mutate = useCallback(async (
    mutationFn: (variables: TVariables) => Promise<TData>,
    variables: TVariables
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    
    try {
      const data = await mutationFn(variables)
      setState({ data, loading: false, error: null })
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Mutation failed'
      setState({ data: null, loading: false, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }, [])

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return {
    ...state,
    mutate,
    reset
  }
}

// Hook for handling async operations with loading states
export function useAsyncOperation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const executeAsync = useCallback(async <T>(
    operation: () => Promise<T>,
    onSuccess?: (data: T) => void,
    onError?: (error: string) => void
  ) => {
    setLoading(true)
    setError(null)

    try {
      const result = await operation()
      onSuccess?.(result)
      return { success: true, data: result }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Operation failed'
      setError(errorMessage)
      onError?.(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    executeAsync,
    clearError: () => setError(null)
  }
}