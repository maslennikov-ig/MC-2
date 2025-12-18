# Visual Regression Testing

This directory contains visual regression tests for the MegaCampusAI application using Playwright.

## Overview

Visual regression testing helps ensure that UI changes don't unintentionally break the visual appearance of the application. These tests capture screenshots of various components and pages, then compare them against baseline images to detect visual differences.

## Test Structure

### Core Visual Tests
- **Homepage snapshots**: Full page and component-level screenshots
- **Page-specific tests**: Individual pages like `/courses`, `/create`
- **Responsive design**: Mobile, tablet, and desktop viewports
- **Theme variations**: Light and dark mode comparisons
- **Component states**: Loading, error, and empty states

### Component Visual Tests
- **Logo variations**: Different logo sizes and contexts
- **Button states**: Default, hover, focus, and disabled states
- **Form elements**: Input fields, textareas, and form validation states
- **Interactive elements**: Modals, dropdowns, tooltips

### Animation and Transition Tests
- **Page transitions**: Navigation between routes
- **Component animations**: Hover effects, loading spinners
- **State changes**: Form validation, error messages

## Running Visual Tests

### First Time Setup
```bash
# Install Playwright browsers
npx playwright install

# Generate baseline screenshots
npx playwright test tests/visual/ --update-snapshots
```

### Running Tests
```bash
# Run all visual tests
npx playwright test tests/visual/

# Run specific visual test
npx playwright test tests/visual/visual-regression.spec.ts

# Run with specific browser
npx playwright test tests/visual/ --project=chromium

# Run visual tests in UI mode
npx playwright test tests/visual/ --ui
```

### Updating Screenshots
```bash
# Update all screenshots
npx playwright test tests/visual/ --update-snapshots

# Update specific test screenshots
npx playwright test tests/visual/visual-regression.spec.ts --update-snapshots

# Update screenshots for specific browser
npx playwright test tests/visual/ --project=chromium --update-snapshots
```

## Screenshot Configuration

### Default Settings
- **Viewport**: 1280x720 for desktop tests
- **Animations**: Disabled for consistency
- **Threshold**: 0.2 (20% difference tolerance)
- **Full page**: Enabled for page-level tests
- **Clip region**: Used for specific component testing

### Mobile/Tablet Settings
- **Mobile**: 375x667 (iPhone SE)
- **Tablet**: 768x1024 (iPad)
- **Touch device**: Enabled for mobile tests

## Directory Structure

```
tests/visual/
├── visual-regression.spec.ts    # Main visual regression tests
├── README.md                    # This file
└── screenshots/                 # Generated baseline screenshots
    ├── chromium/
    ├── firefox/
    ├── webkit/
    └── mobile-chrome/
```

## Best Practices

### Writing Visual Tests
1. **Wait for stability**: Always wait for animations and loading to complete
2. **Disable animations**: Use `animations: 'disabled'` for consistent screenshots
3. **Use specific selectors**: Target specific components rather than entire pages when possible
4. **Test multiple states**: Include normal, hover, focus, and error states
5. **Consider responsive design**: Test on different viewport sizes

### Screenshot Management
1. **Review changes carefully**: Always review visual diffs before updating baselines
2. **Use meaningful names**: Name screenshots descriptively (e.g., `homepage-hero.png`)
3. **Organize by component**: Group related screenshots logically
4. **Version control**: Commit baseline screenshots to track visual changes over time

### CI/CD Integration
```yaml
# Example GitHub Actions workflow
- name: Run visual regression tests
  run: npx playwright test tests/visual/
  
- name: Upload visual diff artifacts
  uses: actions/upload-artifact@v3
  if: failure()
  with:
    name: visual-diff-report
    path: |
      test-results/
      playwright-report/
```

## Troubleshooting

### Common Issues

#### Flaky Screenshots
- **Font rendering differences**: Ensure consistent font loading
- **Animation timing**: Wait longer for animations to complete
- **Dynamic content**: Mock or stabilize time-sensitive content

#### Large Diff Files
- **High resolution**: Consider reducing viewport size for faster tests
- **Complex animations**: Disable animations for consistency
- **Third-party content**: Mock external resources that might change

#### Browser Differences
- **Font rendering**: Fonts may render differently across browsers
- **Color profiles**: Some browsers have different color handling
- **WebGL/Canvas**: Hardware-accelerated content may vary

### Debugging Tips
1. **Use --debug flag**: Run tests in debug mode to see what's happening
2. **Check network tab**: Ensure all resources are loaded before screenshots
3. **Use trace viewer**: Playwright's trace viewer shows detailed execution
4. **Compare manually**: Use image diff tools to understand changes

## Integration with Development Workflow

### Pre-commit Hooks
```bash
# Add to .husky/pre-commit or similar
npx playwright test tests/visual/ --reporter=line
```

### Pull Request Checks
Visual regression tests should be included in CI/CD pipelines to:
- Catch unintended visual changes
- Require explicit approval for visual updates
- Maintain visual consistency across releases

### Design System Validation
Use visual tests to ensure:
- Component library consistency
- Brand guideline compliance
- Accessibility visual requirements
- Cross-browser compatibility

## Maintenance

### Regular Updates
- **Browser updates**: Update Playwright browsers regularly
- **Baseline refresh**: Periodically review and update baseline screenshots
- **Test coverage**: Add visual tests for new components and pages
- **Performance optimization**: Remove unused or redundant visual tests

### Monitoring
- **Test execution time**: Monitor test duration and optimize as needed
- **Storage usage**: Manage screenshot file sizes and cleanup old versions
- **False positives**: Refine thresholds and selectors to reduce noise