import React from 'react';

export interface GenerationFormat {
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  available: boolean; // indicates if format is available for use
  required?: boolean; // if true, format is always enabled and cannot be toggled
}
