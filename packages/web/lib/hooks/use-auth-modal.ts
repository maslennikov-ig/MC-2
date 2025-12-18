"use client"

import { create } from 'zustand'

export type AuthModalMode = 'login' | 'register'

interface AuthModalStore {
  isOpen: boolean
  mode: AuthModalMode
  returnTo: string | null
  onSuccessCallback: (() => void) | null
  
  open: (mode?: AuthModalMode, options?: {
    returnTo?: string
    onSuccess?: () => void
  }) => void
  
  close: () => void
  
  setMode: (mode: AuthModalMode) => void
}

export const useAuthModal = create<AuthModalStore>((set) => ({
  isOpen: false,
  mode: 'login',
  returnTo: null,
  onSuccessCallback: null,
  
  open: (mode = 'login', options = {}) => {
    set({
      isOpen: true,
      mode,
      returnTo: options.returnTo || null,
      onSuccessCallback: options.onSuccess || null,
    })
  },
  
  close: () => {
    set({
      isOpen: false,
      returnTo: null,
      onSuccessCallback: null,
    })
  },
  
  setMode: (mode) => {
    set({ mode })
  },
}))