import * as sharedLogger from '@megacampus/shared-logger';
import type { Logger } from 'pino';

type RuntimeObject = Record<string, unknown>;

function isObject(value: unknown): value is RuntimeObject {
  return Boolean(value) && typeof value === 'object';
}

function isLogger(value: unknown): value is Logger {
  return isObject(value) && typeof value.debug === 'function' && typeof value.child === 'function';
}

function resolveLogger(value: unknown, seen = new Set<unknown>()): Logger | null {
  if (isLogger(value)) return value;
  if (!isObject(value) || seen.has(value)) return null;

  seen.add(value);
  return resolveLogger(value.logger, seen) ?? resolveLogger(value.default, seen);
}

function resolveRuntimeObject(value: unknown): RuntimeObject {
  if (!isObject(value)) return {};
  if ('createChildLogger' in value || 'detectEnvironment' in value) return value;

  const defaultValue = value.default;
  if (
    isObject(defaultValue) &&
    ('createChildLogger' in defaultValue || 'detectEnvironment' in defaultValue)
  ) {
    return defaultValue;
  }

  return value;
}

const runtime = resolveRuntimeObject(sharedLogger);

export const baseLogger =
  resolveLogger(sharedLogger) ??
  (() => {
    throw new Error('@megacampus/shared-logger did not expose a compatible logger runtime');
  })();

export const baseCreateChildLogger =
  typeof runtime.createChildLogger === 'function'
    ? (runtime.createChildLogger as (context: Record<string, unknown>) => Logger)
    : (context: Record<string, unknown>) => baseLogger.child(context);

export const baseCreateModuleLogger =
  typeof runtime.createModuleLogger === 'function'
    ? (runtime.createModuleLogger as (module: string) => Logger)
    : (module: string) => baseLogger.child({ module });

export const baseCreateRequestLogger =
  typeof runtime.createRequestLogger === 'function'
    ? (runtime.createRequestLogger as (requestId: string, userId?: string) => Logger)
    : (requestId: string, userId?: string) => baseLogger.child({ requestId, userId });

export const detectRuntimeEnvironment =
  typeof runtime.detectEnvironment === 'function'
    ? (runtime.detectEnvironment as () => string | null)
    : () => null;
