import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  // Enhanced reporting
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    process.env.CI ? ['github'] : ['list']
  ],
  
  // Global test settings
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
    
    // Browser context options
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    
    // Additional context
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  },
  
  // Test projects for different browsers and scenarios
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    
    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
    
    // Specific test scenarios
    {
      name: 'dark-mode',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
      },
    },
    
    // Performance testing
    {
      name: 'performance',
      use: {
        ...devices['Desktop Chrome'],
        // Slow network simulation
        launchOptions: {
          args: ['--disable-web-security', '--disable-features=VizDisplayCompositor']
        }
      },
      testMatch: '**/*performance*.spec.ts'
    },
    
    // Accessibility testing
    {
      name: 'accessibility',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/*a11y*.spec.ts', '**/*accessibility*/**/*.test.ts']
    },
    
    // Accessibility testing with axe-core
    {
      name: 'axe-accessibility',
      use: {
        ...devices['Desktop Chrome'],
        // Enable experimental features for better axe integration
        launchOptions: {
          args: ['--enable-experimental-web-platform-features']
        }
      },
      testMatch: '**/__tests__/accessibility/**/*.test.ts'
    },

    // Markdown visual regression testing
    {
      name: 'markdown-visual',
      use: {
        ...devices['Desktop Chrome'],
        // Consistent rendering for visual tests
        viewport: { width: 1280, height: 720 },
        colorScheme: 'light',
      },
      testMatch: '**/visual/markdown-visual.spec.ts'
    }
  ],
  
  // Development server configuration
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
      NEXT_PRIVATE_SKIP_CACHE: '1'
    }
  },
  
  // Output and artifacts
  outputDir: 'test-results/',
  
  // Test timeout
  timeout: 30000,
  expect: {
    timeout: 5000,
    toMatchSnapshot: {
      threshold: 0.2
    },
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixelRatio: 0.05,
    }
  },

  // Snapshot path configuration for visual tests
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  
  // Global setup and teardown
  globalSetup: require.resolve('./tests/global-setup.ts'),
  globalTeardown: require.resolve('./tests/global-teardown.ts'),
});