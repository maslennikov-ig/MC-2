"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FullPageLoader } from "@/components/ui/full-page-loader";

/**
 * Delay before showing loader (ms).
 * If page loads faster than this, loader won't flash.
 */
const LOADER_DELAY_MS = 300;

/**
 * Global page transition loader.
 * Shows animated cube loader during navigation between pages.
 *
 * Key feature: 300ms delay before showing loader.
 * This prevents annoying "flash" on fast page loads.
 *
 * Works by:
 * 1. Intercepting clicks on internal links
 * 2. Detecting pathname/search changes
 * 3. Showing loader after delay (only if still loading)
 */
export function PageTransitionLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // isPending = navigation started, isVisible = show loader
  const [isPending, setIsPending] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [loadingText, setLoadingText] = useState<string>();

  // Track the previous URL to detect actual navigation
  const [previousUrl, setPreviousUrl] = useState<string>("");

  // Ref to track delay timeout
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Start loading (with delay before showing)
  const startLoading = useCallback((text?: string) => {
    setIsPending(true);
    setLoadingText(text);

    // Clear any existing timeout
    if (delayTimeoutRef.current) {
      clearTimeout(delayTimeoutRef.current);
    }

    // Show loader after delay (prevents flash on fast loads)
    delayTimeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, LOADER_DELAY_MS);
  }, []);

  // Stop loading
  const stopLoading = useCallback(() => {
    // Clear delay timeout
    if (delayTimeoutRef.current) {
      clearTimeout(delayTimeoutRef.current);
      delayTimeoutRef.current = null;
    }

    setIsPending(false);
    setIsVisible(false);
    setLoadingText(undefined);
  }, []);

  // Hide loader when route changes complete
  useEffect(() => {
    const currentUrl = pathname + searchParams.toString();

    if (previousUrl && previousUrl !== currentUrl) {
      // Navigation completed
      stopLoading();
    }

    setPreviousUrl(currentUrl);
  }, [pathname, searchParams, previousUrl, stopLoading]);

  // Intercept link clicks to show loader
  const handleLinkClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");

      if (!link) return;

      const href = link.getAttribute("href");
      if (!href) return;

      // Skip external links, hash links, and special protocols
      if (
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      ) {
        return;
      }

      // Skip if modifier keys are pressed (new tab, etc)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      // Skip if same page navigation
      const currentPath = window.location.pathname + window.location.search;
      const targetPath = href.startsWith("/") ? href : `/${href}`;

      if (currentPath === targetPath) {
        return;
      }

      // Determine loading text based on URL
      let text: string | undefined;
      if (href.includes("/course/") || href.includes("/courses/")) {
        text = "Loading course...";
      } else if (href.includes("/admin")) {
        text = "Loading...";
      } else if (href.includes("/lesson")) {
        text = "Loading lesson...";
      }

      startLoading(text);
    },
    [startLoading]
  );

  // Intercept button clicks that trigger navigation
  const handleButtonClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest("button");

      if (!button) return;

      // Check for data attributes indicating navigation
      const navigateTo = button.dataset.navigateTo;
      if (navigateTo) {
        startLoading();
        return;
      }

      // Check for common patterns in button text that suggest navigation
      const buttonText = button.textContent?.toLowerCase() || "";

      // Patterns that suggest navigation to heavy pages
      const navigationPatterns = [
        "open course",
        "открыть курс",
        "preview",
        "просмотр",
        "view course",
        "посмотреть курс",
      ];

      if (navigationPatterns.some((pattern) => buttonText.includes(pattern))) {
        startLoading("Loading course...");
      }
    },
    [startLoading]
  );

  // Listen for navigation events
  useEffect(() => {
    document.addEventListener("click", handleLinkClick, { capture: true });
    document.addEventListener("click", handleButtonClick, { capture: true });

    const handlePopState = () => {
      startLoading();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleLinkClick, { capture: true });
      document.removeEventListener("click", handleButtonClick, { capture: true });
      window.removeEventListener("popstate", handlePopState);
    };
  }, [handleLinkClick, handleButtonClick, startLoading]);

  // Safety timeout - hide loader if stuck for too long
  useEffect(() => {
    if (!isPending) return;

    const timeout = setTimeout(() => {
      stopLoading();
    }, 15000); // 15 second max

    return () => clearTimeout(timeout);
  }, [isPending, stopLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
      }
    };
  }, []);

  // Only show if visible (after delay)
  if (!isVisible) return null;

  return <FullPageLoader text={loadingText} variant="purple" />;
}
