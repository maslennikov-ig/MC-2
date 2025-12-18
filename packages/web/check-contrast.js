// Simple contrast ratio calculator for WCAG AA compliance
// Normal text: 4.5:1 minimum
// Large text (18pt+ or 14pt+ bold): 3:1 minimum

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function getLuminance(rgb) {
  const { r, g, b } = rgb;
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(color1, color2) {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  
  if (!rgb1 || !rgb2) return null;
  
  const lum1 = getLuminance(rgb1);
  const lum2 = getLuminance(rgb2);
  
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

// Light theme color combinations to check
const lightThemeCombos = [
  { name: 'Primary text on white', fg: '#111827', bg: '#FFFFFF', minRatio: 4.5 },
  { name: 'Secondary text on white', fg: '#4B5563', bg: '#FFFFFF', minRatio: 4.5 },
  { name: 'Muted text on white', fg: '#6B7280', bg: '#FFFFFF', minRatio: 4.5 },
  { name: 'Primary button', fg: '#FFFFFF', bg: '#9333EA', minRatio: 4.5 },
  { name: 'Card text on card bg', fg: '#111827', bg: '#FFFFFF', minRatio: 4.5 },
  { name: 'Badge text (success)', fg: '#166534', bg: '#DCFCE7', minRatio: 4.5 },
  { name: 'Badge text (warning)', fg: '#854D0E', bg: '#FEF3C7', minRatio: 4.5 },
  { name: 'Badge text (error)', fg: '#991B1B', bg: '#FEE2E2', minRatio: 4.5 },
  { name: 'Input text', fg: '#111827', bg: '#FFFFFF', minRatio: 4.5 },
  { name: 'Input placeholder', fg: '#6B7280', bg: '#FFFFFF', minRatio: 4.5 }, // Fixed: using gray-500
  { name: 'Link text', fg: '#9333EA', bg: '#FFFFFF', minRatio: 4.5 },
];

// Dark theme color combinations to check  
const darkThemeCombos = [
  { name: 'Primary text on dark', fg: '#FFFFFF', bg: '#020617', minRatio: 4.5 },
  { name: 'Secondary text on dark', fg: '#9CA3AF', bg: '#020617', minRatio: 4.5 },
  { name: 'Muted text on dark', fg: '#9CA3AF', bg: '#020617', minRatio: 4.5 }, // Fixed: using gray-400
  { name: 'Primary button', fg: '#FFFFFF', bg: '#9333EA', minRatio: 4.5 },
  { name: 'Card text on card bg', fg: '#FFFFFF', bg: '#1E293B', minRatio: 4.5 },
  { name: 'Badge text (success)', fg: '#4ADE80', bg: '#14532D', minRatio: 4.5 },
  { name: 'Badge text (warning)', fg: '#FDE047', bg: '#422006', minRatio: 4.5 },
  { name: 'Badge text (error)', fg: '#F87171', bg: '#450A0A', minRatio: 4.5 },
  { name: 'Input text', fg: '#FFFFFF', bg: '#1E293B', minRatio: 4.5 },
  { name: 'Input placeholder', fg: '#9CA3AF', bg: '#1E293B', minRatio: 4.5 }, // Fixed: using gray-400
  { name: 'Link text', fg: '#A855F7', bg: '#020617', minRatio: 4.5 },
];

function checkThemeContrast(themeName, combinations) {
  console.log(`\n=== ${themeName} Theme Contrast Check ===\n`);
  
  let passCount = 0;
  let failCount = 0;
  const failures = [];
  
  combinations.forEach(combo => {
    const ratio = getContrastRatio(combo.fg, combo.bg);
    
    if (ratio) {
      const passes = ratio >= combo.minRatio;
      const status = passes ? '✅ PASS' : '❌ FAIL';
      
      if (passes) {
        passCount++;
      } else {
        failCount++;
        failures.push(combo);
      }
      
      console.log(`${status} ${combo.name}`);
      console.log(`  Foreground: ${combo.fg}, Background: ${combo.bg}`);
      console.log(`  Contrast Ratio: ${ratio.toFixed(2)}:1 (Required: ${combo.minRatio}:1)`);
      console.log('');
    }
  });
  
  console.log(`\nSummary: ${passCount} passed, ${failCount} failed`);
  
  if (failures.length > 0) {
    console.log('\n⚠️  Failed combinations need adjustment:');
    failures.forEach(combo => {
      const ratio = getContrastRatio(combo.fg, combo.bg);
      console.log(`- ${combo.name}: ${ratio.toFixed(2)}:1 (needs ${combo.minRatio}:1)`);
    });
  } else {
    console.log('\n✅ All combinations meet WCAG AA requirements!');
  }
  
  return { passCount, failCount, failures };
}

// Run checks
const lightResults = checkThemeContrast('Light', lightThemeCombos);
const darkResults = checkThemeContrast('Dark', darkThemeCombos);

// Final summary
console.log('\n' + '='.repeat(50));
console.log('FINAL WCAG AA COMPLIANCE SUMMARY');
console.log('='.repeat(50));
console.log(`Light Theme: ${lightResults.failCount === 0 ? '✅ COMPLIANT' : '❌ NEEDS WORK'}`);
console.log(`Dark Theme: ${darkResults.failCount === 0 ? '✅ COMPLIANT' : '❌ NEEDS WORK'}`);

if (lightResults.failCount === 0 && darkResults.failCount === 0) {
  console.log('\n🎉 Both themes meet WCAG AA contrast requirements!');
} else {
  console.log('\n⚠️  Some contrast ratios need improvement for WCAG AA compliance.');
}