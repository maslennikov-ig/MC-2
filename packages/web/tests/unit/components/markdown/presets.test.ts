import { describe, it, expect } from 'vitest';
import { presets, getPresetConfig } from '@/components/markdown/presets';
import type { PresetName, PresetConfig, FeatureFlags } from '@/components/markdown/types';

describe('presets', () => {
  const presetNames: PresetName[] = ['lesson', 'chat', 'preview', 'minimal'];
  const featureFlags: (keyof FeatureFlags)[] = [
    'math',
    'mermaid',
    'codeHighlight',
    'copyButton',
    'anchorLinks',
    'callouts',
    'responsiveTables',
  ];

  describe('structure validation', () => {
    it.each(presetNames)('%s preset should have all feature flags', (preset) => {
      featureFlags.forEach((flag) => {
        expect(presets[preset]).toHaveProperty(flag);
        expect(typeof presets[preset][flag]).toBe('boolean');
      });
    });

    it.each(presetNames)('%s preset should have className', (preset) => {
      expect(presets[preset]).toHaveProperty('className');
      expect(typeof presets[preset].className).toBe('string');
      expect(presets[preset].className).toBeTruthy();
    });

    it.each(presetNames)('%s preset should contain prose styling', (preset) => {
      expect(presets[preset].className).toContain('prose');
    });

    it.each(presetNames)('%s preset should contain dark mode styling', (preset) => {
      expect(presets[preset].className).toContain('dark:prose-invert');
    });
  });

  describe('lesson preset', () => {
    it('should have all features enabled', () => {
      expect(presets.lesson.math).toBe(true);
      expect(presets.lesson.mermaid).toBe(true);
      expect(presets.lesson.codeHighlight).toBe(true);
      expect(presets.lesson.copyButton).toBe(true);
      expect(presets.lesson.anchorLinks).toBe(true);
      expect(presets.lesson.callouts).toBe(true);
      expect(presets.lesson.responsiveTables).toBe(true);
    });

    it('should use large prose styling', () => {
      expect(presets.lesson.className).toContain('prose-lg');
    });

    it('should have no size constraints', () => {
      expect(presets.lesson.className).toContain('max-w-none');
    });
  });

  describe('chat preset', () => {
    it('should be optimized for streaming (minimal heavy features)', () => {
      expect(presets.chat.math).toBe(false);
      expect(presets.chat.mermaid).toBe(false);
      expect(presets.chat.copyButton).toBe(false);
      expect(presets.chat.anchorLinks).toBe(false);
      expect(presets.chat.callouts).toBe(false);
      expect(presets.chat.responsiveTables).toBe(false);
    });

    it('should enable code highlighting only', () => {
      expect(presets.chat.codeHighlight).toBe(true);
    });

    it('should use small prose styling', () => {
      expect(presets.chat.className).toContain('prose-sm');
    });

    it('should have no size constraints', () => {
      expect(presets.chat.className).toContain('max-w-none');
    });
  });

  describe('preview preset', () => {
    it('should enable most features except heavy ones', () => {
      expect(presets.preview.math).toBe(true);
      expect(presets.preview.codeHighlight).toBe(true);
      expect(presets.preview.copyButton).toBe(true);
      expect(presets.preview.callouts).toBe(true);
      expect(presets.preview.responsiveTables).toBe(true);
    });

    it('should disable heavy features', () => {
      expect(presets.preview.mermaid).toBe(false);
      expect(presets.preview.anchorLinks).toBe(false);
    });

    it('should use default prose size (no size modifier)', () => {
      expect(presets.preview.className).not.toContain('prose-lg');
      expect(presets.preview.className).not.toContain('prose-sm');
      expect(presets.preview.className).toMatch(/^prose\s/);
    });

    it('should have no size constraints', () => {
      expect(presets.preview.className).toContain('max-w-none');
    });
  });

  describe('minimal preset', () => {
    it('should have all features disabled', () => {
      expect(presets.minimal.math).toBe(false);
      expect(presets.minimal.mermaid).toBe(false);
      expect(presets.minimal.codeHighlight).toBe(false);
      expect(presets.minimal.copyButton).toBe(false);
      expect(presets.minimal.anchorLinks).toBe(false);
      expect(presets.minimal.callouts).toBe(false);
      expect(presets.minimal.responsiveTables).toBe(false);
    });

    it('should use small prose styling', () => {
      expect(presets.minimal.className).toContain('prose-sm');
    });

    it('should have no size constraints', () => {
      expect(presets.minimal.className).toContain('max-w-none');
    });

    it('should have bare minimum configuration', () => {
      const enabledFeatures = featureFlags.filter((flag) => presets.minimal[flag]);
      expect(enabledFeatures).toHaveLength(0);
    });
  });

  describe('getPresetConfig', () => {
    it('should return preset config by name', () => {
      const config = getPresetConfig('chat');
      expect(config).toEqual(presets.chat);
    });

    it('should return lesson preset by default', () => {
      const config = getPresetConfig();
      expect(config).toEqual(presets.lesson);
    });

    it('should merge overrides with preset config', () => {
      const config = getPresetConfig('lesson', { math: false });

      expect(config.math).toBe(false);
      expect(config.mermaid).toBe(true); // Original preserved
      expect(config.codeHighlight).toBe(true); // Original preserved
    });

    it('should merge multiple overrides correctly', () => {
      const config = getPresetConfig('chat', {
        math: true,
        mermaid: true,
        copyButton: true,
      });

      expect(config.math).toBe(true);
      expect(config.mermaid).toBe(true);
      expect(config.copyButton).toBe(true);
      expect(config.codeHighlight).toBe(true); // Original preserved
    });

    it('should override className if provided', () => {
      const customClass = 'custom-prose';
      const config = getPresetConfig('lesson', { className: customClass });

      expect(config.className).toBe(customClass);
    });

    it('should handle empty overrides', () => {
      const config = getPresetConfig('preview', {});
      expect(config).toEqual(presets.preview);
    });

    it('should not mutate original preset object', () => {
      const originalLesson = { ...presets.lesson };

      getPresetConfig('lesson', { math: false });

      expect(presets.lesson).toEqual(originalLesson);
      expect(presets.lesson.math).toBe(true);
    });

    it.each(presetNames)('should work with all preset names: %s', (preset) => {
      const config = getPresetConfig(preset);
      expect(config).toEqual(presets[preset]);
    });

    it('should return correct type signature', () => {
      const config = getPresetConfig('lesson');

      // Type check: ensure all FeatureFlags properties exist
      expect(config).toHaveProperty('math');
      expect(config).toHaveProperty('mermaid');
      expect(config).toHaveProperty('codeHighlight');
      expect(config).toHaveProperty('copyButton');
      expect(config).toHaveProperty('anchorLinks');
      expect(config).toHaveProperty('callouts');
      expect(config).toHaveProperty('responsiveTables');
      expect(config).toHaveProperty('className');
    });

    it('should handle partial overrides without affecting other properties', () => {
      const config = getPresetConfig('preview', { math: false });

      expect(config.math).toBe(false);
      expect(config.mermaid).toBe(false); // Original
      expect(config.codeHighlight).toBe(true); // Original
      expect(config.copyButton).toBe(true); // Original
      expect(config.anchorLinks).toBe(false); // Original
      expect(config.callouts).toBe(true); // Original
      expect(config.responsiveTables).toBe(true); // Original
      expect(config.className).toBe(presets.preview.className); // Original
    });
  });

  describe('preset feature compatibility', () => {
    it('lesson preset should support all rendering contexts', () => {
      // Lesson is the full-featured preset
      const config = presets.lesson;

      expect(config.math).toBe(true); // LaTeX formulas
      expect(config.mermaid).toBe(true); // Diagrams
      expect(config.codeHighlight).toBe(true); // Syntax highlighting
      expect(config.copyButton).toBe(true); // Code copy
      expect(config.anchorLinks).toBe(true); // Deep linking
      expect(config.callouts).toBe(true); // Admonitions
      expect(config.responsiveTables).toBe(true); // Mobile tables
    });

    it('chat preset should be streaming-safe', () => {
      // Chat preset avoids heavy/stateful features
      const config = presets.chat;

      expect(config.math).toBe(false); // Avoid KaTeX re-renders
      expect(config.mermaid).toBe(false); // Avoid heavy diagram rendering
      expect(config.copyButton).toBe(false); // Avoid DOM mutations during streaming
      expect(config.anchorLinks).toBe(false); // Avoid ID conflicts during streaming
      expect(config.callouts).toBe(false); // Avoid complex parsing
      expect(config.responsiveTables).toBe(false); // Avoid wrapper overhead
      expect(config.codeHighlight).toBe(true); // Keep syntax highlighting (lightweight)
    });

    it('preview preset should balance features and performance', () => {
      // Preview shows most content but skips heavy features
      const config = presets.preview;

      expect(config.math).toBe(true); // Show formulas
      expect(config.mermaid).toBe(false); // Skip heavy diagrams
      expect(config.codeHighlight).toBe(true); // Show syntax highlighting
      expect(config.copyButton).toBe(true); // Allow code copying
      expect(config.anchorLinks).toBe(false); // No deep linking needed
      expect(config.callouts).toBe(true); // Show admonitions
      expect(config.responsiveTables).toBe(true); // Support mobile
    });

    it('minimal preset should have zero overhead', () => {
      // Minimal is raw prose only
      const config = presets.minimal;

      const allFeaturesDisabled = featureFlags.every((flag) => config[flag] === false);
      expect(allFeaturesDisabled).toBe(true);
    });
  });

  describe('className patterns', () => {
    it('all presets should include Tailwind prose plugin classes', () => {
      presetNames.forEach((preset) => {
        expect(presets[preset].className).toMatch(/prose/);
        expect(presets[preset].className).toMatch(/dark:prose-invert/);
        expect(presets[preset].className).toMatch(/max-w-none/);
      });
    });

    it('should use appropriate prose sizes', () => {
      expect(presets.lesson.className).toContain('prose-lg'); // Large for student reading
      expect(presets.chat.className).toContain('prose-sm'); // Small for chat UI
      expect(presets.minimal.className).toContain('prose-sm'); // Small for minimal
      expect(presets.preview.className).not.toContain('prose-lg'); // Default size
      expect(presets.preview.className).not.toContain('prose-sm'); // Default size
    });
  });
});
