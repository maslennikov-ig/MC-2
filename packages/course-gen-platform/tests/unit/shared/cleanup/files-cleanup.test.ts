/**
 * Contract: course cleanup deletes the files the upload wrote.
 *
 * The two sides must agree on where uploads live. When they disagreed, cleanup
 * reported success having deleted nothing, so a deleted course left its
 * documents on disk in every environment.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { deleteUploadedFiles, hasUploadedFiles } from '@/shared/cleanup/files-cleanup';
import {
  getUploadStorageRootPath,
  toUploadStoragePath,
} from '@/stages/stage1-document-upload/storage-paths';

const ORGANIZATION_ID = '9b98a7d5-27ea-4441-81dc-de79d488e5db';
const COURSE_ID = '08912e3b-4010-4719-89c8-e9c8e19d133e';

let baseDir: string;
let previousBasePath: string | undefined;

/** Writes a file exactly where Stage 1 upload storage puts it. */
async function writeUploadedFile(name: string, contents: string): Promise<string> {
  const absolute = path.join(getUploadStorageRootPath(), ORGANIZATION_ID, COURSE_ID, name);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, contents);
  return absolute;
}

describe('deleteUploadedFiles', () => {
  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mc2-uploads-'));
    previousBasePath = process.env.DOCLING_UPLOADS_BASE_PATH;
    process.env.DOCLING_UPLOADS_BASE_PATH = baseDir;
  });

  afterEach(async () => {
    if (previousBasePath === undefined) delete process.env.DOCLING_UPLOADS_BASE_PATH;
    else process.env.DOCLING_UPLOADS_BASE_PATH = previousBasePath;
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('deletes the files an upload stored for the course', async () => {
    const absolute = await writeUploadedFile('lecture.docx', 'x'.repeat(64));
    // The catalog keeps this relative path, so the two sides share one root.
    expect(toUploadStoragePath(absolute)).toBe(
      path.join('uploads', ORGANIZATION_ID, COURSE_ID, 'lecture.docx')
    );
    await expect(hasUploadedFiles(ORGANIZATION_ID, COURSE_ID)).resolves.toBe(true);

    const result = await deleteUploadedFiles(ORGANIZATION_ID, COURSE_ID);

    expect(result).toMatchObject({ success: true, filesDeleted: 1, bytesFreed: 64 });
    await expect(fs.access(absolute)).rejects.toThrow();
    await expect(hasUploadedFiles(ORGANIZATION_ID, COURSE_ID)).resolves.toBe(false);
  });

  it('leaves another course untouched', async () => {
    const mine = await writeUploadedFile('mine.docx', 'a');
    const otherCourse = path.join(
      getUploadStorageRootPath(),
      ORGANIZATION_ID,
      '11111111-1111-4111-8111-111111111111',
      'theirs.docx'
    );
    await fs.mkdir(path.dirname(otherCourse), { recursive: true });
    await fs.writeFile(otherCourse, 'b');

    await deleteUploadedFiles(ORGANIZATION_ID, COURSE_ID);

    await expect(fs.access(mine)).rejects.toThrow();
    await expect(fs.access(otherCourse)).resolves.toBeUndefined();
  });

  it('reports nothing deleted when the course stored no files', async () => {
    const result = await deleteUploadedFiles(ORGANIZATION_ID, COURSE_ID);

    expect(result).toMatchObject({ success: true, filesDeleted: 0, bytesFreed: 0 });
  });
});
