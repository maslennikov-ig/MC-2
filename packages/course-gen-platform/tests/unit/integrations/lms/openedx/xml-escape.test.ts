/**
 * Unit Tests for XML Character Escaping Utilities
 * Tests T033: xmlEscape, xmlUnescape, escapeForAttribute, hasUnescapedXmlChars
 */

import { describe, it, expect } from 'vitest';
import {
  xmlEscape,
  xmlUnescape,
  escapeForAttribute,
  hasUnescapedXmlChars,
} from '@/integrations/lms/openedx/utils/xml-escape';

describe('xmlEscape - Escape XML special characters', () => {
  describe('Basic Character Escaping', () => {
    it('should escape ampersand (&)', () => {
      const input = 'Tom & Jerry';
      const result = xmlEscape(input);

      expect(result).toBe('Tom &amp; Jerry');
    });

    it('should escape less-than (<)', () => {
      const input = '5 < 10';
      const result = xmlEscape(input);

      expect(result).toBe('5 &lt; 10');
    });

    it('should escape greater-than (>)', () => {
      const input = '10 > 5';
      const result = xmlEscape(input);

      expect(result).toBe('10 &gt; 5');
    });

    it('should escape double quote (")', () => {
      const input = 'He said "Hello"';
      const result = xmlEscape(input);

      expect(result).toBe('He said &quot;Hello&quot;');
    });

    it('should escape single quote (\')', () => {
      const input = "It's working";
      const result = xmlEscape(input);

      expect(result).toBe('It&apos;s working');
    });
  });

  describe('Multiple Characters in Same String', () => {
    it('should escape multiple different special characters', () => {
      const input = '<tag attr="value">Content & more</tag>';
      const result = xmlEscape(input);

      expect(result).toBe('&lt;tag attr=&quot;value&quot;&gt;Content &amp; more&lt;/tag&gt;');
    });

    it('should escape script tag for XSS prevention', () => {
      const input = '<script>alert("xss")</script>';
      const result = xmlEscape(input);

      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should escape multiple ampersands', () => {
      const input = 'A & B & C';
      const result = xmlEscape(input);

      expect(result).toBe('A &amp; B &amp; C');
    });

    it('should handle mixed quotes', () => {
      const input = 'He said "It\'s fine"';
      const result = xmlEscape(input);

      expect(result).toBe('He said &quot;It&apos;s fine&quot;');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = xmlEscape('');

      expect(result).toBe('');
    });

    it('should handle string with no special characters', () => {
      const input = 'Hello World';
      const result = xmlEscape(input);

      expect(result).toBe('Hello World');
    });

    it('should handle whitespace-only string', () => {
      const input = '   ';
      const result = xmlEscape(input);

      expect(result).toBe('   ');
    });

    it('should handle string with only special characters', () => {
      const input = '&<>"\'';
      const result = xmlEscape(input);

      expect(result).toBe('&amp;&lt;&gt;&quot;&apos;');
    });

    it('should preserve Unicode characters', () => {
      const input = 'Привет & мир';
      const result = xmlEscape(input);

      expect(result).toBe('Привет &amp; мир');
    });
  });

  describe('Real-world OLX Scenarios', () => {
    it('should escape course display names with ampersands', () => {
      const input = 'Data Structures & Algorithms';
      const result = xmlEscape(input);

      expect(result).toBe('Data Structures &amp; Algorithms');
    });

    it('should escape HTML content for OLX', () => {
      const input = '<p>Introduction to <b>Python</b></p>';
      const result = xmlEscape(input);

      expect(result).toBe('&lt;p&gt;Introduction to &lt;b&gt;Python&lt;/b&gt;&lt;/p&gt;');
    });

    it('should escape comparison operators in lesson content', () => {
      const input = 'if (x > 10 && y < 5)';
      const result = xmlEscape(input);

      expect(result).toBe('if (x &gt; 10 &amp;&amp; y &lt; 5)');
    });
  });
});

describe('xmlUnescape - Reverse XML entity escaping', () => {
  describe('Basic Entity Unescaping', () => {
    it('should unescape &amp; to &', () => {
      const input = 'Tom &amp; Jerry';
      const result = xmlUnescape(input);

      expect(result).toBe('Tom & Jerry');
    });

    it('should unescape &lt; to <', () => {
      const input = '5 &lt; 10';
      const result = xmlUnescape(input);

      expect(result).toBe('5 < 10');
    });

    it('should unescape &gt; to >', () => {
      const input = '10 &gt; 5';
      const result = xmlUnescape(input);

      expect(result).toBe('10 > 5');
    });

    it('should unescape &quot; to "', () => {
      const input = 'He said &quot;Hello&quot;';
      const result = xmlUnescape(input);

      expect(result).toBe('He said "Hello"');
    });

    it('should unescape &apos; to \'', () => {
      const input = 'It&apos;s working';
      const result = xmlUnescape(input);

      expect(result).toBe("It's working");
    });
  });

  describe('Round-trip Testing', () => {
    it('should reverse xmlEscape perfectly', () => {
      const original = 'Tom & Jerry <says> "Hello"';
      const escaped = xmlEscape(original);
      const unescaped = xmlUnescape(escaped);

      expect(unescaped).toBe(original);
    });

    it('should handle multiple escape/unescape cycles', () => {
      const original = '<tag attr="value">A & B</tag>';

      const escaped1 = xmlEscape(original);
      const unescaped1 = xmlUnescape(escaped1);
      expect(unescaped1).toBe(original);

      const escaped2 = xmlEscape(unescaped1);
      const unescaped2 = xmlUnescape(escaped2);
      expect(unescaped2).toBe(original);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = xmlUnescape('');

      expect(result).toBe('');
    });

    it('should handle string with no entities', () => {
      const input = 'Hello World';
      const result = xmlUnescape(input);

      expect(result).toBe('Hello World');
    });

    it('should not unescape invalid entities', () => {
      const input = '&invalid; &unknown;';
      const result = xmlUnescape(input);

      // Invalid entities should remain unchanged
      expect(result).toBe('&invalid; &unknown;');
    });

    it('should handle partial entities', () => {
      const input = '&amp without semicolon';
      const result = xmlUnescape(input);

      // Partial entities without semicolon should remain unchanged
      expect(result).toBe('&amp without semicolon');
    });
  });

  describe('Multiple Entities', () => {
    it('should unescape multiple different entities', () => {
      const input = '&lt;tag attr=&quot;value&quot;&gt;Content &amp; more&lt;/tag&gt;';
      const result = xmlUnescape(input);

      expect(result).toBe('<tag attr="value">Content & more</tag>');
    });

    it('should unescape consecutive entities', () => {
      const input = '&lt;&gt;&amp;&quot;&apos;';
      const result = xmlUnescape(input);

      expect(result).toBe('<>&"\'');
    });
  });
});

describe('escapeForAttribute - Escape for XML attribute values', () => {
  describe('Basic Attribute Escaping', () => {
    it('should escape double quotes in attribute values', () => {
      const input = 'Display "Name"';
      const result = escapeForAttribute(input);

      expect(result).toBe('Display &quot;Name&quot;');
    });

    it('should escape ampersands in attribute values', () => {
      const input = 'Data & Analytics';
      const result = escapeForAttribute(input);

      expect(result).toBe('Data &amp; Analytics');
    });

    it('should escape less-than and greater-than in attribute values', () => {
      const input = 'Range: 5 < x < 10';
      const result = escapeForAttribute(input);

      expect(result).toBe('Range: 5 &lt; x &lt; 10');
    });
  });

  describe('Real-world Attribute Usage', () => {
    it('should allow safe use in display_name attribute', () => {
      const name = 'Machine Learning & AI';
      const escaped = escapeForAttribute(name);
      const xml = `<chapter display_name="${escaped}">`;

      expect(xml).toBe('<chapter display_name="Machine Learning &amp; AI">');
    });

    it('should handle complex attribute values', () => {
      const name = 'Lesson 5: "Comparison Operators" (< and >)';
      const escaped = escapeForAttribute(name);

      expect(escaped).toBe('Lesson 5: &quot;Comparison Operators&quot; (&lt; and &gt;)');
    });

    it('should preserve safe attribute content', () => {
      const name = 'Introduction to Python';
      const escaped = escapeForAttribute(name);

      expect(escaped).toBe('Introduction to Python');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty attribute value', () => {
      const result = escapeForAttribute('');

      expect(result).toBe('');
    });

    it('should handle Unicode in attribute values', () => {
      const input = 'Введение в Python';
      const result = escapeForAttribute(input);

      // Unicode should be preserved
      expect(result).toBe('Введение в Python');
    });
  });
});

describe('hasUnescapedXmlChars - Detect unescaped XML characters', () => {
  describe('Detection of Unescaped Characters', () => {
    it('should detect unescaped ampersand', () => {
      const input = 'Tom & Jerry';
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(true);
    });

    it('should detect unescaped less-than', () => {
      const input = '5 < 10';
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(true);
    });

    it('should detect unescaped greater-than', () => {
      const input = '10 > 5';
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(true);
    });

    it('should detect unescaped double quote', () => {
      const input = 'He said "Hello"';
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(true);
    });

    it('should detect unescaped single quote', () => {
      const input = "It's working";
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(true);
    });
  });

  describe('Detection of Escaped Characters', () => {
    it('should return false for escaped ampersand', () => {
      const input = 'Tom &amp; Jerry';
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(false);
    });

    it('should return false for fully escaped string', () => {
      const input = '&lt;tag attr=&quot;value&quot;&gt;Content &amp; more&lt;/tag&gt;';
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(false);
    });

    it('should return false for string with no special characters', () => {
      const input = 'Hello World';
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(false);
    });
  });

  describe('Mixed Escaped and Unescaped', () => {
    it('should detect unescaped characters even if some are escaped', () => {
      const input = 'Tom &amp; Jerry < 5';
      const result = hasUnescapedXmlChars(input);

      // Should return true because < is unescaped
      expect(result).toBe(true);
    });

    it('should detect multiple unescaped characters', () => {
      const input = '<tag> & "value"';
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should return false for empty string', () => {
      const result = hasUnescapedXmlChars('');

      expect(result).toBe(false);
    });

    it('should return false for whitespace-only string', () => {
      const result = hasUnescapedXmlChars('   ');

      expect(result).toBe(false);
    });

    it('should handle Unicode characters safely', () => {
      const input = 'Привет мир';
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(false);
    });

    it('should detect unescaped characters in Unicode context', () => {
      const input = 'Привет & мир';
      const result = hasUnescapedXmlChars(input);

      expect(result).toBe(true);
    });
  });

  describe('Validation Use Cases', () => {
    it('should validate that xmlEscape output has no unescaped chars', () => {
      const original = 'Tom & Jerry <says> "Hello"';
      const escaped = xmlEscape(original);
      const hasUnescaped = hasUnescapedXmlChars(escaped);

      expect(hasUnescaped).toBe(false);
    });

    it('should detect when escaping is required', () => {
      const inputs = [
        'Data & Analytics',
        'x < 10',
        'y > 5',
        'He said "Hello"',
        "It's working",
      ];

      inputs.forEach((input) => {
        expect(hasUnescapedXmlChars(input)).toBe(true);
      });
    });

    it('should confirm already-escaped strings are safe', () => {
      const inputs = [
        'Data &amp; Analytics',
        'x &lt; 10',
        'y &gt; 5',
        'He said &quot;Hello&quot;',
        'It&apos;s working',
      ];

      inputs.forEach((input) => {
        expect(hasUnescapedXmlChars(input)).toBe(false);
      });
    });
  });
});
