import { useRef, useState, useCallback } from 'react';
import type { VirtualizedSectionsListHandle } from '../panels/output/VirtualizedSectionsList';

interface UseSectionNavigationReturn {
  /**
   * Ref to attach to VirtualizedSectionsList component
   */
  virtuosoRef: React.RefObject<VirtualizedSectionsListHandle | null>;

  /**
   * Index of the currently visible section (based on scroll position)
   */
  currentVisibleSection: number;

  /**
   * Smoothly scroll to a specific section
   */
  scrollToSection: (sectionIndex: number) => void;

  /**
   * Smoothly scroll to a specific lesson within a section
   */
  scrollToLesson: (sectionIndex: number, lessonIndex: number) => void;

  /**
   * Callback to track visible range changes from virtuoso
   * Pass this to VirtualizedSectionsList's onRangeChanged prop
   */
  handleRangeChanged: (visibleRange: {
    startIndex: number;
    endIndex: number;
    visibleSectionIndex: number;
  }) => void;
}

/**
 * useSectionNavigation Hook
 *
 * Provides navigation and tracking functionality for VirtualizedSectionsList.
 *
 * @example
 * ```tsx
 * const { virtuosoRef, currentVisibleSection, scrollToSection } = useSectionNavigation();
 *
 * return (
 *   <>
 *     <button onClick={() => scrollToSection(2)}>Go to Section 3</button>
 *     <VirtualizedSectionsList
 *       ref={virtuosoRef}
 *       sections={sections}
 *       onRangeChanged={handleRangeChanged}
 *     />
 *   </>
 * );
 * ```
 */
export function useSectionNavigation(): UseSectionNavigationReturn {
  const virtuosoRef = useRef<VirtualizedSectionsListHandle>(null);
  const [currentVisibleSection, setCurrentVisibleSection] = useState<number>(0);

  // Track which section is currently visible
  const handleRangeChanged = useCallback(
    (visibleRange: {
      startIndex: number;
      endIndex: number;
      visibleSectionIndex: number;
    }) => {
      setCurrentVisibleSection(visibleRange.visibleSectionIndex);
    },
    []
  );

  // Scroll to a specific section
  const scrollToSection = useCallback((sectionIndex: number) => {
    virtuosoRef.current?.scrollToSection(sectionIndex);
  }, []);

  // Scroll to a specific lesson
  const scrollToLesson = useCallback((sectionIndex: number, lessonIndex: number) => {
    virtuosoRef.current?.scrollToLesson(sectionIndex, lessonIndex);
  }, []);

  return {
    virtuosoRef,
    currentVisibleSection,
    scrollToSection,
    scrollToLesson,
    handleRangeChanged,
  };
}
