import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inspectRecoveryTarget,
  preflightRecoveryCopies,
  preflightRecoveryExecution,
  publishNoReplace,
  reconcilePublishedTarget,
  reconcileRollbackTarget,
  rollbackPublished,
  type PublishInput,
} from '../../../../tools/qdrant/source-recovery-filesystem.js';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

async function fixture(content = 'exact original bytes'): Promise<{
  root: string;
  input: PublishInput;
  source: string;
  target: string;
}> {
  const root = await mkdtemp('/tmp/mc2-source-recovery-fs-');
  const developmentRoot = join(root, 'development');
  const productionRoot = join(root, 'production');
  const source = join(developmentRoot, 'tenant', 'source.pdf');
  const target = join(productionRoot, 'tenant', 'target.pdf');
  await mkdir(join(developmentRoot, 'tenant'), { recursive: true });
  await mkdir(join(productionRoot, 'tenant'), { recursive: true });
  await writeFile(source, content);
  return {
    root,
    source,
    target,
    input: {
      runId: 'ea25d26d-9dc3-4c2c-9e42-95ab8270cb6e',
      developmentRoot,
      productionRoot,
      rootBinding: {
        development_root: developmentRoot,
        production_root: productionRoot,
      },
      entry: {
        entry_id: 'copy-1',
        source_relative_path: 'tenant/source.pdf',
        target_relative_path: 'tenant/target.pdf',
        expected_size: Buffer.byteLength(content),
        expected_sha256: sha256(content),
        affected_file_catalog_rows: 1,
      },
    },
  };
}

describe('source recovery filesystem engine', () => {
  it('publishes exact bytes with mode 0644 and never replaces an existing target', async () => {
    const { root, input, target } = await fixture();
    try {
      await publishNoReplace(input);

      expect(await readFile(target, 'utf8')).toBe('exact original bytes');
      expect((await stat(target)).mode & 0o777).toBe(0o644);
      expect(await inspectRecoveryTarget(input)).toBe('exact');
      expect((await readdir(join(input.productionRoot, 'tenant'))).sort()).toEqual(['target.pdf']);
      await expect(publishNoReplace(input)).rejects.toThrow(/target already exists/iu);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed for traversal, symlinks, and changed source bytes', async () => {
    const traversal = await fixture();
    const linked = await fixture();
    const changed = await fixture();
    try {
      await expect(
        publishNoReplace({
          ...traversal.input,
          entry: { ...traversal.input.entry, target_relative_path: '../escaped.pdf' },
        })
      ).rejects.toThrow(/relative path|containment/iu);

      await rm(linked.source);
      await symlink('/etc/hosts', linked.source);
      await expect(publishNoReplace(linked.input)).rejects.toThrow(/symbolic link/iu);

      await writeFile(changed.source, 'changed');
      await expect(publishNoReplace(changed.input)).rejects.toThrow(
        /size mismatch|hash mismatch/iu
      );

      await expect(
        publishNoReplace({
          ...changed.input,
          rootBinding: {
            ...changed.input.rootBinding,
            production_root: changed.input.developmentRoot,
          },
        })
      ).rejects.toThrow(/root binding|overlap/iu);
    } finally {
      await Promise.all(
        [traversal.root, linked.root, changed.root].map(root =>
          rm(root, { recursive: true, force: true })
        )
      );
    }
  });

  it('preflights every source and absent target before a safe same-filesystem capability probe', async () => {
    const first = await fixture('first exact bytes');
    const capabilityDirectory = join(first.root, 'capability');
    const secondSource = join(first.input.developmentRoot, 'tenant', 'source-2.pdf');
    const secondTarget = join(first.input.productionRoot, 'tenant', 'target-2.pdf');
    const secondContent = 'second exact bytes';
    const secondEntry = {
      ...first.input.entry,
      entry_id: 'copy-2',
      source_relative_path: 'tenant/source-2.pdf',
      target_relative_path: 'tenant/target-2.pdf',
      expected_size: Buffer.byteLength(secondContent),
      expected_sha256: sha256(secondContent),
    };
    await mkdir(capabilityDirectory, { mode: 0o700 });
    await writeFile(secondSource, secondContent);

    const preflight = () =>
      preflightRecoveryCopies({
        runId: first.input.runId,
        developmentRoot: first.input.developmentRoot,
        productionRoot: first.input.productionRoot,
        rootBinding: first.input.rootBinding,
        entries: [first.input.entry, secondEntry],
        capabilityDirectory,
      });

    try {
      await expect(preflight()).resolves.toBeUndefined();
      await expect(readFile(first.target)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(secondTarget)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readdir(capabilityDirectory)).toEqual([]);

      await writeFile(secondSource, 'late drift');
      await expect(preflight()).rejects.toThrow(/size mismatch|hash mismatch/iu);
      await expect(readFile(first.target)).rejects.toMatchObject({ code: 'ENOENT' });
      await writeFile(secondSource, secondContent);

      await writeFile(secondTarget, secondContent);
      await expect(preflight()).rejects.toThrow(/target already exists/iu);
      await expect(readFile(first.target)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(first.root, { recursive: true, force: true });
    }
  });

  it('rejects a non-owner-only or upload-root capability directory', async () => {
    const value = await fixture();
    const capabilityDirectory = join(value.root, 'capability');
    const input = {
      runId: value.input.runId,
      developmentRoot: value.input.developmentRoot,
      productionRoot: value.input.productionRoot,
      rootBinding: value.input.rootBinding,
      entries: [value.input.entry],
      capabilityDirectory,
    };
    try {
      await mkdir(capabilityDirectory, { mode: 0o700 });
      await chmod(capabilityDirectory, 0o755);
      await expect(preflightRecoveryCopies(input)).rejects.toThrow(/0700|owner-only/iu);

      await chmod(join(value.input.productionRoot, 'tenant'), 0o700);
      await expect(
        preflightRecoveryCopies({
          ...input,
          capabilityDirectory: join(value.input.productionRoot, 'tenant'),
        })
      ).rejects.toThrow(/upload root|separate|capability/iu);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it('preflights every remaining source and target before fresh or resumed execution', async () => {
    const value = await fixture('first exact bytes');
    const secondContent = 'second exact bytes';
    const secondSource = join(value.input.developmentRoot, 'tenant', 'source-2.pdf');
    const secondTarget = join(value.input.productionRoot, 'tenant', 'target-2.pdf');
    const secondEntry = {
      ...value.input.entry,
      entry_id: 'copy-2',
      source_relative_path: 'tenant/source-2.pdf',
      target_relative_path: 'tenant/target-2.pdf',
      expected_size: Buffer.byteLength(secondContent),
      expected_sha256: sha256(secondContent),
    };
    await writeFile(secondSource, secondContent);
    const preflight = (
      phase: 'planned' | 'copying',
      copyStates: Record<string, 'planned' | 'published'>
    ) =>
      preflightRecoveryExecution({
        runId: value.input.runId,
        developmentRoot: value.input.developmentRoot,
        productionRoot: value.input.productionRoot,
        rootBinding: value.input.rootBinding,
        entries: [value.input.entry, secondEntry],
        copyStates,
        phase,
      });

    try {
      await publishNoReplace(value.input);
      await expect(
        preflight('planned', {
          [value.input.entry.entry_id]: 'planned',
          [secondEntry.entry_id]: 'planned',
        })
      ).rejects.toThrow(/pre-existing|execution.*start/iu);

      await writeFile(secondSource, 'late resume drift');
      await expect(
        preflight('copying', {
          [value.input.entry.entry_id]: 'published',
          [secondEntry.entry_id]: 'planned',
        })
      ).rejects.toThrow(/size mismatch|hash mismatch/iu);
      await expect(readFile(secondTarget)).rejects.toMatchObject({ code: 'ENOENT' });

      await writeFile(secondSource, secondContent);
      await publishNoReplace({ ...value.input, entry: secondEntry });
      await expect(
        preflight('copying', {
          [value.input.entry.entry_id]: 'published',
          [secondEntry.entry_id]: 'planned',
        })
      ).resolves.toBeUndefined();
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it('reconciles only the exact run-and-entry-bound crash temporary', async () => {
    const exact = await fixture();
    const mismatched = await fixture();
    const temporaryName = (input: PublishInput): string =>
      `.source-recovery.${input.runId}.${input.entry.entry_id}.tmp`;
    try {
      const exactTemporary = join(exact.input.productionRoot, 'tenant', temporaryName(exact.input));
      await writeFile(exactTemporary, 'exact original bytes');
      await publishNoReplace(exact.input);
      expect((await readdir(join(exact.input.productionRoot, 'tenant'))).sort()).toEqual([
        'target.pdf',
      ]);

      await writeFile(exactTemporary, 'exact original bytes');
      await expect(
        reconcilePublishedTarget(exact.input, 'planned', { executionStarted: true })
      ).resolves.toBe('published');
      expect((await readdir(join(exact.input.productionRoot, 'tenant'))).sort()).toEqual([
        'target.pdf',
      ]);

      const mismatchedTemporary = join(
        mismatched.input.productionRoot,
        'tenant',
        temporaryName(mismatched.input)
      );
      await writeFile(mismatchedTemporary, 'wrong bytes');
      await expect(publishNoReplace(mismatched.input)).rejects.toThrow(/temporary.*mismatch/iu);
    } finally {
      await Promise.all(
        [exact.root, mismatched.root].map(root => rm(root, { recursive: true, force: true }))
      );
    }
  });

  it('reconciles planned and published journal states without overwriting', async () => {
    const { root, input, target } = await fixture();
    try {
      await expect(reconcilePublishedTarget(input, 'planned')).resolves.toBe('ready_to_publish');
      await publishNoReplace(input);
      await expect(reconcilePublishedTarget(input, 'planned')).rejects.toThrow(
        /execution.*start|pre-existing/iu
      );
      await expect(
        reconcilePublishedTarget(input, 'planned', { executionStarted: true })
      ).resolves.toBe('published');
      await expect(reconcilePublishedTarget(input, 'published')).resolves.toBe('published');

      await writeFile(target, 'mismatch');
      await expect(reconcilePublishedTarget(input, 'published')).rejects.toThrow(/mismatch/iu);
      await rm(target);
      await expect(reconcilePublishedTarget(input, 'published')).rejects.toThrow(/missing/iu);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('guards rollback by phase, journal state, and current target hash', async () => {
    const first = await fixture();
    const second = await fixture();
    try {
      await publishNoReplace(first.input);
      await expect(
        rollbackPublished({ ...first.input, phase: 'reindex_started', journalState: 'published' })
      ).rejects.toThrow(/reindex_started/iu);

      await writeFile(first.target, 'changed');
      await expect(
        rollbackPublished({ ...first.input, phase: 'copied', journalState: 'rollback_planned' })
      ).rejects.toThrow(/hash mismatch|size mismatch/iu);

      await publishNoReplace(second.input);
      await rm(second.source);
      await rollbackPublished({
        ...second.input,
        phase: 'copied',
        journalState: 'rollback_planned',
      });
      await expect(reconcileRollbackTarget(second.input, 'rollback_planned')).resolves.toBe(
        'rolled_back'
      );
    } finally {
      await Promise.all(
        [first.root, second.root].map(root => rm(root, { recursive: true, force: true }))
      );
    }
  });
});
