import { describe, expect, test } from 'vitest'

import { resolvePlaywrightWebServer } from '../../playwright.config'

describe('Playwright web server config', () => {
  test('keeps localhost:3000 as the default web server URL', () => {
    const webServer = resolvePlaywrightWebServer({})

    expect(webServer.url).toBe('http://localhost:3000')
    expect(webServer.isManaged).toBe(true)
    expect(webServer.port).toBe('3000')
    expect(webServer.env.PORT).toBe('3000')
    expect(webServer.env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000')
  })

  test.each([
    {
      env: { PLAYWRIGHT_PORT: '3101' },
      expectedUrl: 'http://localhost:3101',
      expectedPort: '3101',
    },
    {
      env: { PORT: '3102' },
      expectedUrl: 'http://localhost:3102',
      expectedPort: '3102',
    },
    {
      env: { PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3103' },
      expectedUrl: 'http://127.0.0.1:3103',
      expectedPort: '3103',
    },
  ])(
    'derives one coherent URL from $env',
    ({ env, expectedPort, expectedUrl }) => {
      const webServer = resolvePlaywrightWebServer(env)

      expect(webServer.url).toBe(expectedUrl)
      expect(webServer.isManaged).toBe(true)
      expect(webServer.port).toBe(expectedPort)
      expect(webServer.env.PORT).toBe(expectedPort)
      expect(webServer.env.NEXT_PUBLIC_APP_URL).toBe(expectedUrl)
    }
  )

  test('does not start a managed dev server for an external base URL', () => {
    const webServer = resolvePlaywrightWebServer({
      PLAYWRIGHT_BASE_URL: 'https://staging.example.com/',
    })

    expect(webServer.url).toBe('https://staging.example.com')
    expect(webServer.isManaged).toBe(false)
    expect(webServer.port).toBeUndefined()
    expect(webServer.env.PORT).toBeUndefined()
    expect(webServer.env.NEXT_PUBLIC_APP_URL).toBe('https://staging.example.com')
  })

  test('preserves explicit base URL paths and query strings', () => {
    const webServer = resolvePlaywrightWebServer({
      PLAYWRIGHT_BASE_URL: ' http://localhost:3104/ru/career-playbook?smoke=1 ',
    })

    expect(webServer.url).toBe('http://localhost:3104/ru/career-playbook?smoke=1')
    expect(webServer.isManaged).toBe(true)
    expect(webServer.port).toBe('3104')
    expect(webServer.env.NEXT_PUBLIC_APP_URL).toBe(
      'http://localhost:3104/ru/career-playbook?smoke=1'
    )
  })
})
