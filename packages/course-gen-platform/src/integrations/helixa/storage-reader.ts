import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeSyncPreparationError } from './errors';

export function createUploadStorageReader(uploadRoot: string) {
  return async (file: { id: string; storage_path: string }): Promise<Buffer> => {
    const root = await realpath(path.resolve(uploadRoot));
    const candidate = path.resolve(root, file.storage_path);
    if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) {
      throw new KnowledgeSyncPreparationError('provenance', false);
    }
    let handle;
    try {
      handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
      const [openedPath, stat] = await Promise.all([realpath(`/proc/self/fd/${handle.fd}`), handle.stat()]);
      if (!stat.isFile() || !openedPath.startsWith(`${root}${path.sep}`)) {
        throw new KnowledgeSyncPreparationError('provenance', false);
      }
      return await handle.readFile();
    } catch (error) {
      if (error instanceof KnowledgeSyncPreparationError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ELOOP') throw new KnowledgeSyncPreparationError('provenance', false);
      throw new KnowledgeSyncPreparationError('storage', true);
    } finally {
      await handle?.close();
    }
  };
}
