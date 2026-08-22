import { readFile } from 'node:fs/promises';
import path from 'node:path';

type ReadFileBytes = (path: string) => Promise<Buffer>;

export function createUploadStorageReader(uploadRoot: string, readFileBytes: ReadFileBytes = readFile) {
  const root = path.resolve(uploadRoot);
  return async (file: { id: string; storage_path: string }): Promise<Buffer> => {
    const candidate = path.resolve(root, file.storage_path);
    if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Source storage locator is outside the approved upload root (${file.id})`);
    }
    return readFileBytes(candidate);
  };
}
