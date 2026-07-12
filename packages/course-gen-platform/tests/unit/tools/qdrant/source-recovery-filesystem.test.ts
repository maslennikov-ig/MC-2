import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inspectRecoveryTarget,
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
      developmentRoot,
      productionRoot,
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
    } finally {
      await Promise.all(
        [traversal.root, linked.root, changed.root].map(root =>
          rm(root, { recursive: true, force: true })
        )
      );
    }
  });

  it('reconciles planned and published journal states without overwriting', async () => {
    const { root, input, target } = await fixture();
    try {
      await expect(reconcilePublishedTarget(input, 'planned')).resolves.toBe('ready_to_publish');
      await publishNoReplace(input);
      await expect(reconcilePublishedTarget(input, 'planned')).resolves.toBe('published');
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
