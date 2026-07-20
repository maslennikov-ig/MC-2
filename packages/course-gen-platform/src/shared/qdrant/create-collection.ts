import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger/index.js';
import { COLLECTION_CREATE_PARAMS } from './collection-schema';
import {
  ensureCourseEmbeddingsCollection,
  verifyCourseEmbeddingsCollection,
  type EnsureCollectionOptions,
} from './collection-manager';
import { QDRANT_COLLECTION_ALIAS } from './config';

export interface CollectionCliOptions {
  physicalName?: string;
  aliasName?: string;
  verifyOnly: boolean;
  allowDropLegacy: boolean;
  help: boolean;
}

interface RunCollectionCliDefaults {
  verifyOnly?: boolean;
  programName?: string;
}

const HELP = `Usage: qdrant:bootstrap [options]

Create or verify the versioned Qdrant collection and its stable alias.

Options:
  --physical <name>       Physical collection name
  --alias <name>          Stable application alias
  --verify-only           Report schema and alias drift without mutation
  --allow-drop-legacy     Allow deletion of the physical legacy alias-name collection
  -h, --help              Show this help
`;

function readOptionValue(args: string[], index: number, option: string): [string, number] {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return [value, index + 1];
}

export function parseCollectionCliArgs(args: string[]): CollectionCliOptions {
  const options: CollectionCliOptions = {
    verifyOnly: false,
    allowDropLegacy: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') {
      continue;
    } else if (argument === '--verify-only') {
      options.verifyOnly = true;
    } else if (argument === '--allow-drop-legacy') {
      options.allowDropLegacy = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--physical') {
      const [value, valueIndex] = readOptionValue(args, index, argument);
      options.physicalName = value;
      index = valueIndex;
    } else if (argument.startsWith('--physical=')) {
      options.physicalName = argument.slice('--physical='.length);
    } else if (argument === '--alias') {
      const [value, valueIndex] = readOptionValue(args, index, argument);
      options.aliasName = value;
      index = valueIndex;
    } else if (argument.startsWith('--alias=')) {
      options.aliasName = argument.slice('--alias='.length);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

export async function runCollectionCli(
  args: string[],
  defaults: RunCollectionCliDefaults = {}
): Promise<number> {
  const options = parseCollectionCliArgs(args);
  if (options.help) {
    process.stdout.write(
      HELP.replace('qdrant:bootstrap', defaults.programName ?? 'qdrant:bootstrap')
    );
    return 0;
  }

  const managerOptions: EnsureCollectionOptions = {
    aliasName: options.aliasName,
    physicalName: options.physicalName,
    allowDropLegacy: options.allowDropLegacy,
  };
  const verifyOnly = defaults.verifyOnly === true || options.verifyOnly;
  const verification = verifyOnly
    ? await verifyCourseEmbeddingsCollection(managerOptions)
    : await ensureCourseEmbeddingsCollection(managerOptions);

  if (!verification.ok) {
    logger.error(
      {
        aliasName: verification.aliasName,
        physicalName: verification.physicalName,
        mismatches: verification.mismatches,
      },
      verifyOnly ? 'Qdrant collection verification failed' : 'Qdrant collection bootstrap refused'
    );
    return 1;
  }

  logger.info(
    {
      aliasName: verification.aliasName,
      physicalName: verification.physicalName,
    },
    verifyOnly ? 'Qdrant collection verification passed' : 'Qdrant collection bootstrap complete'
  );
  return 0;
}

export function isDirectExecution(metaUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) {
    return false;
  }
  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

/**
 * Backward-compatible schema view for current callers. The values are derived
 * from the Q1 contract rather than defining a second collection schema.
 */
export const COLLECTION_CONFIG = {
  name: QDRANT_COLLECTION_ALIAS,
  vectors: COLLECTION_CREATE_PARAMS.vectors,
  sparse_vectors: COLLECTION_CREATE_PARAMS.sparse_vectors,
  optimizers_config: COLLECTION_CREATE_PARAMS.optimizers_config,
} as const;

/** @deprecated Prefer ensureCourseEmbeddingsCollection from collection-manager. */
export async function createCourseEmbeddingsCollection(): Promise<void> {
  const verification = await ensureCourseEmbeddingsCollection();
  if (!verification.ok) {
    throw new Error(`Qdrant collection bootstrap refused: ${verification.mismatches.join('; ')}`);
  }
}

if (isDirectExecution(import.meta.url)) {
  runCollectionCli(process.argv.slice(2))
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(error => {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Qdrant collection CLI failed'
      );
      process.exitCode = 1;
    });
}
