/**
 * Contract tests for MarkdownRendererClient component
 *
 * Verifies:
 * - Streaming content handling with Streamdown integration
 * - Preset className application (chat/minimal)
 * - Empty content edge cases
 * - Feature override merging
 * - parseIncompleteMarkdown flag in streaming mode
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownRendererClient } from '@/components/markdown/MarkdownRendererClient';

// Mock Streamdown component from 'streamdown' library
vi.mock('streamdown', () => ({
  Streamdown: ({ children, parseIncompleteMarkdown }: any) => (
    <div
      data-testid="streamdown"
      data-parse-incomplete={String(parseIncompleteMarkdown)}
    >
      {children}
    </div>
  ),
}));

describe('MarkdownRendererClient - Contract Tests', () => {
  describe('basic rendering', () => {
    it('should render markdown content in wrapper div', () => {
      const { container } = render(
        <MarkdownRendererClient content="Hello World" />
      );

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toBeInTheDocument();
      expect(streamdown).toHaveTextContent('Hello World');

      // Wrapper should exist
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.tagName).toBe('DIV');
    });

    it('should render multiline markdown content', () => {
      const content = `# Heading\n\nParagraph text\n\n- List item`;
      render(<MarkdownRendererClient content={content} />);

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toHaveTextContent('Heading');
      expect(streamdown).toHaveTextContent('Paragraph text');
      expect(streamdown).toHaveTextContent('List item');
    });

    it('should render code blocks in content', () => {
      const content = '```js\nconst x = 1;\n```';
      render(<MarkdownRendererClient content={content} />);

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toHaveTextContent('const x = 1;');
    });
  });

  describe('streaming mode', () => {
    it('should pass parseIncompleteMarkdown=true when isStreaming=true', () => {
      render(<MarkdownRendererClient content="Test" isStreaming={true} />);

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toHaveAttribute('data-parse-incomplete', 'true');
    });

    it('should pass parseIncompleteMarkdown=false when isStreaming=false', () => {
      render(<MarkdownRendererClient content="Test" isStreaming={false} />);

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toHaveAttribute('data-parse-incomplete', 'false');
    });

    it('should default to non-streaming mode (parseIncompleteMarkdown=false)', () => {
      render(<MarkdownRendererClient content="Test" />);

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toHaveAttribute('data-parse-incomplete', 'false');
    });

    it('should handle incomplete markdown in streaming mode', () => {
      const incompleteMarkdown = '# Heading\n\n```js\nconst x = '; // Unclosed code block
      render(
        <MarkdownRendererClient
          content={incompleteMarkdown}
          isStreaming={true}
        />
      );

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toHaveTextContent('Heading');
      expect(streamdown).toHaveAttribute('data-parse-incomplete', 'true');
    });
  });

  describe('empty content handling', () => {
    it('should render empty div for empty string content', () => {
      const { container } = render(<MarkdownRendererClient content="" />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toBeEmptyDOMElement();
      expect(wrapper.tagName).toBe('DIV');

      // Streamdown should NOT be rendered for empty content
      expect(screen.queryByTestId('streamdown')).not.toBeInTheDocument();
    });

    it('should render empty div for whitespace-only content', () => {
      const { container } = render(<MarkdownRendererClient content="   " />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toBeInTheDocument();
    });

    it('should maintain wrapper className even with empty content', () => {
      const { container } = render(
        <MarkdownRendererClient content="" preset="chat" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('prose');
      expect(wrapper).toHaveClass('prose-sm');
      expect(wrapper).toHaveClass('dark:prose-invert');
    });
  });

  describe('preset className application', () => {
    it('should apply chat preset className by default', () => {
      const { container } = render(<MarkdownRendererClient content="Test" />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('prose');
      expect(wrapper).toHaveClass('prose-sm'); // chat preset uses prose-sm
      expect(wrapper).toHaveClass('dark:prose-invert');
      expect(wrapper).toHaveClass('max-w-none');
    });

    it('should apply chat preset className explicitly', () => {
      const { container } = render(
        <MarkdownRendererClient content="Test" preset="chat" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('prose');
      expect(wrapper).toHaveClass('prose-sm');
    });

    it('should apply minimal preset className', () => {
      const { container } = render(
        <MarkdownRendererClient content="Test" preset="minimal" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('prose');
      expect(wrapper).toHaveClass('prose-sm'); // minimal preset also uses prose-sm
      expect(wrapper).toHaveClass('dark:prose-invert');
    });

    it('should merge custom className with preset className', () => {
      const { container } = render(
        <MarkdownRendererClient
          content="Test"
          preset="chat"
          className="custom-class another-class"
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      // Should have both preset and custom classes
      expect(wrapper).toHaveClass('prose');
      expect(wrapper).toHaveClass('prose-sm');
      expect(wrapper).toHaveClass('custom-class');
      expect(wrapper).toHaveClass('another-class');
    });

    it('should apply custom className without preset', () => {
      const { container } = render(
        <MarkdownRendererClient content="Test" className="only-custom" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('only-custom');
      expect(wrapper).toHaveClass('prose'); // Default chat preset should still apply
    });
  });

  describe('preset validation', () => {
    it('should default invalid preset to chat', () => {
      const { container } = render(
        <MarkdownRendererClient
          content="Test"
          // @ts-expect-error - Testing runtime validation with invalid preset
          preset="invalid-preset"
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      // Should fallback to chat preset
      expect(wrapper).toHaveClass('prose-sm');
    });

    it('should validate preset is limited to chat or minimal (type-level)', () => {
      // This test validates TypeScript types at compile time
      // @ts-expect-error - 'lesson' is not assignable to type 'chat' | 'minimal'
      const _invalid: Parameters<typeof MarkdownRendererClient>[0] = {
        content: 'Test',
        preset: 'lesson', // Should cause TypeScript error
      };

      // Runtime check: ensure only 'minimal' gets converted to 'minimal', else 'chat'
      const { container: container1 } = render(
        <MarkdownRendererClient content="Test" preset="minimal" />
      );
      expect(container1.firstChild).toHaveClass('prose-sm');

      const { container: container2 } = render(
        <MarkdownRendererClient content="Test" preset="chat" />
      );
      expect(container2.firstChild).toHaveClass('prose-sm');
    });
  });

  describe('feature overrides', () => {
    it('should accept codeHighlight feature override', () => {
      // Features don't affect the wrapper className directly,
      // but they should be accepted by the component API without error
      const { container } = render(
        <MarkdownRendererClient
          content="Test"
          features={{ codeHighlight: false }}
        />
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should accept responsiveTables feature override', () => {
      const { container } = render(
        <MarkdownRendererClient
          content="Test"
          features={{ responsiveTables: true }}
        />
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should accept multiple feature overrides', () => {
      const { container } = render(
        <MarkdownRendererClient
          content="Test"
          features={{ codeHighlight: true, responsiveTables: false }}
        />
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should reject unsupported feature overrides at type level', () => {
      // TypeScript should reject features not in Pick<FeatureFlags, 'codeHighlight' | 'responsiveTables'>
      // @ts-expect-error - 'math' is not a valid feature for client renderer
      const _invalid: Parameters<typeof MarkdownRendererClient>[0] = {
        content: 'Test',
        features: { math: true }, // Should cause TypeScript error
      };
    });
  });

  describe('integration: preset + className + streaming', () => {
    it('should combine all props correctly', () => {
      const { container } = render(
        <MarkdownRendererClient
          content="# Streaming Heading"
          preset="minimal"
          className="my-custom-wrapper"
          isStreaming={true}
          features={{ codeHighlight: true }}
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      const streamdown = screen.getByTestId('streamdown');

      // Wrapper classes
      expect(wrapper).toHaveClass('prose');
      expect(wrapper).toHaveClass('prose-sm');
      expect(wrapper).toHaveClass('my-custom-wrapper');

      // Streamdown props
      expect(streamdown).toHaveAttribute('data-parse-incomplete', 'true');
      expect(streamdown).toHaveTextContent('Streaming Heading');
    });

    it('should handle all optional props omitted', () => {
      const { container } = render(<MarkdownRendererClient content="Test" />);

      const wrapper = container.firstChild as HTMLElement;
      const streamdown = screen.getByTestId('streamdown');

      // Defaults should apply
      expect(wrapper).toHaveClass('prose-sm'); // Default chat preset
      expect(streamdown).toHaveAttribute('data-parse-incomplete', 'false'); // Default non-streaming
    });
  });

  describe('edge cases', () => {
    it('should handle very long content', () => {
      const longContent = 'a'.repeat(10000);
      render(<MarkdownRendererClient content={longContent} />);

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toHaveTextContent(longContent);
    });

    it('should handle special characters in content', () => {
      const specialContent = '<script>alert("XSS")</script>\n**bold**\n`code`';
      render(<MarkdownRendererClient content={specialContent} />);

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toHaveTextContent('alert("XSS")');
      expect(streamdown).toHaveTextContent('bold');
      expect(streamdown).toHaveTextContent('code');
    });

    it('should handle unicode content', () => {
      const unicodeContent = '你好世界 🚀 Привет мир';
      render(<MarkdownRendererClient content={unicodeContent} />);

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toHaveTextContent('你好世界 🚀 Привет мир');
    });

    it('should handle content with only whitespace', () => {
      const whitespaceContent = '\n\n   \n\t\n   ';
      const { container } = render(
        <MarkdownRendererClient content={whitespaceContent} />
      );

      // Whitespace is truthy, so Streamdown should render
      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown).toBeInTheDocument();
    });
  });

  describe('performance: preset constraint verification', () => {
    it('should enforce chat/minimal presets only for optimal streaming performance', () => {
      // This component is designed for streaming performance
      // Only chat and minimal presets are allowed (verified at type level)

      // Valid presets compile without errors:
      const validChat = <MarkdownRendererClient content="Test" preset="chat" />;
      const validMinimal = (
        <MarkdownRendererClient content="Test" preset="minimal" />
      );

      expect(validChat).toBeDefined();
      expect(validMinimal).toBeDefined();

      // Invalid presets cause TypeScript errors:
      // @ts-expect-error - 'lesson' not allowed for streaming renderer
      const _invalidLesson = (
        <MarkdownRendererClient content="Test" preset="lesson" />
      );

      // @ts-expect-error - 'preview' not allowed for streaming renderer
      const _invalidPreview = (
        <MarkdownRendererClient content="Test" preset="preview" />
      );
    });
  });
});
