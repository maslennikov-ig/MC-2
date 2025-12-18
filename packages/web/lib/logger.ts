// Simple logger utility for production-safe logging
// Only logs in development or when explicitly needed

interface LogLevel {
  DEBUG: 0
  INFO: 1
  WARN: 2
  ERROR: 3
}

const LOG_LEVELS: LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development'
  private currentLevel = this.isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN

  debug(...args: unknown[]) {
    if (this.currentLevel <= LOG_LEVELS.DEBUG) {
      console.debug('[DEBUG]', ...args)
    }
  }

  info(...args: unknown[]) {
    if (this.currentLevel <= LOG_LEVELS.INFO) {
      console.info('[INFO]', ...args)
    }
  }

  warn(message: string, context?: Record<string, unknown>) {
    if (this.currentLevel <= LOG_LEVELS.WARN) {
      if (context && Object.keys(context).length > 0) {
        console.warn('[WARN]', message, context)
      } else {
        console.warn('[WARN]', message)
      }
    }
  }

  error(...args: unknown[]) {
    // Always log errors
    console.error('[ERROR]', ...args)
  }

  // For development only logging
  devLog(...args: unknown[]) {
    if (this.isDevelopment) {
      console.log('[DEV]', ...args)
    }
  }
}

export const logger = new Logger()