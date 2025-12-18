'use client';

import React from 'react';
import { JsonViewer } from './shared/JsonViewer';

interface InputTabProps {
  inputData?: unknown;
}

export const InputTab = ({ inputData }: InputTabProps) => {
  return <JsonViewer data={inputData} title="Input Data" defaultExpanded={true} />;
};
