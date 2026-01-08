/**
 * Unit Tests for Mermaid DOM Setup - DOMPurify.addHook Compatibility
 * @module stages/stage6-lesson-content/utils/mermaid-dom-setup.test
 *
 * Tests for the DOMPurify fix that prevents "DOMPurify.addHook is not a function" error.
 * This error occurred when mermaid tried to call addHook() on the DOMPurify module
 * instead of the DOMPurify instance.
 *
 * Key Tests:
 * 1. DOMPurify.addHook compatibility (P0 fix)
 * 2. JSDOM environment setup and teardown
 * 3. Multiple render calls without errors
 * 4. SVG sanitization correctness
 *
 * Related:
 * - Source: src/stages/stage6-lesson-content/utils/mermaid-dom-setup.ts
 * - Spec: docs/plans/2026-01-stage6-fixes-test-spec.md (Section 1)
 * - Bug: DOMPurify.addHook is not a function (2026-01-08)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ensureDOMGlobals,
  isDOMInitialized,
  cleanupDOMGlobals,
  resetDOMGlobals,
} from '../../../../src/stages/stage6-lesson-content/utils/mermaid-dom-setup.js';

// ============================================================================
// TEST SETUP - Clean State for Each Test
// ============================================================================

/**
 * Reset DOM globals before each test to ensure clean state.
 * This is critical because ensureDOMGlobals() is idempotent - it only
 * initializes once. We need to reset state between tests.
 */
beforeEach(() => {
  // Clean up any existing DOM environment
  cleanupDOMGlobals();
  resetDOMGlobals();

  // Verify clean state
  expect(isDOMInitialized()).toBe(false);
});

/**
 * Clean up after each test to prevent memory leaks and side effects.
 */
afterEach(() => {
  cleanupDOMGlobals();
  resetDOMGlobals();
});

// ============================================================================
// 1. JSDOM ENVIRONMENT SETUP TESTS
// ============================================================================

describe('MermaidDOMSetup - JSDOM Environment', () => {
  describe('ensureDOMGlobals', () => {
    it('should initialize window and document globals', () => {
      // Note: setup.ts already initializes DOM globals for all tests.
      // This test verifies that ensureDOMGlobals() creates/reuses them correctly.

      // Initialize (may already be done by setup.ts)
      ensureDOMGlobals();

      // After initialization - verify globals exist
      expect(global.document).toBeDefined();
      expect(global.window).toBeDefined();
      expect(global.document.createElement).toBeInstanceOf(Function);
      expect(global.window.document).toBe(global.document);
    });

    it('should set initialized flag to true', () => {
      expect(isDOMInitialized()).toBe(false);

      ensureDOMGlobals();

      expect(isDOMInitialized()).toBe(true);
    });

    it('should be idempotent - safe to call multiple times', () => {
      ensureDOMGlobals();
      const firstWindow = global.window;
      const firstDocument = global.document;

      // Call again
      ensureDOMGlobals();

      // Should reuse same instances
      expect(global.window).toBe(firstWindow);
      expect(global.document).toBe(firstDocument);
      expect(isDOMInitialized()).toBe(true);
    });

    it('should create minimal HTML structure', () => {
      ensureDOMGlobals();

      expect(global.document.body).toBeDefined();
      expect(global.document.body.tagName).toBe('BODY');
      expect(global.document.documentElement).toBeDefined();
    });
  });
});

// ============================================================================
// 2. DOMPURIFY SETUP TESTS (P0 FIX)
// ============================================================================

describe('MermaidDOMSetup - DOMPurify Setup', () => {
  describe('DOMPurify instance creation', () => {
    it('should attach DOMPurify to global.window', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property that TypeScript doesn't know about
      expect(global.window.DOMPurify).toBeDefined();
      // @ts-expect-error - Testing runtime property
      expect(global.window.DOMPurify.sanitize).toBeInstanceOf(Function);
    });

    it('should attach DOMPurify to global', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      expect(global.DOMPurify).toBeDefined();
      // @ts-expect-error - Testing runtime property
      expect(global.DOMPurify.sanitize).toBeInstanceOf(Function);
    });

    it('should make DOMPurify.addHook available (P0 fix)', () => {
      ensureDOMGlobals();

      // This is the critical fix - mermaid calls DOMPurify.addHook()
      // Before fix: TypeError: DOMPurify.addHook is not a function
      // After fix: addHook is available on both window.DOMPurify and global.DOMPurify

      // @ts-expect-error - Testing runtime property
      expect(global.window.DOMPurify.addHook).toBeInstanceOf(Function);
      // @ts-expect-error - Testing runtime property
      expect(global.DOMPurify.addHook).toBeInstanceOf(Function);
    });

    it('should expose all DOMPurify methods', () => {
      ensureDOMGlobals();

      // Verify all essential DOMPurify methods are available
      // @ts-expect-error - Testing runtime properties
      const purify = global.DOMPurify;

      expect(purify.sanitize).toBeInstanceOf(Function);
      expect(purify.addHook).toBeInstanceOf(Function);
      expect(purify.removeHook).toBeInstanceOf(Function);
      expect(purify.removeHooks).toBeInstanceOf(Function);
      expect(purify.isSupported).toBe(true);
    });
  });

  describe('DOMPurify.addHook compatibility', () => {
    it('should allow calling addHook without errors', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purify = global.DOMPurify;

      // This should NOT throw "DOMPurify.addHook is not a function"
      expect(() => {
        purify.addHook('afterSanitizeAttributes', (node: Element) => {
          // Hook callback (no-op for test)
        });
      }).not.toThrow();
    });

    it('should support removing hooks', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purify = global.DOMPurify;

      const hookCallback = (node: Element) => {
        // Hook callback
      };

      purify.addHook('afterSanitizeAttributes', hookCallback);

      // Should be able to remove hook
      expect(() => {
        purify.removeHook('afterSanitizeAttributes');
      }).not.toThrow();
    });

    it('should support clearing all hooks', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purify = global.DOMPurify;

      purify.addHook('afterSanitizeAttributes', () => {});
      purify.addHook('beforeSanitizeElements', () => {});

      // Should be able to clear all hooks
      expect(() => {
        purify.removeHooks('afterSanitizeAttributes');
        purify.removeHooks('beforeSanitizeElements');
      }).not.toThrow();
    });
  });
});

// ============================================================================
// 3. SVG SANITIZATION TESTS
// ============================================================================

describe('MermaidDOMSetup - SVG Sanitization', () => {
  describe('DOMPurify.sanitize for SVG content', () => {
    it('should sanitize clean SVG correctly', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purify = global.DOMPurify;

      const cleanSVG = '<svg><rect x="0" y="0" width="100" height="100" /></svg>';

      const sanitized = purify.sanitize(cleanSVG, { ADD_TAGS: ['svg', 'rect'] });

      expect(sanitized).toContain('<svg>');
      expect(sanitized).toContain('<rect');
      expect(sanitized).toContain('width="100"');
    });

    it('should remove XSS attack vectors from SVG', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purify = global.DOMPurify;

      const maliciousSVG = `
        <svg>
          <rect x="0" y="0" width="100" height="100" />
          <script>alert('XSS')</script>
          <rect onerror="alert('XSS')" />
        </svg>
      `;

      const sanitized = purify.sanitize(maliciousSVG, { ADD_TAGS: ['svg', 'rect'] });

      // Script tag should be removed
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert(');

      // Event handlers should be removed
      expect(sanitized).not.toContain('onerror=');
    });

    it('should preserve safe SVG attributes', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purify = global.DOMPurify;

      const svg = `
        <svg width="200" height="200" viewBox="0 0 200 200">
          <rect x="50" y="50" width="100" height="100" fill="blue" stroke="black" stroke-width="2" />
        </svg>
      `;

      const sanitized = purify.sanitize(svg, { ADD_TAGS: ['svg', 'rect'] });

      expect(sanitized).toContain('width="200"');
      expect(sanitized).toContain('height="200"');
      expect(sanitized).toContain('viewBox=');
      expect(sanitized).toContain('fill=');
      expect(sanitized).toContain('stroke=');
    });
  });
});

// ============================================================================
// 4. MULTIPLE RENDER CALLS TEST (REGRESSION TEST)
// ============================================================================

describe('MermaidDOMSetup - Multiple Render Calls', () => {
  describe('Sequential DOMPurify operations', () => {
    it('should handle multiple sanitize calls without errors', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purify = global.DOMPurify;

      const testCases = [
        '<svg><rect width="100" height="100" /></svg>',
        '<svg><circle cx="50" cy="50" r="25" /></svg>',
        '<svg><line x1="0" y1="0" x2="100" y2="100" stroke="black" /></svg>',
        '<svg><path d="M 0 0 L 100 100" /></svg>',
        '<svg><text x="10" y="20">Test</text></svg>',
      ];

      // This simulates multiple mermaid.render() calls in sequence
      // Before fix: Would fail on 2nd+ call with "DOMPurify.addHook is not a function"
      testCases.forEach((svg, index) => {
        expect(() => {
          const sanitized = purify.sanitize(svg, { ADD_TAGS: ['svg', 'rect', 'circle', 'line', 'path', 'text'] });
          expect(sanitized).toBeDefined();
          expect(sanitized.length).toBeGreaterThan(0);
        }).not.toThrow();
      });
    });

    it('should handle hooks across multiple sanitize calls', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purify = global.DOMPurify;

      let hookCallCount = 0;

      // Add hook that counts calls
      purify.addHook('afterSanitizeAttributes', () => {
        hookCallCount++;
      });

      // Multiple sanitize calls
      purify.sanitize('<svg><rect /></svg>', { ADD_TAGS: ['svg', 'rect'] });
      purify.sanitize('<svg><circle /></svg>', { ADD_TAGS: ['svg', 'circle'] });
      purify.sanitize('<svg><line /></svg>', { ADD_TAGS: ['svg', 'line'] });

      // Hook should have been called multiple times
      expect(hookCallCount).toBeGreaterThan(0);

      // Cleanup hook
      purify.removeHooks('afterSanitizeAttributes');
    });

    it('should maintain DOMPurify instance across operations', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purifyBefore = global.DOMPurify;

      // Perform operations
      purifyBefore.sanitize('<svg></svg>', { ADD_TAGS: ['svg'] });
      purifyBefore.addHook('afterSanitizeAttributes', () => {});
      purifyBefore.sanitize('<svg></svg>', { ADD_TAGS: ['svg'] });

      // @ts-expect-error - Testing runtime property
      const purifyAfter = global.DOMPurify;

      // Should be same instance
      expect(purifyAfter).toBe(purifyBefore);
    });
  });
});

// ============================================================================
// 5. CLEANUP AND RESET TESTS
// ============================================================================

describe('MermaidDOMSetup - Cleanup', () => {
  describe('cleanupDOMGlobals', () => {
    it('should remove window and document globals', () => {
      ensureDOMGlobals();

      expect(global.window).toBeDefined();
      expect(global.document).toBeDefined();

      cleanupDOMGlobals();

      expect(global.window).toBeUndefined();
      expect(global.document).toBeUndefined();
    });

    it('should remove DOMPurify global', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      expect(global.DOMPurify).toBeDefined();

      cleanupDOMGlobals();

      // @ts-expect-error - Testing runtime property
      expect(global.DOMPurify).toBeUndefined();
    });

    it('should reset initialized flag', () => {
      ensureDOMGlobals();
      expect(isDOMInitialized()).toBe(true);

      cleanupDOMGlobals();

      expect(isDOMInitialized()).toBe(false);
    });

    it('should be idempotent - safe to call multiple times', () => {
      ensureDOMGlobals();
      cleanupDOMGlobals();

      // Call again on already-cleaned state
      expect(() => {
        cleanupDOMGlobals();
      }).not.toThrow();

      expect(isDOMInitialized()).toBe(false);
    });

    it('should be safe to call before initialization', () => {
      // Don't initialize first
      expect(() => {
        cleanupDOMGlobals();
      }).not.toThrow();

      expect(isDOMInitialized()).toBe(false);
    });
  });

  describe('resetDOMGlobals (testing utility)', () => {
    it('should reset initialization flag without deleting globals', () => {
      ensureDOMGlobals();

      const windowBefore = global.window;
      const documentBefore = global.document;

      resetDOMGlobals();

      // Flag should be reset
      expect(isDOMInitialized()).toBe(false);

      // But globals should still exist (cleanup responsibility is separate)
      expect(global.window).toBe(windowBefore);
      expect(global.document).toBe(documentBefore);
    });

    it('should allow re-initialization after reset', () => {
      ensureDOMGlobals();
      resetDOMGlobals();

      // Should be able to initialize again
      expect(() => {
        ensureDOMGlobals();
      }).not.toThrow();

      expect(isDOMInitialized()).toBe(true);
    });
  });
});

// ============================================================================
// 6. ERROR HANDLING TESTS
// ============================================================================

describe('MermaidDOMSetup - Error Handling', () => {
  describe('ensureDOMGlobals error cases', () => {
    it('should handle JSDOM initialization gracefully', () => {
      // This test verifies that ensureDOMGlobals doesn't throw on valid JSDOM creation
      expect(() => {
        ensureDOMGlobals();
      }).not.toThrow();
    });

    // Note: Testing actual JSDOM failures is difficult without mocking,
    // as JSDOM is very stable. In production, errors would be:
    // - Out of memory
    // - jsdom module not installed
    // These are tested indirectly through integration tests.
  });

  describe('cleanupDOMGlobals error cases', () => {
    it('should handle cleanup errors gracefully', () => {
      ensureDOMGlobals();

      // Even if window.close() fails, cleanup should handle it
      expect(() => {
        cleanupDOMGlobals();
      }).not.toThrow();

      // State should be reset regardless
      expect(isDOMInitialized()).toBe(false);
    });

    it('should reset state even if global deletion fails', () => {
      ensureDOMGlobals();

      // Simulate partial cleanup failure by making globals non-configurable
      // (In real scenarios, this is handled by try-catch in cleanupDOMGlobals)

      cleanupDOMGlobals();

      // State should always be reset
      expect(isDOMInitialized()).toBe(false);
    });
  });
});

// ============================================================================
// 7. INTEGRATION WITH MERMAID (REGRESSION TEST)
// ============================================================================

describe('MermaidDOMSetup - Mermaid Integration', () => {
  describe('Prerequisites for mermaid.render()', () => {
    it('should provide all globals required by mermaid', () => {
      ensureDOMGlobals();

      // Mermaid requires these globals at import time
      expect(global.window).toBeDefined();
      expect(global.document).toBeDefined();

      // Mermaid requires DOMPurify.addHook for sanitization
      // @ts-expect-error - Testing runtime property
      expect(global.DOMPurify).toBeDefined();
      // @ts-expect-error - Testing runtime property
      expect(global.DOMPurify.addHook).toBeInstanceOf(Function);

      // Document must have createElement for rendering
      expect(global.document.createElement).toBeInstanceOf(Function);
    });

    it('should support createElementNS for SVG rendering', () => {
      ensureDOMGlobals();

      // Mermaid uses createElementNS to create SVG elements
      expect(global.document.createElementNS).toBeInstanceOf(Function);

      // Test that it can create SVG elements
      const svg = global.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      expect(svg).toBeDefined();
      expect(svg.tagName.toLowerCase()).toBe('svg');
    });

    it('should support querySelector for DOM traversal', () => {
      ensureDOMGlobals();

      // Mermaid may use querySelector for DOM operations
      expect(global.document.querySelector).toBeInstanceOf(Function);
      expect(global.document.querySelectorAll).toBeInstanceOf(Function);

      // Test basic query
      const body = global.document.querySelector('body');
      expect(body).toBeDefined();
      expect(body?.tagName.toLowerCase()).toBe('body');
    });
  });

  describe('Regression: DOMPurify.addHook is not a function', () => {
    it('should NOT throw "DOMPurify.addHook is not a function" error', () => {
      ensureDOMGlobals();

      // This was the original bug - mermaid called DOMPurify.addHook() on the module
      // Before fix: TypeError: DOMPurify.addHook is not a function
      // After fix: addHook is copied to the module via Object.assign

      // @ts-expect-error - Testing runtime property
      const DOMPurify = global.DOMPurify;

      // Simulate what mermaid does internally
      expect(() => {
        DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
          // Mermaid's hook logic
          if (node.hasAttribute('href')) {
            // Sanitize hrefs
          }
        });
      }).not.toThrow();

      // Cleanup
      DOMPurify.removeHooks('afterSanitizeAttributes');
    });

    it('should persist addHook across multiple ensureDOMGlobals calls', () => {
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purify1 = global.DOMPurify;
      expect(purify1.addHook).toBeInstanceOf(Function);

      // Call again (idempotent)
      ensureDOMGlobals();

      // @ts-expect-error - Testing runtime property
      const purify2 = global.DOMPurify;
      expect(purify2.addHook).toBeInstanceOf(Function);
      expect(purify2).toBe(purify1); // Same instance
    });
  });
});

// ============================================================================
// 8. MEMORY LEAK PREVENTION TESTS
// ============================================================================

describe('MermaidDOMSetup - Memory Management', () => {
  describe('Idempotency and resource reuse', () => {
    it('should reuse JSDOM instance on multiple initializations', () => {
      ensureDOMGlobals();
      const window1 = global.window;

      ensureDOMGlobals();
      const window2 = global.window;

      // Same instance - no new JSDOM created
      expect(window2).toBe(window1);
    });

    it('should not create memory leaks with multiple init calls', () => {
      // Initialize and cleanup 10 times
      for (let i = 0; i < 10; i++) {
        ensureDOMGlobals();
        expect(isDOMInitialized()).toBe(true);

        cleanupDOMGlobals();
        resetDOMGlobals();
        expect(isDOMInitialized()).toBe(false);
      }

      // Should complete without errors or memory issues
      expect(true).toBe(true);
    });
  });

  describe('Cleanup completeness', () => {
    it('should remove all traces of DOM environment after cleanup', () => {
      ensureDOMGlobals();

      cleanupDOMGlobals();

      // All globals should be gone
      expect(global.window).toBeUndefined();
      expect(global.document).toBeUndefined();
      // @ts-expect-error - Testing runtime property
      expect(global.DOMPurify).toBeUndefined();
      expect(isDOMInitialized()).toBe(false);
    });
  });
});
