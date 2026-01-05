"use client";

import { CubeLoader } from "./cube-loader";

interface FullPageLoaderProps {
  /** Optional loading text (deprecated, no longer displayed) */
  text?: string;
  /** Color variant */
  variant?: "purple" | "cyan";
}

/**
 * Full-page loading overlay with animated cube.
 * Used for page transitions and initial page loads.
 */
export function FullPageLoader({ variant = "purple" }: FullPageLoaderProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background dark:bg-[#0a0e1a] overflow-hidden">
      <CubeLoader variant={variant} />
    </div>
  );
}
