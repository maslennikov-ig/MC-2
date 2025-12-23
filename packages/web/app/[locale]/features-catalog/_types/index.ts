import React from 'react';

export interface Feature {
  id: string;
  title: string;
  benefit: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
  stats?: string;
}

export interface Section {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
  features: Feature[];
}