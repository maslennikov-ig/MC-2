'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { RealtimeStatusData } from '@megacampus/shared-types';

const RealtimeStatusContext = createContext<RealtimeStatusData | null>(null);

export function useRealtimeStatus() {
  const context = useContext(RealtimeStatusContext);
  if (!context) {
    throw new Error('useRealtimeStatus must be used within a RealtimeStatusProvider');
  }
  return context;
}

interface RealtimeStatusProviderProps {
  value: RealtimeStatusData;
  children: ReactNode;
}

export function RealtimeStatusProvider({ value, children }: RealtimeStatusProviderProps) {
  return (
    <RealtimeStatusContext.Provider value={value}>
      {children}
    </RealtimeStatusContext.Provider>
  );
}
