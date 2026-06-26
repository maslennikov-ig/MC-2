export type PlaywrightWebServerEnv = NodeJS.ProcessEnv | Record<string, string | undefined>

export type PlaywrightWebServer = {
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
