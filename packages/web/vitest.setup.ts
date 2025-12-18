import '@testing-library/jest-dom/vitest';
import { vi, beforeAll, afterAll } from 'vitest';
import React from 'react';

// Mock Next.js router (pages router)
vi.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: vi.fn(),
      pop: vi.fn(),
      reload: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn().mockResolvedValue(undefined),
      beforePopState: vi.fn(),
      events: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
      },
      isFallback: false,
      isLocaleDomain: true,
      isReady: true,
      defaultLocale: 'en',
      domainLocales: [],
      isPreview: false,
    };
  },
}));

// Mock Next.js navigation (app router)
vi.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '/';
  },
}));

// Mock Next.js image
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    return React.createElement('img', props);
  },
}));

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NODE_ENV = 'test';

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver = MockIntersectionObserver;

// Mock ResizeObserver
class MockResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = MockResizeObserver;

// Mock fetch for API testing
globalThis.fetch = vi.fn();

// Polyfill Request and Response for Node.js test environment
if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = class Request {
    url: string;
    method: string;
    headers: Headers;
    body: BodyInit | null;

    constructor(url: string | URL, init?: RequestInit) {
      this.url = url.toString();
      this.method = init?.method || 'GET';
      this.headers = new Headers(init?.headers || {});
      this.body = init?.body || null;
    }
    json() {
      return Promise.resolve(JSON.parse(this.body as string));
    }
    text() {
      return Promise.resolve(this.body as string);
    }
  } as unknown as typeof Request;
}

if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {
    body: BodyInit | null;
    status: number;
    statusText: string;
    headers: Headers;

    constructor(body?: BodyInit | null, init?: ResponseInit) {
      this.body = body || null;
      this.status = init?.status || 200;
      this.statusText = init?.statusText || 'OK';
      this.headers = new Headers(init?.headers || {});
    }
    json() {
      return Promise.resolve(
        typeof this.body === 'string' ? JSON.parse(this.body) : this.body
      );
    }
    text() {
      return Promise.resolve(this.body as string);
    }
  } as unknown as typeof Response;
}

if (typeof globalThis.Headers === 'undefined') {
  globalThis.Headers = class Headers {
    private _headers: Record<string, string> = {};

    constructor(init?: HeadersInit) {
      if (init) {
        if (init instanceof Headers) {
          // Copy from another Headers object - not implemented for simplicity
        } else if (Array.isArray(init)) {
          init.forEach(([key, value]) => {
            this._headers[key.toLowerCase()] = value;
          });
        } else {
          Object.entries(init).forEach(([key, value]) => {
            this._headers[key.toLowerCase()] = value;
          });
        }
      }
    }
    get(key: string) {
      return this._headers[key.toLowerCase()];
    }
    set(key: string, value: string) {
      this._headers[key.toLowerCase()] = value;
    }
  } as unknown as typeof Headers;
}

// Set up console override for cleaner test output
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
