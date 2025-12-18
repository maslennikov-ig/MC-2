import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import rehypeSlug from 'rehype-slug';
import rehypeKatex from 'rehype-katex';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

import type { FeatureFlags } from './types';
import { rehypePrettyCodeOptions } from './shiki-config';

/**
 * Get remark plugins based on feature flags
 *
 * Remark plugins process the markdown AST before it's converted to HTML.
 * Always includes GFM (GitHub Flavored Markdown) support.
 *
 * @param features - Feature flags to determine which plugins to enable
 * @returns Array of remark plugins
 */
export function getRemarkPlugins(features: FeatureFlags) {
  const plugins: unknown[] = [remarkGfm];

  if (features.math) {
    plugins.push(remarkMath);
  }

  plugins.push(remarkEmoji);

  return plugins;
}

/**
 * Get rehype plugins for TRUSTED content
 *
 * Rehype plugins process the HTML AST after markdown conversion.
 * This configuration is for trusted content where XSS is not a concern.
 * Includes syntax highlighting with rehype-pretty-code.
 *
 * @param features - Feature flags to determine which plugins to enable
 * @returns Array of rehype plugins
 */
export function getRehypePluginsTrusted(features: FeatureFlags) {
  const plugins: unknown[] = [];

  // rehype-slug adds IDs to headings for anchor links
  // The Heading component handles the anchor UI (hover icon, copy link)
  if (features.anchorLinks) {
    plugins.push(rehypeSlug);
  }

  if (features.math) {
    plugins.push([rehypeKatex, { output: 'htmlAndMathml' }]);
  }

  if (features.codeHighlight) {
    plugins.push([rehypePrettyCode, rehypePrettyCodeOptions]);
  }

  return plugins;
}

/**
 * Get rehype plugins for UNTRUSTED content (UGC)
 *
 * IMPORTANT: rehype-sanitize MUST be FIRST to prevent XSS attacks.
 * This configuration is for user-generated content where security is critical.
 * Does NOT include rehype-pretty-code for performance and security reasons.
 *
 * @param features - Feature flags to determine which plugins to enable
 * @returns Array of rehype plugins with sanitization first
 */
export function getRehypePluginsUntrusted(features: FeatureFlags) {
  // Extended schema for KaTeX MathML elements
  const sanitizeSchema = {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames || []),
      'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac',
    ],
    attributes: {
      ...defaultSchema.attributes,
      code: ['className'],
      span: ['className', 'style'],
    },
  };

  const plugins: unknown[] = [
    [rehypeSanitize, sanitizeSchema], // MUST BE FIRST
  ];

  if (features.anchorLinks) {
    plugins.push(rehypeSlug);
  }

  if (features.math) {
    plugins.push([rehypeKatex, { output: 'htmlAndMathml' }]);
  }

  // NO rehype-pretty-code for UGC (performance + security)

  return plugins;
}
