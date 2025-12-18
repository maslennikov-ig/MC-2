import { useState, useEffect } from 'react';

export function useBreakpoint(breakpoint: number = 768) {
    const [isMobile, setIsMobile] = useState(false);
    const [isTablet, setIsTablet] = useState(false);
    
    useEffect(() => {
        // Check if running in browser
        if (typeof window === 'undefined') return;

        const check = () => {
            const width = window.innerWidth;
            setIsMobile(width < breakpoint);
            setIsTablet(width >= breakpoint && width < 1024);
        };
        
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [breakpoint]);
    
    return { isMobile, isTablet };
}
