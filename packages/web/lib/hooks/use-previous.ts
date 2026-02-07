import { useEffect, useRef } from 'react'

/**
 * Returns the value from the previous render.
 *
 * The ref is updated inside useEffect (runs after every render).
 * The returned value is read during render from ref.current,
 * so all effects in the component see the PREVIOUS render's value.
 *
 * Returns `undefined` on the first render (no previous value exists).
 * This naturally handles "skip initial mount" -- just check `if (prev === undefined)`.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined)
  useEffect(() => {
    ref.current = value
  })
  return ref.current
}
