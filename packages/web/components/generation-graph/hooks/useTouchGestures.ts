import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

export function useTouchGestures() {
  const { fitView } = useReactFlow();

  useEffect(() => {
    // React Flow handles basic pan/zoom natively.
    // We add a 3-finger tap shortcut to fit view.
    
    const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 3) {
            e.preventDefault(); // Prevent browser gestures
            fitView({ padding: 0.1, duration: 300 });
        }
    };

    // We attach to window/document to catch it globally in the graph context
    // Ideally this should be attached to the flow container ref, but document is fine for this specific shortcut.
    document.addEventListener('touchstart', handleTouchStart);
    return () => document.removeEventListener('touchstart', handleTouchStart);
  }, [fitView]);
}
