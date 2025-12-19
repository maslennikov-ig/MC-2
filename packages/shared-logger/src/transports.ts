import type { TransportSingleOptions, TransportMultiOptions } from 'pino';

type TransportConfig = TransportSingleOptions | TransportMultiOptions | undefined;

interface TransportTarget {
  target: string;
  options?: Record<string, unknown>;
  level?: string;
}

export function getTransportConfig(): TransportConfig {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (isDevelopment) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  const targets: TransportTarget[] = [];

  // Axiom transport (production only, if configured)
  if (process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET) {
    targets.push({
      target: '@axiomhq/pino',
      options: {
        dataset: process.env.AXIOM_DATASET,
        token: process.env.AXIOM_TOKEN,
      },
      level: 'info',
    });
  }

  // Always log to stdout for container logs
  targets.push({
    target: 'pino/file',
    options: { destination: 1 },
    level: 'info',
  });

  if (targets.length === 0) {
    return undefined;
  }

  if (targets.length === 1) {
    return targets[0] as TransportSingleOptions;
  }

  return { targets } as TransportMultiOptions;
}
