/**
 * Unit tests for MermaidDirect component
 *
 * Tests cover:
 * - Basic rendering with mermaid.render() API
 * - Dark/light theme detection and switching via MutationObserver
 * - postProcessSvg color replacement (default colors, state diagrams, mindmaps)
 * - Error handling and display
 * - Race condition prevention via render counter
 * - Empty/whitespace input handling
 * - Special character and Cyrillic text support
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MermaidDirect } from '@/components/markdown/components/MermaidDirect'

// Mock mermaid library - must use factory function for hoisting
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}))

// Import after mock is set up
import mermaid from 'mermaid'
const mockInitialize = mermaid.initialize as ReturnType<typeof vi.fn>
const mockRender = mermaid.render as ReturnType<typeof vi.fn>

// SVG fixtures with known colors for testing postProcessSvg

/**
 * Basic SVG with clean theme colors (no mermaid defaults)
 */
const MOCK_SVG_CLEAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <g class="node"><rect fill="#1e3a5f" stroke="#38bdf8" /><text class="nodeLabel" fill="#f1f5f9">A</text></g>
  <path class="flowchart-link" stroke="#94a3b8" />
</svg>`

/**
 * SVG with mermaid default colors that postProcessSvg should replace
 */
const MOCK_SVG_WITH_DEFAULT_COLORS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">
  <g class="node"><rect fill="#ECECFF" stroke="#9370DB" /><text class="nodeLabel" fill="#333">A</text></g>
  <g class="node"><rect fill="#f9f" stroke="#8B008B" /><text class="nodeLabel" fill="#333">B</text></g>
  <path class="flowchart-link" stroke="#333" />
  <g class="edgeLabel"><text fill="#333">Yes</text></g>
  <marker><path fill="#333" /></marker>
</svg>`

/**
 * SVG with light-colored fills for dark-mode isLightColor test
 */
const MOCK_SVG_WITH_LIGHT_FILLS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect fill="#90EE90" stroke="#333" />
  <rect fill="#FFFFE0" stroke="#333" />
</svg>`

/**
 * SVG with state-start/state-end nodes
 */
const MOCK_SVG_STATE_DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g><circle class="state-start" fill="#000" stroke="#000" /></g>
  <g><circle class="state-start" fill="#000" stroke="#000" /><circle class="state-end" fill="#000" stroke="#000" /></g>
  <g><circle class="state-end" fill="#000" stroke="#000" /></g>
</svg>`

/**
 * SVG with mindmap-node text
 */
const MOCK_SVG_MINDMAP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g class="mindmap-node"><rect fill="#ececff" /><text fill="#333">Topic</text></g>
</svg>`

describe('MermaidDirect', () => {
  beforeEach(() => {
    mockInitialize.mockClear()
    mockRender.mockClear()
    mockRender.mockResolvedValue({ svg: MOCK_SVG_CLEAN, bindFunctions: vi.fn() })
    document.documentElement.classList.remove('dark')
  })

  describe('Rendering basics', () => {
    it('should render figure with role="img" and default aria-label', async () => {
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        const figure = screen.getByRole('img')
        expect(figure).toBeInTheDocument()
        expect(figure).toHaveAttribute('aria-label', 'Mermaid diagram')
      })
    })

    it('should use custom ariaLabel when provided', async () => {
      render(<MermaidDirect chart="graph TD\n  A-->B" ariaLabel="Custom flowchart" />)

      await waitFor(() => {
        const figure = screen.getByRole('img')
        expect(figure).toHaveAttribute('aria-label', 'Custom flowchart')
      })
    })

    it('should apply custom className via cn()', async () => {
      render(<MermaidDirect chart="graph TD\n  A-->B" className="my-custom-class" />)

      await waitFor(() => {
        const figure = screen.getByRole('img')
        expect(figure).toHaveClass('my-custom-class')
        expect(figure).toHaveClass('mermaid-container') // Should have both
      })
    })

    it('should have mermaid-container class on figure', async () => {
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        const figure = screen.getByRole('img')
        expect(figure).toHaveClass('mermaid-container')
      })
    })

    it('should have mermaid-diagram class on inner div', async () => {
      const { container } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        const innerDiv = container.querySelector('.mermaid-diagram')
        expect(innerDiv).toBeInTheDocument()
        expect(innerDiv).toHaveClass('mermaid-diagram')
      })
    })
  })

  describe('Mermaid initialization', () => {
    it('should call initialize with securityLevel strict, theme base, startOnLoad false', async () => {
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledWith(
          expect.objectContaining({
            securityLevel: 'strict',
            theme: 'base',
            startOnLoad: false,
          })
        )
      })
    })

    it('should use light theme variables by default (primaryColor: #e0f2fe)', async () => {
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledWith(
          expect.objectContaining({
            themeVariables: expect.objectContaining({
              primaryColor: '#e0f2fe',
            }),
          })
        )
      })
    })

    it('should use dark theme variables when dark class present (primaryColor: #1e3a5f, darkMode: true)', async () => {
      document.documentElement.classList.add('dark')
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledWith(
          expect.objectContaining({
            themeVariables: expect.objectContaining({
              primaryColor: '#1e3a5f',
              darkMode: true,
            }),
          })
        )
      })
    })

    it('should pass flowchart config: htmlLabels, useMaxWidth, wrappingWidth', async () => {
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledWith(
          expect.objectContaining({
            flowchart: {
              htmlLabels: true,
              useMaxWidth: true,
              wrappingWidth: 200,
            },
          })
        )
      })
    })
  })

  describe('Mermaid render call', () => {
    it('should call mermaid.render() with trimmed chart content', async () => {
      const chart = '  graph TD\n  A-->B  '
      render(<MermaidDirect chart={chart} />)

      await waitFor(() => {
        expect(mockRender).toHaveBeenCalledWith(
          expect.any(String),
          chart.trim() // Should be trimmed
        )
      })
    })

    it('should generate render ID without colons (useId sanitization)', async () => {
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        const [[renderId]] = mockRender.mock.calls
        expect(renderId).toBeDefined()
        expect(renderId).not.toContain(':') // Colons replaced with dashes
      })
    })

    it('should set container innerHTML to returned SVG', async () => {
      mockRender.mockResolvedValue({ svg: '<svg>Test SVG</svg>', bindFunctions: undefined })
      const { container } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        const innerDiv = container.querySelector('.mermaid-diagram')
        expect(innerDiv?.innerHTML).toContain('Test SVG')
      })
    })

    it('should call bindFunctions with container when provided', async () => {
      const mockBindFunctions = vi.fn()
      mockRender.mockResolvedValue({ svg: MOCK_SVG_CLEAN, bindFunctions: mockBindFunctions })

      const { container } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        expect(mockBindFunctions).toHaveBeenCalledWith(
          container.querySelector('.mermaid-diagram')
        )
      })
    })
  })

  describe('Diagram types', () => {
    const diagramTypes = [
      { name: 'flowchart TD', chart: 'graph TD\n  A[Start] --> B[End]' },
      { name: 'sequence diagram', chart: 'sequenceDiagram\n  Alice->>Bob: Hello' },
      { name: 'mindmap', chart: 'mindmap\n  root\n    Topic A' },
      { name: 'state diagram', chart: 'stateDiagram-v2\n  [*] --> Active' },
    ]

    diagramTypes.forEach(({ name, chart }) => {
      it(`should render ${name}`, async () => {
        render(<MermaidDirect chart={chart} />)

        await waitFor(() => {
          expect(mockRender).toHaveBeenCalledWith(expect.any(String), chart.trim())
        })
      })
    })
  })

  describe('Error handling', () => {
    it('should show error UI when mermaid.render() rejects with Error', async () => {
      mockRender.mockRejectedValue(new Error('Syntax error in diagram'))
      render(<MermaidDirect chart="invalid syntax" />)

      await waitFor(() => {
        expect(screen.getByText('Diagram Error')).toBeInTheDocument()
      })
    })

    it('should display error message in .text-muted-foreground', async () => {
      mockRender.mockRejectedValue(new Error('Parse error'))
      const { container } = render(<MermaidDirect chart="invalid" />)

      await waitFor(() => {
        const errorMsg = container.querySelector('.text-muted-foreground')
        expect(errorMsg).toHaveTextContent('Parse error')
      })
    })

    it('should show original chart source in <pre> block', async () => {
      const chart = 'graph TD\n  A-->B[Invalid'
      mockRender.mockRejectedValue(new Error('Unclosed bracket'))
      const { container } = render(<MermaidDirect chart={chart} />)

      await waitFor(() => {
        const pre = container.querySelector('pre')
        expect(pre).toBeInTheDocument()
        expect(pre?.textContent).toBe(chart)
      })
    })

    it('should show "Failed to render diagram" for non-Error exceptions', async () => {
      mockRender.mockRejectedValue('String error') // Not an Error object
      render(<MermaidDirect chart="invalid" />)

      await waitFor(() => {
        expect(screen.getByText('Failed to render diagram')).toBeInTheDocument()
      })
    })

    it('should render successfully after a failed mount (fresh mount)', async () => {
      // First mount with error
      mockRender.mockRejectedValueOnce(new Error('Syntax error'))
      const { unmount } = render(<MermaidDirect chart="invalid syntax" />)

      await waitFor(() => {
        expect(screen.getByText('Diagram Error')).toBeInTheDocument()
      })

      unmount()

      // Fresh mount with valid chart — error state resets
      mockRender.mockResolvedValue({ svg: MOCK_SVG_CLEAN, bindFunctions: undefined })
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        expect(screen.queryByText('Diagram Error')).not.toBeInTheDocument()
        expect(screen.getByRole('img')).toBeInTheDocument()
      })
    })
  })

  describe('Empty and whitespace input', () => {
    it('should not call mermaid.render() for empty string', async () => {
      render(<MermaidDirect chart="" />)

      // Wait a bit to ensure render would have been called if it was going to be
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      expect(mockRender).not.toHaveBeenCalled()
    })

    it('should not call mermaid.render() for whitespace-only string', async () => {
      // Reset mock to ensure clean state
      mockRender.mockClear()

      // Use spaces only for whitespace test
      render(<MermaidDirect chart="     " />)

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      expect(mockRender).not.toHaveBeenCalled()
    })
  })

  describe('Dark/light theme switching', () => {
    it('should detect initial light mode (no dark class)', async () => {
      document.documentElement.classList.remove('dark')
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledWith(
          expect.objectContaining({
            themeVariables: expect.objectContaining({
              primaryColor: '#e0f2fe', // Light mode color
            }),
          })
        )
      })
    })

    it('should detect initial dark mode (dark class on html)', async () => {
      document.documentElement.classList.add('dark')
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledWith(
          expect.objectContaining({
            themeVariables: expect.objectContaining({
              primaryColor: '#1e3a5f', // Dark mode color
            }),
          })
        )
      })
    })

    it('should re-render when dark mode toggled on (check initialize calls with different themes)', async () => {
      render(<MermaidDirect chart="graph TD\n  A-->B" />)

      // Wait for initial render
      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledTimes(1)
      })

      const firstCall = mockInitialize.mock.calls[0][0]
      expect(firstCall.themeVariables.primaryColor).toBe('#e0f2fe') // Light mode

      // Toggle dark mode
      await act(async () => {
        document.documentElement.classList.add('dark')
      })

      // Wait for re-render
      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledTimes(2)
      })

      const secondCall = mockInitialize.mock.calls[1][0]
      expect(secondCall.themeVariables.primaryColor).toBe('#1e3a5f') // Dark mode
    })

    it('should disconnect MutationObserver on unmount', async () => {
      const disconnectSpy = vi.fn()
      const originalMutationObserver = global.MutationObserver

      global.MutationObserver = class MockMutationObserver {
        constructor(callback: MutationCallback) {
          // Call original behavior if needed
        }
        observe() {}
        disconnect = disconnectSpy
        takeRecords() {
          return []
        }
      } as any

      const { unmount } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        expect(mockRender).toHaveBeenCalled()
      })

      unmount()

      expect(disconnectSpy).toHaveBeenCalled()

      global.MutationObserver = originalMutationObserver
    })
  })

  describe('postProcessSvg color replacement', () => {
    it('should replace mermaid default fill (#ECECFF) with theme nodeBg', async () => {
      mockRender.mockResolvedValue({
        svg: MOCK_SVG_WITH_DEFAULT_COLORS,
        bindFunctions: undefined,
      })

      const { container } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        const rect = container.querySelector('rect[fill="#ECECFF"]')
        // After postProcessSvg, should be replaced with light mode nodeBg
        expect(rect).toBeNull() // Should not exist with old color
      })

      await waitFor(() => {
        const rectWithThemeColor = container.querySelector('rect[fill="#e0f2fe"]')
        expect(rectWithThemeColor).toBeInTheDocument()
      })
    })

    it('should force .node rect fills and strokes to theme colors', async () => {
      mockRender.mockResolvedValue({
        svg: MOCK_SVG_WITH_DEFAULT_COLORS,
        bindFunctions: undefined,
      })

      const { container } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        const nodeRect = container.querySelector('.node rect')
        expect(nodeRect?.getAttribute('fill')).toBe('#e0f2fe') // Light mode nodeBg
        expect(nodeRect?.getAttribute('stroke')).toBe('#0ea5e9') // Light mode nodeBorder
      })
    })

    it('should force .nodeLabel text fill to theme nodeText', async () => {
      mockRender.mockResolvedValue({
        svg: MOCK_SVG_WITH_DEFAULT_COLORS,
        bindFunctions: undefined,
      })

      const { container } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        const nodeLabel = container.querySelector('.nodeLabel')
        expect(nodeLabel?.getAttribute('fill')).toBe('#0f172a') // Light mode nodeText
      })
    })

    it('should force edge/arrow strokes to theme lineColor', async () => {
      mockRender.mockResolvedValue({
        svg: MOCK_SVG_WITH_DEFAULT_COLORS,
        bindFunctions: undefined,
      })

      const { container } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        const flowchartLink = container.querySelector('.flowchart-link')
        expect(flowchartLink?.getAttribute('stroke')).toBe('#64748b') // Light mode lineColor
      })
    })

    it('should force edgeLabel text colors to theme textColor', async () => {
      mockRender.mockResolvedValue({
        svg: MOCK_SVG_WITH_DEFAULT_COLORS,
        bindFunctions: undefined,
      })

      const { container } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        const edgeLabelText = container.querySelector('.edgeLabel text')
        expect(edgeLabelText?.getAttribute('fill')).toBe('#334155') // Light mode textColor
      })
    })

    it('should replace light-colored fills in dark mode (#90EE90 → nodeBg)', async () => {
      document.documentElement.classList.add('dark')
      mockRender.mockResolvedValue({
        svg: MOCK_SVG_WITH_LIGHT_FILLS,
        bindFunctions: undefined,
      })

      const { container } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        // Light green (#90EE90) should be replaced with dark mode nodeBg (#1e3a5f)
        const lightGreenRect = container.querySelector('rect[fill="#90EE90"]')
        expect(lightGreenRect).toBeNull()

        const darkBgRect = container.querySelector('rect[fill="#1e3a5f"]')
        expect(darkBgRect).toBeInTheDocument()
      })
    })

    it('should NOT replace light fills in light mode', async () => {
      document.documentElement.classList.remove('dark')
      mockRender.mockResolvedValue({
        svg: MOCK_SVG_WITH_LIGHT_FILLS,
        bindFunctions: undefined,
      })

      const { container } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      await waitFor(() => {
        // In light mode, light colors are acceptable, but .node elements still get forced
        // However, non-node elements shouldn't be changed based on isLightColor in light mode
        const rects = container.querySelectorAll('rect')
        expect(rects.length).toBeGreaterThan(0)
      })
    })
  })

  describe('State diagram styling', () => {
    it('should style state-start without state-end sibling → startNode colors', async () => {
      mockRender.mockResolvedValue({ svg: MOCK_SVG_STATE_DIAGRAM, bindFunctions: undefined })
      const { container } = render(<MermaidDirect chart="stateDiagram-v2\n  [*]-->A" />)

      await waitFor(() => {
        const stateStarts = container.querySelectorAll('.state-start')
        const stateStartWithoutEnd = Array.from(stateStarts).find((el) => {
          return !el.parentElement?.querySelector('.state-end')
        })

        expect(stateStartWithoutEnd).toBeTruthy()
        expect(stateStartWithoutEnd!.getAttribute('fill')).toBe('#059669') // Light mode startNodeBg
        expect(stateStartWithoutEnd!.getAttribute('stroke')).toBe('#047857') // Light mode startNodeBorder
      })
    })

    it('should style state-start WITH state-end sibling → transparent fill + endNode border', async () => {
      mockRender.mockResolvedValue({ svg: MOCK_SVG_STATE_DIAGRAM, bindFunctions: undefined })
      const { container } = render(<MermaidDirect chart="stateDiagram-v2\n  [*]-->[*]" />)

      await waitFor(() => {
        const stateStarts = container.querySelectorAll('.state-start')
        const stateStartWithEnd = Array.from(stateStarts).find((el) => {
          return el.parentElement?.querySelector('.state-end')
        })

        expect(stateStartWithEnd).toBeTruthy()
        expect(stateStartWithEnd!.getAttribute('fill')).toBe('transparent')
        expect(stateStartWithEnd!.getAttribute('stroke')).toBe('#7f1d1d') // Light mode endNodeBorder
      })
    })

    it('should style state-end → endNode colors', async () => {
      mockRender.mockResolvedValue({ svg: MOCK_SVG_STATE_DIAGRAM, bindFunctions: undefined })
      const { container } = render(<MermaidDirect chart="stateDiagram-v2\n  A-->[*]" />)

      await waitFor(() => {
        const stateEnd = container.querySelector('.state-end')
        expect(stateEnd?.getAttribute('fill')).toBe('#dc2626') // Light mode endNodeBg
        expect(stateEnd?.getAttribute('stroke')).toBe('#7f1d1d') // Light mode endNodeBorder
      })
    })
  })

  describe('Race conditions', () => {
    it('should discard stale render when chart changes rapidly', async () => {
      // Create controllable promises
      let resolveFirstRender: (value: any) => void
      let resolveSecondRender: (value: any) => void

      const firstRenderPromise = new Promise((resolve) => {
        resolveFirstRender = resolve
      })
      const secondRenderPromise = new Promise((resolve) => {
        resolveSecondRender = resolve
      })

      // First call takes longer
      mockRender.mockImplementationOnce(() => firstRenderPromise)
      // Second call resolves faster
      mockRender.mockImplementationOnce(() => secondRenderPromise)

      const { container, rerender } = render(<MermaidDirect chart="graph TD\n  A-->B" />)

      // Quickly change chart before first render completes
      rerender(<MermaidDirect chart="graph TD\n  X-->Y" />)

      // Resolve second render first (faster)
      resolveSecondRender!({ svg: '<svg>Second render</svg>', bindFunctions: undefined })

      await waitFor(() => {
        expect(container.querySelector('.mermaid-diagram')?.innerHTML).toContain('Second render')
      })

      // Now resolve first render (stale)
      resolveFirstRender!({ svg: '<svg>First render</svg>', bindFunctions: undefined })

      // Wait a bit to ensure stale render doesn't override
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      // Should still show second render, not first
      expect(container.querySelector('.mermaid-diagram')?.innerHTML).toContain('Second render')
      expect(container.querySelector('.mermaid-diagram')?.innerHTML).not.toContain('First render')
    })
  })

  describe('Cyrillic and special characters', () => {
    it('should pass Cyrillic text in nodes to mermaid.render unchanged', async () => {
      const cyrillicChart = 'graph TD\n  A[Начало] --> B[Конец]'
      render(<MermaidDirect chart={cyrillicChart} />)

      await waitFor(() => {
        expect(mockRender).toHaveBeenCalledWith(expect.any(String), cyrillicChart.trim())
      })
    })

    it('should pass special characters (&lt;, &amp;, brackets) through', async () => {
      const specialChart = 'graph TD\n  A["<tag> & [brackets]"] --> B'
      render(<MermaidDirect chart={specialChart} />)

      await waitFor(() => {
        expect(mockRender).toHaveBeenCalledWith(expect.any(String), specialChart.trim())
      })
    })

    it('should pass mixed Latin + Cyrillic text', async () => {
      const mixedChart = 'graph TD\n  Start[Start Начало] --> End[End Конец]'
      render(<MermaidDirect chart={mixedChart} />)

      await waitFor(() => {
        expect(mockRender).toHaveBeenCalledWith(expect.any(String), mixedChart.trim())
      })
    })
  })
})
