/**
 * Environment Variable Validation Module
 * @module shared/config/env-validator
 *
 * This module provides centralized validation of required environment variables
 * at application startup. It ensures all critical configuration is present before
 * the application initializes any services.
 *
 * ## Usage
 *
 * Import and call at the top of your server entrypoint:
 * ```typescript
 * import { validateEnvironment } from './shared/config/env-validator';
 *
 * // Validate all required env vars before starting server
 * validateEnvironment();
 * ```
 *
 * ## Security Benefits
 *
 * - Fail-fast on missing configuration (prevents runtime errors)
 * - Clear error messages for troubleshooting
 * - Prevents partial initialization with missing config
 * - Type-safe access to validated environment variables
 *
 * @see Issue MEDIUM-5: Environment Variable Access Without Validation
 */

/**
 * Required environment variables for the application
 * Categorized by subsystem for clarity
 */
const REQUIRED_ENV_VARS = {
  // Core Server Configuration
  server: ['NODE_ENV', 'PORT'] as const,

  // Supabase Database & Auth
  supabase: [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_ANON_KEY',
  ] as const,

  // Redis (Job Queue & Rate Limiting)
  redis: ['REDIS_URL'] as const,

  // Qdrant Vector Database
  qdrant: ['QDRANT_URL', 'QDRANT_API_KEY'] as const,

  // Jina AI Embeddings
  jina: ['JINA_API_KEY'] as const,

  // Docling Document Processing (optional in development)
  docling: [] as const, // DOCLING_API_URL is optional
} as const;

/**
 * Environment validation error with detailed context
 */
export class EnvironmentValidationError extends Error {
  constructor(
    message: string,
    public readonly missingVars: string[],
    public readonly category?: string
  ) {
    super(message);
    this.name = 'EnvironmentValidationError';
  }
}

/**
 * Validates all required environment variables are present
 *
 * @throws {EnvironmentValidationError} If any required variables are missing
 */
export function validateEnvironment(): void {
  const missing: string[] = [];
  const missingByCategory: Record<string, string[]> = {};

  // Check each category of required variables
  for (const [category, vars] of Object.entries(REQUIRED_ENV_VARS)) {
    const categoryMissing: string[] = [];

    for (const envVar of vars) {
      if (!process.env[envVar]) {
        missing.push(envVar);
        categoryMissing.push(envVar);
      }
    }

    if (categoryMissing.length > 0) {
      missingByCategory[category] = categoryMissing;
    }
  }

  // If any variables are missing, throw detailed error
  if (missing.length > 0) {
    const categoryDetails = Object.entries(missingByCategory)
      .map(([cat, vars]) => `  - ${cat}: ${vars.join(', ')}`)
      .join('\n');

    const errorMessage =
      `Missing required environment variables:\n${categoryDetails}\n\n` +
      'Please ensure these variables are set in your .env file.\n' +
      'See .env.example for required configuration.';

    throw new EnvironmentValidationError(errorMessage, missing);
  }

  // Log successful validation (helps with debugging)
  console.info('✅ Environment validation passed - all required variables present');
}

/**
 * Validates environment variables for a specific subsystem
 * Useful for lazy-loaded services
 *
 * @param subsystem - The subsystem to validate ('supabase', 'redis', 'qdrant', 'jina')
 * @throws {EnvironmentValidationError} If required variables for the subsystem are missing
 */
export function validateSubsystem(
  subsystem: keyof typeof REQUIRED_ENV_VARS
): void {
  const vars = REQUIRED_ENV_VARS[subsystem];
  const missing: string[] = [];

  for (const envVar of vars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    const errorMessage =
      `Missing required environment variables for ${subsystem}:\n` +
      `  ${missing.join(', ')}\n\n` +
      'Please ensure these variables are set in your .env file.';

    throw new EnvironmentValidationError(errorMessage, missing, subsystem);
  }
}

/**
 * Gets an environment variable with a fallback default
 * Use this for optional configuration with sensible defaults
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns The environment variable value or default
 */
export function getEnvWithDefault<T extends string | undefined>(
  key: string,
  defaultValue: T
): string | T {
  return process.env[key] || defaultValue;
}

/**
 * Gets a required environment variable
 * Throws if not present (use after validateEnvironment())
 *
 * @param key - Environment variable name
 * @returns The environment variable value
 * @throws {Error} If the variable is not set
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Required environment variable ${key} is not set. ` +
        'This should have been caught by validateEnvironment().'
    );
  }
  return value;
}

/**
 * Type-safe environment variable access
 * Returns typed environment variables for known keys
 */
export const env = {
  // Server
  get nodeEnv() {
    return getRequiredEnv('NODE_ENV');
  },
  get port() {
    return parseInt(getRequiredEnv('PORT'), 10);
  },
  get corsOrigin() {
    return getEnvWithDefault('CORS_ORIGIN', '*');
  },

  // Supabase
  get supabaseUrl() {
    return getRequiredEnv('SUPABASE_URL');
  },
  get supabaseServiceKey() {
    return getRequiredEnv('SUPABASE_SERVICE_KEY');
  },
  get supabaseAnonKey() {
    return getRequiredEnv('SUPABASE_ANON_KEY');
  },

  // Redis
  get redisUrl() {
    return getRequiredEnv('REDIS_URL');
  },

  // Qdrant
  get qdrantUrl() {
    return getRequiredEnv('QDRANT_URL');
  },
  get qdrantApiKey() {
    return getRequiredEnv('QDRANT_API_KEY');
  },

  // Jina
  get jinaApiKey() {
    return getRequiredEnv('JINA_API_KEY');
  },

  // Optional
  get uploadsDir() {
    return getEnvWithDefault('UPLOADS_DIR', '/tmp/megacampus/uploads');
  },
  get doclingApiUrl() {
    return getEnvWithDefault('DOCLING_API_URL', undefined);
  },
  get logLevel() {
    return getEnvWithDefault('LOG_LEVEL', 'info');
  },
} as const;
