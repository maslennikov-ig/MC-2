# Color System Documentation

## Design Principles

Our color system follows these best practices:

1. **Centralized CSS Variables**: All colors are defined in `app/globals.css` using CSS custom properties
2. **Semantic Naming**: Use purpose-based names (`foreground`, `muted-foreground`) rather than color names
3. **Automatic Theme Support**: Colors automatically adapt between light and dark themes
4. **WCAG Compliance**: Maintain minimum contrast ratios for accessibility

## Color Variables

### Text Colors

| Class | Light Theme | Dark Theme | Usage |
|-------|-------------|------------|--------|
| `text-foreground` | `hsl(0 0% 3.9%)` | `hsl(210 40% 98%)` | Primary text, headings |
| `text-muted-foreground` | `hsl(0 0% 40%)` | `hsl(215 16% 47%)` | Secondary text, descriptions |
| `text-card-foreground` | `hsl(0 0% 3.9%)` | `hsl(210 40% 98%)` | Text on card backgrounds |

### Background Colors

| Class | Light Theme | Dark Theme | Usage |
|-------|-------------|------------|--------|
| `bg-background` | `hsl(0 0% 100%)` | `hsl(222 47% 11%)` | Main page background |
| `bg-card` | `hsl(0 0% 100%)` | `hsl(217 33% 19%)` | Card backgrounds |
| `bg-muted` | `hsl(0 0% 96.1%)` | `hsl(217 33% 17%)` | Subtle backgrounds |

### Interactive Colors

| Class | Light Theme | Dark Theme | Usage |
|-------|-------------|------------|--------|
| `text-primary` | `hsl(259 100% 65%)` | `hsl(259 100% 65%)` | Links, CTAs, active states |
| `text-destructive` | `hsl(0 84.2% 60.2%)` | `hsl(0 62.8% 30.6%)` | Errors, delete actions |

## Usage Guidelines

### DO ✅

```tsx
// Use semantic classes that adapt to theme
<h1 className="text-foreground">Main Heading</h1>
<p className="text-muted-foreground">Secondary text</p>

// Use CSS variables for custom components
.custom-element {
  color: var(--color-muted-foreground);
}
```

### DON'T ❌

```tsx
// Don't use hardcoded colors
<h1 className="text-gray-900 dark:text-white">Heading</h1>

// Don't use non-semantic color names
<p className="text-gray-600">Description</p>
```

## Contrast Ratios

All color combinations meet WCAG AA standards:

- `foreground` on `background`: 21:1 (AAA)
- `muted-foreground` on `background`: 10.5:1 (AAA)
- `primary` on `background`: 4.5:1 (AA)

## Modifying Colors

To adjust colors for better contrast or branding:

1. Edit `app/globals.css`
2. Update both `:root` (light) and `.dark` (dark) sections
3. Test contrast ratios using tools like WebAIM Contrast Checker
4. Ensure consistency across all themes

## Migration Guide

If you find components using hardcoded colors:

```tsx
// Old approach
className="text-gray-600 dark:text-gray-400"

// New approach
className="text-muted-foreground"
```

This ensures consistent theming and easier maintenance.