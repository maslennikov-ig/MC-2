'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { StaticGraphData } from '@megacampus/shared-types';

const StaticGraphContext = createContext<StaticGraphData | null>(null);

export function useStaticGraph() {
  const context = useContext(StaticGraphContext);
  if (!context) {
    throw new Error('useStaticGraph must be used within a StaticGraphProvider');
  }
  return context;
}

interface StaticGraphProviderProps extends StaticGraphData {
  children: ReactNode;
}

export function StaticGraphProvider({ children, ...data }: StaticGraphProviderProps) {
  return (
    <StaticGraphContext.Provider value={data}>
      {children}
    </StaticGraphContext.Provider>
  );
}
