import { useEffect, useCallback, useMemo } from 'react'

type KeyCombination = string | string[]

interface UseKeyboardShortcutOptions {
  target?: Element | Document
  preventDefault?: boolean
  stopPropagation?: boolean
  enabled?: boolean
}

/**
 * Hook for handling keyboard shortcuts
 * @param keys - Key combination (e.g., 'ctrl+s', 'cmd+k', ['ctrl+s', 'cmd+s'])
 * @param callback - Function to call when shortcut is pressed
 * @param options - Additional options
 */
export function useKeyboardShortcut(
  keys: KeyCombination,
  callback: (event: KeyboardEvent) => void,
  options: UseKeyboardShortcutOptions = {}
) {
  const {
    target = document,
    preventDefault = true,
    stopPropagation = false,
    enabled = true
  } = options

  const keyArray = useMemo(() => Array.isArray(keys) ? keys : [keys], [keys])

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // Normalize key combinations
      const pressedKeys: string[] = []
      if (event.ctrlKey) pressedKeys.push('ctrl')
      if (event.metaKey) pressedKeys.push('cmd')
      if (event.altKey) pressedKeys.push('alt')
      if (event.shiftKey) pressedKeys.push('shift')
      
      // Add the main key
      const key = event.key.toLowerCase()
      if (!['control', 'meta', 'alt', 'shift'].includes(key)) {
        pressedKeys.push(key)
      }

      // Check if any of the target key combinations match
      const isMatch = keyArray.some(keyCombo => {
        const targetKeys = keyCombo.toLowerCase().split('+').sort()
        const currentKeys = pressedKeys.sort()
        
        return targetKeys.length === currentKeys.length &&
               targetKeys.every(key => currentKeys.includes(key))
      })

      if (isMatch) {
        if (preventDefault) {
          event.preventDefault()
        }
        if (stopPropagation) {
          event.stopPropagation()
        }
        callback(event)
      }
    },
    [keyArray, callback, enabled, preventDefault, stopPropagation]
  )

  useEffect(() => {
    if (!enabled) return

    const element = target === document ? document : target as Element
    
    element.addEventListener('keydown', handleKeyPress as EventListener)

    return () => {
      element.removeEventListener('keydown', handleKeyPress as EventListener)
    }
  }, [handleKeyPress, target, enabled])
}

/**
 * Hook for handling global keyboard shortcuts
 */
export function useGlobalKeyboardShortcut(
  keys: KeyCombination,
  callback: (event: KeyboardEvent) => void,
  enabled: boolean = true
) {
  return useKeyboardShortcut(keys, callback, {
    target: document,
    enabled
  })
}

/**
 * Hook for common application shortcuts
 */
export function useCommonShortcuts(callbacks: {
  onSave?: () => void
  onCopy?: () => void
  onPaste?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onFind?: () => void
  onRefresh?: () => void
}) {
  const { onSave, onCopy, onPaste, onUndo, onRedo, onFind, onRefresh } = callbacks

  useGlobalKeyboardShortcut(
    ['ctrl+s', 'cmd+s'], 
    () => onSave?.(),
    !!onSave
  )

  useGlobalKeyboardShortcut(
    ['ctrl+c', 'cmd+c'],
    () => onCopy?.(),
    !!onCopy
  )

  useGlobalKeyboardShortcut(
    ['ctrl+v', 'cmd+v'],
    () => onPaste?.(),
    !!onPaste
  )

  useGlobalKeyboardShortcut(
    ['ctrl+z', 'cmd+z'],
    () => onUndo?.(),
    !!onUndo
  )

  useGlobalKeyboardShortcut(
    ['ctrl+shift+z', 'cmd+shift+z'],
    () => onRedo?.(),
    !!onRedo
  )

  useGlobalKeyboardShortcut(
    ['ctrl+f', 'cmd+f'],
    () => onFind?.(),
    !!onFind
  )

  useGlobalKeyboardShortcut(
    ['f5', 'ctrl+r', 'cmd+r'],
    () => onRefresh?.(),
    !!onRefresh
  )
}