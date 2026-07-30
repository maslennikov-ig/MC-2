import { closeSync, fchmodSync, openSync, writeSync } from 'node:fs';
import { isAbsolute, resolve as resolvePath } from 'node:path';

import {
  computeSourceForwardAcceptance,
  createDefaultSourceForwardAcceptanceDependencies,
  type SourceForwardAcceptanceAuthority,
  type SourceForwardAcceptanceEmitDependencies,
} from './source-recovery-reindex-adapters';

/**
 * W7a real leg CLI: the source.forward acceptance emit-entrypoint invoked by
 * `source-recovery-run.sh --operation forward` (via tsx). After the recovery forward writes its
 * reviewed manifest + journal, this COMPUTES the acceptance authority
 * (recovery_manifest_sha256 + coverage_fingerprint + the `catalog:<recovery-run-id>` authority token,
 * owner-approved amendment 2026-07-25) and writes it owner-only 0400 to
 * the run-root `source-forward-acceptance.json` the Q12 controller's `read_source_forward_acceptance`
 * consumes. Kept side-effect-free on import so the unit test can drive the parts with injected deps.
 */

export interface EmitSourceForwardAcceptanceArgs {
  manifestPath: string;
  journalPath: string;
  recoveryRunId: string;
  coverageRun: string;
  outputPath: string;
}

const FLAG_TO_KEY: Readonly<Record<string, keyof EmitSourceForwardAcceptanceArgs>> = {
  '--manifest': 'manifestPath',
  '--journal': 'journalPath',
  '--recovery-run-id': 'recoveryRunId',
  '--accepted-coverage-run': 'coverageRun',
  '--output': 'outputPath',
};

export function parseEmitSourceForwardAcceptanceArgv(
  argv: readonly string[]
): EmitSourceForwardAcceptanceArgs {
  const parsed: Partial<EmitSourceForwardAcceptanceArgs> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    const key = FLAG_TO_KEY[flag];
    if (key === undefined || value === undefined) {
      throw new Error(`Unknown or incomplete source.forward acceptance emit argument: ${flag}`);
    }
    parsed[key] = value;
  }
  const { manifestPath, journalPath, recoveryRunId, coverageRun, outputPath } = parsed;
  if (!manifestPath || !journalPath || !recoveryRunId || !coverageRun || !outputPath) {
    throw new Error(
      'source.forward acceptance emit requires --manifest --journal --recovery-run-id ' +
        '--accepted-coverage-run --output'
    );
  }
  if (!isAbsolute(outputPath) || resolvePath(outputPath) !== outputPath) {
    throw new Error(
      'source.forward acceptance --output must be an explicit normalized absolute path'
    );
  }
  return { manifestPath, journalPath, recoveryRunId, coverageRun, outputPath };
}

export function writeSourceForwardAcceptanceAuthority(
  outputPath: string,
  authority: SourceForwardAcceptanceAuthority
): void {
  // The wrapper may run this as root inside a controller-writable run root, so never
  // truncate through or chmod a swapped path: create-new only ('wx' = O_CREAT|O_EXCL,
  // which refuses an existing entry INCLUDING a planted symlink), then finalize the
  // mode on the descriptor we own.
  const fd = openSync(outputPath, 'wx', 0o400);
  try {
    writeSync(fd, `${JSON.stringify(authority)}\n`, null, 'utf-8');
    fchmodSync(fd, 0o400);
  } finally {
    closeSync(fd);
  }
}

export async function runEmitSourceForwardAcceptance(
  args: EmitSourceForwardAcceptanceArgs,
  dependencies: SourceForwardAcceptanceEmitDependencies,
  writeAuthority: (
    outputPath: string,
    authority: SourceForwardAcceptanceAuthority
  ) => void = writeSourceForwardAcceptanceAuthority
): Promise<SourceForwardAcceptanceAuthority> {
  const authority = await computeSourceForwardAcceptance(
    {
      manifestPath: args.manifestPath,
      journalPath: args.journalPath,
      expectedRecoveryRunId: args.recoveryRunId,
      acceptedCoverageAuthority: args.coverageRun,
    },
    dependencies
  );
  writeAuthority(args.outputPath, authority);
  return authority;
}

async function main(): Promise<void> {
  const args = parseEmitSourceForwardAcceptanceArgv(process.argv.slice(2));
  await runEmitSourceForwardAcceptance(args, createDefaultSourceForwardAcceptanceDependencies());
}

if (process.argv[1]?.endsWith('emit-source-forward-acceptance.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
