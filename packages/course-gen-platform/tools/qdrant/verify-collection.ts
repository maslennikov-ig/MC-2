import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../src/shared/logger/index.js';
import { runCollectionCli } from '../../src/shared/qdrant/create-collection.js';

function isDirectExecution(metaUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) {
    return false;
  }
  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

if (isDirectExecution(import.meta.url)) {
  runCollectionCli(process.argv.slice(2), {
    verifyOnly: true,
    programName: 'qdrant:verify',
  })
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(error => {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Qdrant collection verification CLI failed'
      );
      process.exitCode = 1;
    });
}
