"use client";

import { useEffect } from "react";

/**
 * Hides the initial HTML loader after React hydration completes.
 * This component should be placed early in the component tree.
 */
export function InitialLoaderHide() {
  useEffect(() => {
    // Small delay to ensure smooth transition
    const timer = setTimeout(() => {
      const loader = document.getElementById("initial-loader");
      if (loader) {
        loader.classList.add("hidden");
        // Remove from DOM after transition
        setTimeout(() => {
          loader.remove();
        }, 300);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
