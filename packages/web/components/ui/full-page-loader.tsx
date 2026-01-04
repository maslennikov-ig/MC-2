"use client";

import { CubeLoader } from "./cube-loader";

interface FullPageLoaderProps {
  /** Optional loading text */
  text?: string;
  /** Color variant */
  variant?: "purple" | "cyan";
}

/**
 * Full-page loading overlay with animated cube.
 * Used for page transitions and initial page loads.
 */
export function FullPageLoader({ text, variant = "purple" }: FullPageLoaderProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background dark:bg-[#0a0e1a] overflow-hidden">
      <div className="flex flex-col items-center gap-8">
        <CubeLoader variant={variant} />
        {text && (
          <p className="text-muted-foreground text-sm animate-pulse mt-8">
            {text}
          </p>
        )}
      </div>
    </div>
  );
}
