import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

export function useKeyboardShortcuts(setIsPanning?: (isPanning: boolean) => void) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+0 to Fit View
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        fitView({ duration: 800 });
      }
      // Ctrl + = to Zoom In
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn({ duration: 300 });
      }
      // Ctrl + - to Zoom Out
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomOut({ duration: 300 });
      }
      // Space to Toggle Selection Mode (Default is Pan)
      if (e.code === 'Space' && !e.repeat && setIsPanning) {
          // e.preventDefault(); // Don't prevent default if it blocks input typing? 
          // Actually Space scrolls page usually. In graph, we want to block it.
          if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
             e.preventDefault();
             // Switch to Selection Mode (disable panning)
             setIsPanning(false);
             document.body.style.cursor = 'crosshair';
          }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space' && setIsPanning) {
            // Return to Pan Mode
            setIsPanning(true);
            document.body.style.cursor = 'default';
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [fitView, zoomIn, zoomOut, setIsPanning]);
}
