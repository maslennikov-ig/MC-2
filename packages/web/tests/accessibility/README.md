# Accessibility Testing Documentation

This directory contains automated accessibility tests for the MegaCampusAI application using industry-standard tools and methodologies.

## Overview

Our accessibility testing ensures WCAG 2.1 AA compliance and covers:

- **Automated scanning** with axe-core
- **Keyboard navigation** testing
- **Screen reader** compatibility
- **Color contrast** validation
- **Focus management**
- **Mobile accessibility**
- **Component-specific** accessibility

## Setup Requirements

### Install Dependencies

```bash
# Install axe-core for Playwright
pnpm add -D @axe-core/playwright

# Install additional accessibility testing tools
pnpm add -D axe-core
pnpm add -D @testing-library/jest-dom
```

### Verify Installation

```bash
# Run accessibility tests
pnpm test:accessibility

# Or use the shorter alias
pnpm test:a11y
```

## Test Structure

### Core Tests (`axe.test.ts`)

1. **Page-level scanning** - Tests all major pages for WCAG violations
2. **Keyboard navigation** - Ensures all interactive elements are keyboard accessible
3. **Focus management** - Verifies visible focus indicators
4. **Color contrast** - Validates minimum contrast ratios
5. **Screen reader support** - Tests ARIA labels, roles, and semantic HTML
6. **Form accessibility** - Validates form labels and error states
7. **Mobile accessibility** - Tests touch target sizes and mobile usability
8. **Component accessibility** - Tests individual components and modals

### Markdown Components Tests (`markdown-components.test.ts`)

Comprehensive tests for custom markdown rendering components (1100+ lines, 34 test cases):

1. **CodeBlock Component**
   - Copy button ARIA labels (`aria-label`, `aria-live="polite"`)
   - Language badge accessibility
   - Keyboard navigation and focus
   - Code content WCAG compliance

2. **Callout Component**
   - Dynamic role assignment (`role="alert"` for danger/warning, `role="note"` for info/tip/note)
   - Icon accessibility (`aria-hidden="true"`)
   - Color-coded semantic structure

3. **Link Component**
   - External link indicators with screen reader text `(opens in new tab)`
   - Icon with `aria-hidden="true"`
   - Visible focus indicators
   - Security attributes (`rel="noopener noreferrer"`)

4. **Heading Component**
   - Anchor link ARIA labels for copy-to-clipboard
   - Copy feedback with `aria-live="polite"`
   - Keyboard accessibility (Enter key navigation)
   - Heading hierarchy validation

5. **ResponsiveTable Component**
   - Wrapper with `role="region"` and `aria-label="Scrollable table"`
   - Keyboard scrolling with `tabIndex={0}`
   - Proper table structure (thead, tbody, th)
   - Mobile horizontal scroll

6. **SkipToContent Component**
   - Keyboard focus accessibility
   - Visibility on focus (visually hidden until focused)
   - Navigation to target content

**Test Methodology:**
- Injection-based testing (components injected as HTML via `page.evaluate()`)
- axe-core automated WCAG scanning
- Keyboard navigation testing
- Mobile viewport testing (375x667 - iPhone SE)
- Integration tests for multiple components working together

### Test Coverage

| Component/Page | WCAG Level | Status |
|----------------|------------|--------|
| Homepage | AA | ✅ Tested |
| Course Catalog | AA | ✅ Tested |
| Course Creation | AA | ✅ Tested |
| About Page | AA | ✅ Tested |
| Course Cards | AA | ✅ Tested |
| Modals/Dialogs | AA | ✅ Tested |
| Forms | AA | ✅ Tested |
| Navigation | AA | ✅ Tested |
| **Markdown Components** | **AA** | **✅ Tested** |
| - CodeBlock | AA | ✅ Tested |
| - Callout | AA | ✅ Tested |
| - Link | AA | ✅ Tested |
| - Heading | AA | ✅ Tested |
| - ResponsiveTable | AA | ✅ Tested |
| - SkipToContent | AA | ✅ Tested |

## Running Tests

### All Accessibility Tests
```bash
pnpm test:accessibility
```

### Specific Test Categories
```bash
# Basic page accessibility
npx playwright test --grep "should be accessible"

# Keyboard navigation only
npx playwright test --grep "keyboard navigation"

# Focus management
npx playwright test --grep "focus"

# Mobile accessibility
npx playwright test --grep "mobile"

# Component-specific tests
npx playwright test --grep "Component Accessibility"

# Markdown component tests only
npx playwright test tests/accessibility/markdown-components.test.ts --project=chromium

# Specific markdown component
npx playwright test tests/accessibility/markdown-components.test.ts -g "CodeBlock Accessibility"
npx playwright test tests/accessibility/markdown-components.test.ts -g "Callout Accessibility"
npx playwright test tests/accessibility/markdown-components.test.ts -g "Link Accessibility"
npx playwright test tests/accessibility/markdown-components.test.ts -g "Heading Accessibility"
npx playwright test tests/accessibility/markdown-components.test.ts -g "ResponsiveTable Accessibility"
npx playwright test tests/accessibility/markdown-components.test.ts -g "SkipToContent Accessibility"

# Integrated markdown tests
npx playwright test tests/accessibility/markdown-components.test.ts -g "Integrated Markdown"

# Mobile markdown tests
npx playwright test tests/accessibility/markdown-components.test.ts -g "Mobile Accessibility for Markdown"
```

### Interactive Mode
```bash
# Run with UI for debugging
pnpm test:e2e:ui --project=axe-accessibility
```

## Understanding Results

### Violation Reports

When accessibility violations are found, axe-core provides detailed reports:

```javascript
// Example violation output
{
  id: "color-contrast",
  impact: "serious", 
  description: "Elements must have sufficient color contrast",
  nodes: [{
    target: ["#submit-button"],
    html: "<button id='submit-button'>Submit</button>",
    failureSummary: "Fix any of the following:\n  Element has insufficient color contrast of 2.93 (foreground color: #767676, background color: #ffffff, font size: 14.0pt (18.6667px), font weight: normal). Expected contrast ratio of 4.5:1"
  }]
}
```

### Common Issues and Fixes

#### 1. Color Contrast Issues
```css
/* ❌ Insufficient contrast */
.button {
  color: #767676;
  background: #ffffff; /* 2.93:1 ratio */
}

/* ✅ Sufficient contrast */
.button {
  color: #404040;
  background: #ffffff; /* 4.51:1 ratio */
}
```

#### 2. Missing Alt Text
```jsx
{/* ❌ Missing alt text */}
<img src="/course-image.jpg" />

{/* ✅ Proper alt text */}
<img src="/course-image.jpg" alt="Introduction to React course thumbnail" />

{/* ✅ Decorative image */}
<img src="/decoration.jpg" alt="" role="presentation" />
```

#### 3. Missing Form Labels
```jsx
{/* ❌ No label */}
<input type="email" placeholder="Enter email" />

{/* ✅ Proper label */}
<label htmlFor="email">Email Address</label>
<input type="email" id="email" placeholder="Enter email" />

{/* ✅ Alternative with aria-label */}
<input type="email" aria-label="Email Address" placeholder="Enter email" />
```

#### 4. Focus Management Issues
```jsx
{/* ❌ No focus styles */}
.button {
  outline: none;
}

{/* ✅ Visible focus styles */}
.button:focus {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}

{/* ✅ Modern focus styles */}
.button:focus-visible {
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #0066cc;
}
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Accessibility Tests
on: [push, pull_request]

jobs:
  accessibility:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Install Playwright browsers
        run: npx playwright install chromium
      
      - name: Run accessibility tests
        run: pnpm test:accessibility
      
      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: accessibility-test-results
          path: test-results/
```

## Manual Testing Checklist

Use this checklist for manual accessibility testing:

### Keyboard Navigation ⌨️
- [ ] Tab through all interactive elements
- [ ] Verify focus is visible on all elements
- [ ] Test Enter/Space activation for buttons
- [ ] Test Arrow key navigation for menus
- [ ] Verify Escape closes modals/dropdowns
- [ ] Check focus trap in modals

### Screen Reader Testing 🔊
- [ ] Navigate with screen reader (NVDA/JAWS/VoiceOver)
- [ ] Verify headings structure (H1 → H2 → H3...)
- [ ] Test landmark navigation (main, nav, aside)
- [ ] Verify form labels are announced
- [ ] Check error message announcements
- [ ] Test dynamic content announcements

### Visual Testing 👁️
- [ ] Test with 200% zoom
- [ ] Verify text doesn't truncate at zoom levels
- [ ] Test in high contrast mode
- [ ] Verify with Windows High Contrast
- [ ] Check color contrast ratios
- [ ] Test without CSS (semantic HTML)

### Mobile/Touch Testing 📱
- [ ] Verify touch targets are 44x44px minimum
- [ ] Test with zoom up to 200%
- [ ] Verify swipe gestures work
- [ ] Test portrait/landscape orientations
- [ ] Check tap target spacing

## WCAG Guidelines Reference

### Level A (Minimum)
- ✅ Images have alt text
- ✅ Videos have captions
- ✅ Color is not the only visual means of conveying information
- ✅ All functionality available from keyboard

### Level AA (Standard)
- ✅ Color contrast minimum 4.5:1 (3:1 for large text)
- ✅ Text can be resized up to 200% without loss of content
- ✅ Focus is visible
- ✅ Headings and labels describe topic or purpose

### Level AAA (Enhanced) - Optional
- ⚠️ Color contrast minimum 7:1 (4.5:1 for large text)
- ⚠️ Text can be resized up to 200% without scrolling
- ⚠️ Low or no background audio

## Troubleshooting

### Common Test Failures

1. **"accessibilityScanResults.violations is not empty"**
   - Check the violation details in test output
   - Fix the specific WCAG violations reported
   - Re-run tests to verify fixes

2. **"Element not focusable"**
   - Ensure interactive elements have `tabindex="0"` or are naturally focusable
   - Check if element is hidden or has `visibility: hidden`

3. **"Touch target too small"**
   - Ensure buttons/links are at least 44x44 pixels
   - Add padding to increase touch target size

4. **"Page load timeout"**
   - Increase timeout in playwright.config.ts
   - Check if development server is running
   - Verify page loads correctly manually

### Test Environment Issues

```bash
# Clear Playwright cache
npx playwright cache clear

# Reinstall browsers
npx playwright install

# Debug specific test
npx playwright test --debug --grep "Homepage should be accessible"

# Run in headed mode to see browser
npx playwright test --headed --project=axe-accessibility
```

## Contributing

When adding new components or pages:

1. **Add accessibility tests** to this directory
2. **Follow WCAG AA guidelines** during development
3. **Test with keyboard navigation** before submitting PR
4. **Run accessibility tests** locally
5. **Update this documentation** if needed

### Test Template

```javascript
test('New component should be accessible', async ({ page }) => {
  await page.goto('/new-page')
  await page.waitForLoadState('networkidle')

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()

  expect(accessibilityScanResults.violations).toEqual([])
})
```

## Resources

### Tools
- [axe DevTools](https://www.deque.com/axe/devtools/) - Browser extension
- [WAVE](https://wave.webaim.org/) - Web accessibility evaluation tool
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) - Built into Chrome DevTools
- [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/) - Desktop app

### Guidelines
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM WCAG Checklist](https://webaim.org/standards/wcag/checklist)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)

### Screen Readers
- [NVDA](https://www.nvaccess.org/) - Free Windows screen reader
- [JAWS](https://www.freedomscientific.com/products/software/jaws/) - Popular Windows screen reader
- [VoiceOver](https://support.apple.com/guide/voiceover/) - Built into macOS/iOS
- [ORCA](https://wiki.gnome.org/Projects/Orca) - Linux screen reader

## Maintenance

This accessibility test suite should be:
- **Run before each release**
- **Updated when new components are added**
- **Reviewed quarterly** for new WCAG updates
- **Enhanced based on user feedback**

For questions or improvements, please create an issue or submit a PR.