import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, open, realpath, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { RecoveryCopyEntry, RecoveryRunPhase } from './source-recovery-manifest.js';

export interface PublishInput {
  developmentRoot: string;
  productionRoot: string;
  entry: RecoveryCopyEntry;
}

export interface RollbackInput extends PublishInput {
  phase: RecoveryRunPhase;
  journalState: 'published' | 'rollback_planned';
}

export type RecoveryTargetInspection = 'absent' | 'exact' | 'mismatch';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const BUFFER_SIZE = 64 * 1024;

function assertRelativePath(value: string, label: string): void {
  if (
    !value ||
    isAbsolute(value) ||
    value.includes('\\') ||
    value.split('/').some(component => component === '' || component === '.' || component === '..')
  ) {
    throw new Error(`${label} must be a normalized relative path`);
  }
}

function assertContained(root: string, candidate: string, label: string): void {
  const offset = relative(root, candidate);
  if (offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
    throw new Error(`${label} violates root containment`);
  }
}

async function assertNoSymlinkComponents(root: string, relativePath: string): Promise<void> {
  let current = root;
  const components = relativePath.split('/');
  for (const component of components) {
    current = resolve(current, component);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Recovery path contains a symbolic link: ${relativePath}`);
    }
  }
}

async function resolveRoots(
  input: PublishInput,
  options: { requireSource?: boolean } = {}
): Promise<{
  developmentRoot: string;
  productionRoot: string;
  sourcePath: string;
  targetPath: string;
  targetDirectory: string;
}> {
  assertRelativePath(input.entry.source_relative_path, 'source_relative_path');
  assertRelativePath(input.entry.target_relative_path, 'target_relative_path');
  if (!SHA256_PATTERN.test(input.entry.expected_sha256)) {
    throw new Error('expected_sha256 must be lower-case SHA-256');
  }

  const developmentRoot = await realpath(input.developmentRoot);
  const productionRoot = await realpath(input.productionRoot);
  const sourcePath = resolve(developmentRoot, input.entry.source_relative_path);
  const targetPath = resolve(productionRoot, input.entry.target_relative_path);
  const targetDirectory = dirname(targetPath);
  assertContained(developmentRoot, sourcePath, 'Source path');
  assertContained(productionRoot, targetPath, 'Target path');

  if (options.requireSource !== false) {
    await assertNoSymlinkComponents(developmentRoot, input.entry.source_relative_path);
    const sourcePhysicalPath = await realpath(sourcePath);
    assertContained(developmentRoot, sourcePhysicalPath, 'Physical source path');
  }

  const targetParentRelative = relative(productionRoot, targetDirectory);
  if (targetParentRelative) await assertNoSymlinkComponents(productionRoot, targetParentRelative);
  const targetParentPhysicalPath = await realpath(targetDirectory);
  assertContained(productionRoot, targetParentPhysicalPath, 'Physical target directory');

  return { developmentRoot, productionRoot, sourcePath, targetPath, targetDirectory };
}

async function hashOpenFile(path: string): Promise<{ sha256: string; size: number }> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`Recovery path is not a regular file: ${path}`);
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(BUFFER_SIZE);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      digest.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return { sha256: digest.digest('hex'), size: position };
  } finally {
    await handle.close();
  }
}

function assertExpectedIdentity(
  entry: RecoveryCopyEntry,
  identity: { sha256: string; size: number },
  label: string
): void {
  if (identity.size !== entry.expected_size) {
    throw new Error(
      `${label} size mismatch: expected ${entry.expected_size}, found ${identity.size}`
    );
  }
  if (identity.sha256 !== entry.expected_sha256) {
    throw new Error(`${label} hash mismatch`);
  }
}

async function fsyncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertTargetAbsent(targetPath: string): Promise<void> {
  try {
    await lstat(targetPath);
    throw new Error(`Recovery target already exists: ${targetPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function copySourceToTemporary(
  sourcePath: string,
  temporaryPath: string
): Promise<{ sha256: string; size: number }> {
  const source = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let temporary: Awaited<ReturnType<typeof open>> | undefined;
  let temporaryClosed = false;
  try {
    temporary = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600
    );
    const sourceMetadata = await source.stat();
    if (!sourceMetadata.isFile()) throw new Error('Recovery source is not a regular file');
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(BUFFER_SIZE);
    let sourcePosition = 0;
    while (true) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, sourcePosition);
      if (bytesRead === 0) break;
      digest.update(buffer.subarray(0, bytesRead));
      let written = 0;
      while (written < bytesRead) {
        const result = await temporary.write(
          buffer,
          written,
          bytesRead - written,
          sourcePosition + written
        );
        written += result.bytesWritten;
      }
      sourcePosition += bytesRead;
    }
    await temporary.chmod(0o644);
    await temporary.sync();
    await temporary.close();
    temporaryClosed = true;
    return { sha256: digest.digest('hex'), size: sourcePosition };
  } finally {
    await source.close();
    if (!temporaryClosed) await temporary?.close().catch(() => undefined);
  }
}

export async function inspectRecoveryTarget(
  input: PublishInput
): Promise<RecoveryTargetInspection> {
  const { targetPath } = await resolveRoots(input, { requireSource: false });
  try {
    const metadata = await lstat(targetPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return 'mismatch';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw error;
  }
  const identity = await hashOpenFile(targetPath);
  return identity.size === input.entry.expected_size &&
    identity.sha256 === input.entry.expected_sha256
    ? 'exact'
    : 'mismatch';
}

export async function publishNoReplace(input: PublishInput): Promise<void> {
  const { sourcePath, targetPath, targetDirectory } = await resolveRoots(input);
  await assertTargetAbsent(targetPath);
  const temporaryPath = `${targetPath}.source-recovery.${process.pid}.${randomUUID()}.tmp`;
  let published = false;
  try {
    const copiedIdentity = await copySourceToTemporary(sourcePath, temporaryPath);
    assertExpectedIdentity(input.entry, copiedIdentity, 'Recovery source');
    assertExpectedIdentity(
      input.entry,
      await hashOpenFile(temporaryPath),
      'Recovery temporary file'
    );
    try {
      await link(temporaryPath, targetPath);
      published = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Recovery target already exists: ${targetPath}`, { cause: error });
      }
      throw error;
    }

    const targetHandle = await open(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      await targetHandle.sync();
    } finally {
      await targetHandle.close();
    }
    await fsyncDirectory(targetDirectory);
    await unlink(temporaryPath);
    await fsyncDirectory(targetDirectory);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    if (!published) await fsyncDirectory(targetDirectory).catch(() => undefined);
    throw error;
  }
}

export async function reconcilePublishedTarget(
  input: PublishInput,
  journalState: 'planned' | 'published'
): Promise<'ready_to_publish' | 'published'> {
  const inspection = await inspectRecoveryTarget(input);
  if (journalState === 'planned') {
    if (inspection === 'absent') return 'ready_to_publish';
    if (inspection === 'exact') {
      const { targetPath, targetDirectory } = await resolveRoots(input, { requireSource: false });
      const targetHandle = await open(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        await targetHandle.sync();
      } finally {
        await targetHandle.close();
      }
      await fsyncDirectory(targetDirectory);
      return 'published';
    }
    throw new Error('Recovery target mismatch while reconciling planned copy');
  }
  if (inspection === 'exact') return 'published';
  if (inspection === 'absent') throw new Error('Published recovery target is missing');
  throw new Error('Published recovery target mismatch');
}

export async function rollbackPublished(input: RollbackInput): Promise<void> {
  if (input.phase === 'reindex_started' || input.phase === 'complete') {
    throw new Error(`Rollback is forbidden at or after ${input.phase}`);
  }
  if (input.journalState !== 'rollback_planned') {
    throw new Error('Rollback journal state must be persisted as rollback_planned first');
  }
  const { targetPath, targetDirectory } = await resolveRoots(input, { requireSource: false });
  const identity = await hashOpenFile(targetPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Recovery rollback target is missing', { cause: error });
    }
    throw error;
  });
  assertExpectedIdentity(input.entry, identity, 'Recovery rollback target');
  await unlink(targetPath);
  await fsyncDirectory(targetDirectory);
}

export async function reconcileRollbackTarget(
  input: PublishInput,
  journalState: 'rollback_planned'
): Promise<'ready_to_rollback' | 'rolled_back'> {
  if (journalState !== 'rollback_planned') throw new Error('Invalid rollback journal state');
  const inspection = await inspectRecoveryTarget(input);
  if (inspection === 'absent') return 'rolled_back';
  if (inspection === 'exact') return 'ready_to_rollback';
  throw new Error('Recovery rollback target mismatch');
}
