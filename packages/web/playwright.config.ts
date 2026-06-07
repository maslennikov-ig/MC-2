import { defineConfig, devices } from '@playwright/test'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key'
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role-key'
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim()
const disableVideo = process.env.PLAYWRIGHT_DISABLE_VIDEO === '1'

type PlaywrightWebServerEnv = NodeJS.ProcessEnv | Record<string, string | undefined>

type PlaywrightWebServer = {
  url: string
  isManaged: boolean
  port?: string
  env: {
    PORT?: string
    NEXT_PUBLIC_APP_URL: string
  }
}

function normalizePlaywrightBaseUrl(rawUrl: string) {
  const url = new URL(rawUrl)

  if (url.pathname === '/' && !url.search && !url.hash) {
    return url.href.replace(/\/$/, '')
  }

  return url.href
}

function getPortFromBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl)

  if (url.port) {
    return url.port
  }

  return url.protocol === 'https:' ? '443' : '80'
}

function isManagedLocalUrl(baseUrl: string) {
  const { hostname } = new URL(baseUrl)
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(hostname)
}

export function resolvePlaywrightWebServer(
  env: PlaywrightWebServerEnv = process.env
): PlaywrightWebServer {
  const explicitBaseUrl = env.PLAYWRIGHT_BASE_URL?.trim()

  if (explicitBaseUrl) {
    const url = normalizePlaywrightBaseUrl(explicitBaseUrl)
    if (!isManagedLocalUrl(url)) {
      return {
        url,
        isManaged: false,
        env: {
          NEXT_PUBLIC_APP_URL: url,
        },
      }
    }

    const port = getPortFromBaseUrl(url)

    return {
      url,
      isManaged: true,
      port,
      env: {
        PORT: port,
        NEXT_PUBLIC_APP_URL: url,
      },
    }
  }

  const port = env.PLAYWRIGHT_PORT?.trim() || env.PORT?.trim() || '3000'
  const url = `http://localhost:${port}`

  return {
    url,
    isManaged: true,
    port,
    env: {
      PORT: port,
      NEXT_PUBLIC_APP_URL: url,
    },
  }
}

const webServer = resolvePlaywrightWebServer()
function withOptionalChromiumExecutable<TUse extends Record<string, unknown>>(use: TUse): TUse {
  if (!chromiumExecutablePath) return use

  return {
    ...use,
    launchOptions: {
      ...((use.launchOptions as Record<string, unknown> | undefined) ?? {}),
      executablePath: chromiumExecutablePath,
    },
  }
}

const managedWebServer = webServer.isManaged
  ? {
      command: 'pnpm run dev',
      url: webServer.url,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        NODE_ENV: 'test',
        PORT: webServer.env.PORT ?? webServer.port ?? '3000',
        NEXT_PRIVATE_SKIP_CACHE: '1',
        SKIP_ENV_VALIDATION: 'true',
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
        NEXT_PUBLIC_APP_URL: webServer.env.NEXT_PUBLIC_APP_URL,
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
      },
    }
  : undefined

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
    process.env.CI ? ['github'] : ['list'],
  ],

  // Global test settings
  use: {
    baseURL: webServer.url,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: disableVideo ? 'off' : 'retain-on-failure',
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
      use: withOptionalChromiumExecutable({ ...devices['Desktop Chrome'] }),
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
      use: withOptionalChromiumExecutable({ ...devices['Pixel 5'] }),
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },

    // Specific test scenarios
    {
      name: 'dark-mode',
      use: {
        ...withOptionalChromiumExecutable({ ...devices['Desktop Chrome'] }),
        colorScheme: 'dark',
      },
    },

    // Performance testing
    {
      name: 'performance',
      use: {
        ...withOptionalChromiumExecutable({ ...devices['Desktop Chrome'] }),
        // Slow network simulation
        launchOptions: {
          ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
          args: ['--disable-web-security', '--disable-features=VizDisplayCompositor'],
        },
      },
      testMatch: '**/*performance*.spec.ts',
    },

    // Accessibility testing
    {
      name: 'accessibility',
      use: withOptionalChromiumExecutable({ ...devices['Desktop Chrome'] }),
      testMatch: ['**/*a11y*.spec.ts', '**/*accessibility*/**/*.test.ts'],
    },

    // Accessibility testing with axe-core
    {
      name: 'axe-accessibility',
      use: {
        ...withOptionalChromiumExecutable({ ...devices['Desktop Chrome'] }),
        // Enable experimental features for better axe integration
        launchOptions: {
          ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
          args: ['--enable-experimental-web-platform-features'],
        },
      },
      testMatch: '**/__tests__/accessibility/**/*.test.ts',
    },

    // Markdown visual regression testing
    {
      name: 'markdown-visual',
      use: {
        ...withOptionalChromiumExecutable({ ...devices['Desktop Chrome'] }),
        // Consistent rendering for visual tests
        viewport: { width: 1280, height: 720 },
        colorScheme: 'light',
      },
      testMatch: '**/visual/markdown-visual.spec.ts',
    },
  ],

  ...(managedWebServer ? { webServer: managedWebServer } : {}),

  // Output and artifacts
  outputDir: 'test-results/',

  // Test timeout
  timeout: 30000,
  expect: {
    timeout: 5000,
    toMatchSnapshot: {
      threshold: 0.2,
    },
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixelRatio: 0.05,
    },
  },

  // Snapshot path configuration for visual tests
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',

  // Global setup and teardown
  globalSetup: require.resolve('./tests/global-setup.ts'),
  globalTeardown: require.resolve('./tests/global-teardown.ts'),
})
