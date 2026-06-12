import path from 'path';

/**
 * Base directory for persisted upload storage paths.
 *
 * `file_catalog.storage_path` stays relative to this directory, usually
 * `uploads/<organization>/<owner>/<file>`. Keeping this in one helper prevents
 * web/API/worker processes from resolving the same row against different cwd
 * values when `DOCLING_UPLOADS_BASE_PATH` is configured.
 */
export function getUploadStorageBasePath(): string {
  return path.resolve(process.env.DOCLING_UPLOADS_BASE_PATH || process.cwd());
}

export function getUploadStorageRootPath(): string {
  return path.join(getUploadStorageBasePath(), 'uploads');
}

export function toUploadStoragePath(absolutePath: string): string {
  return path.relative(getUploadStorageBasePath(), absolutePath);
}

export function resolveUploadStoragePath(storagePath: string): string {
  if (path.isAbsolute(storagePath)) return path.normalize(storagePath);
  return path.resolve(getUploadStorageBasePath(), storagePath);
}

export function isPathInsideUploadStorageRoot(filePath: string): boolean {
  const uploadRoot = getUploadStorageRootPath();
  const absolutePath = path.resolve(filePath);
  return absolutePath !== uploadRoot && absolutePath.startsWith(`${uploadRoot}${path.sep}`);
}
