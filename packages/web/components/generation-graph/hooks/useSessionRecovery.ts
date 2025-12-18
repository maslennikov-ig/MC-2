import { useEffect, useCallback } from 'react';
import { useReactFlow, Viewport } from '@xyflow/react';

const STORAGE_KEY_PREFIX = 'graph_viewport_';

/**
 * Persists graph viewport position to localStorage per course.
 * Restores position on mount, saves on changes.
 * T120: Persist graph positions to localStorage per TRD Open Question #1
 */
export function useSessionRecovery(courseId?: string) {
    const { setViewport, getViewport } = useReactFlow();
    const storageKey = courseId ? `${STORAGE_KEY_PREFIX}${courseId}` : `${STORAGE_KEY_PREFIX}default`;

    // Save viewport to localStorage
    const saveViewport = useCallback(() => {
        try {
            const viewport = getViewport();
            localStorage.setItem(storageKey, JSON.stringify(viewport));
        } catch (_e) {
            // localStorage might be full or disabled - ignore silently
        }
    }, [getViewport, storageKey]);

    // Save periodically and on unmount
    useEffect(() => {
        const interval = setInterval(saveViewport, 2000);

        // Save on page unload
        const handleBeforeUnload = () => saveViewport();
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            saveViewport(); // Save on unmount
        };
    }, [saveViewport]);

    // Restore on mount
    useEffect(() => {
        // Try localStorage first
        const saved = localStorage.getItem(storageKey);
        
        if (saved) {
            try {
                const viewport = JSON.parse(saved) as Viewport;
                if (viewport.x !== undefined && viewport.zoom !== undefined) {
                    // Set viewport immediately
                    setViewport(viewport);
                }
            } catch (_e) {
                // Ignore invalid storage data
            }
        }
    }, [setViewport, storageKey]);
}
