/**
 * The Premium format contract: which extensions exist, what types they may be
 * declared as, and what the server does when the two disagree.
 *
 * Two properties are load-bearing here and neither is obvious from reading the
 * constants alone: Standard and Trial must NOT gain the new formats (FR-016),
 * and a file whose declared type contradicts its extension must be refused
 * rather than routed on the client's word (FR-017).
 */

import { describe, expect, it } from 'vitest';

import {
  FILE_EXTENSIONS_BY_TIER,
  MIME_TYPES_BY_EXTENSION,
  MIME_TYPES_BY_TIER,
  canonicalMimeTypeForExtension,
  fileExtensionOf,
  mimeTypeMatchesExtension,
} from '@megacampus/shared-types';
import {
  validateFile,
  validateFileExtension,
  type FileInput,
} from '@/shared/validation/file-validator';

const PREMIUM_ONLY_EXTENSIONS = ['xlsx', 'csv', 'odt', 'ods', 'odp', 'epub', 'tex'] as const;

function file(filename: string, mimeType: string): FileInput {
  return { filename, fileSize: 1024, mimeType };
}

describe('premium format contract', () => {
  it('exposes every new family on Premium and on no other tier', () => {
    for (const extension of PREMIUM_ONLY_EXTENSIONS) {
      expect(FILE_EXTENSIONS_BY_TIER.premium as readonly string[]).toContain(extension);
      for (const tier of ['trial', 'standard', 'basic', 'free'] as const) {
        expect(FILE_EXTENSIONS_BY_TIER[tier] as readonly string[]).not.toContain(extension);
      }
    }
  });

  it('keeps the Standard and Trial contracts byte-identical to each other and unchanged', () => {
    // Named explicitly rather than compared to a snapshot: this is the list a
    // format change must not touch, so it should be visible in the diff.
    const unchanged = ['pdf', 'docx', 'pptx', 'html', 'txt', 'md'];
    expect([...FILE_EXTENSIONS_BY_TIER.standard]).toEqual(unchanged);
    expect([...FILE_EXTENSIONS_BY_TIER.trial]).toEqual(unchanged);
    expect([...MIME_TYPES_BY_TIER.standard]).toEqual([...MIME_TYPES_BY_TIER.trial]);
  });

  it('maps every accepted extension to at least one MIME type, canonical first', () => {
    for (const extension of FILE_EXTENSIONS_BY_TIER.premium as readonly string[]) {
      const types = MIME_TYPES_BY_EXTENSION[extension];
      expect(types, `no MIME mapping for .${extension}`).toBeDefined();
      expect(types!.length).toBeGreaterThan(0);
      // The canonical type is what gets stored, so it must be a type the tier
      // itself accepts, or the file would be rejected after being written.
      expect(MIME_TYPES_BY_TIER.premium as readonly string[]).toContain(
        canonicalMimeTypeForExtension(extension)
      );
    }
  });

  it('keeps accepting the spellings that worked before the gate existed', () => {
    // `notes.markdown` uploaded and processed fine when the server checked only
    // the declared MIME type. The tier list spells the format `md`, so without
    // an alias the new extension gate would have refused a file the platform
    // had always accepted.
    expect(fileExtensionOf('notes.markdown')).toBe('md');
    expect(fileExtensionOf('page.htm')).toBe('html');
    expect(fileExtensionOf('page.XHTML')).toBe('html');
    expect(fileExtensionOf('photo.jfif')).toBe('jpeg');

    for (const [filename, mimeType] of [
      ['notes.markdown', 'text/markdown'],
      ['notes.markdown', 'text/plain'],
      ['page.htm', 'text/html'],
      ['photo.jfif', 'image/jpeg'],
    ] as const) {
      const result = validateFileExtension(filename, mimeType, 'premium');
      expect(result.valid, `${filename} as ${mimeType} was rejected: ${result.error}`).toBe(true);
    }
  });

  it('does not let an alias smuggle in a format no tier accepts', () => {
    // Aliases resolve to an extension the tier ALREADY lists; they never add one.
    expect(validateFileExtension('archive.tgz', 'application/pdf', 'premium').valid).toBe(false);
    expect(validateFileExtension('page.htm', 'text/html', 'standard').valid).toBe(true);
    expect(
      validateFileExtension(
        'sheet.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'standard'
      ).valid
    ).toBe(false);
  });

  it('reads an extension only when there is one to read', () => {
    expect(fileExtensionOf('report.PDF')).toBe('pdf');
    expect(fileExtensionOf('archive.tar.gz')).toBe('gz');
    expect(fileExtensionOf('/tmp/uploads/книга.epub')).toBe('epub');
    expect(fileExtensionOf('.gitignore')).toBeNull();
    expect(fileExtensionOf('Makefile')).toBeNull();
    expect(fileExtensionOf('trailing.')).toBeNull();
  });

  it('accepts the types browsers really send for text-ish formats', () => {
    // Chrome reports text/plain for .md and .tex; a Windows host with Excel
    // installed reports application/vnd.ms-excel for .csv.
    expect(mimeTypeMatchesExtension('md', 'text/plain')).toBe(true);
    expect(mimeTypeMatchesExtension('tex', 'text/plain')).toBe(true);
    expect(mimeTypeMatchesExtension('csv', 'application/vnd.ms-excel')).toBe(true);
    expect(mimeTypeMatchesExtension('csv', 'TEXT/CSV')).toBe(true);
  });

  it('refuses a type that belongs to a different format', () => {
    expect(mimeTypeMatchesExtension('pdf', 'text/plain')).toBe(false);
    expect(mimeTypeMatchesExtension('txt', 'application/pdf')).toBe(false);
    expect(mimeTypeMatchesExtension('xlsx', 'application/vnd.ms-excel')).toBe(false);
    expect(mimeTypeMatchesExtension('exe', 'application/pdf')).toBe(false);
  });
});

describe('validateFileExtension', () => {
  it('accepts each new family on Premium', () => {
    for (const extension of PREMIUM_ONLY_EXTENSIONS) {
      const mimeType = canonicalMimeTypeForExtension(extension)!;
      const result = validateFileExtension(`fixture.${extension}`, mimeType, 'premium');
      expect(result.valid, `${extension} was rejected: ${result.error}`).toBe(true);
    }
  });

  it('rejects a spoofed type and says so without blaming the tier', () => {
    const result = validateFileExtension('payload.pdf', 'text/plain', 'premium');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not match extension');
    expect(result.suggestedTier).toBeUndefined();
  });

  it('rejects a renamed executable even when the declared type is plausible', () => {
    const result = validateFileExtension('setup.exe', 'application/pdf', 'premium');
    expect(result.valid).toBe(false);
    expect(result.error).toContain("'.exe' not allowed");
  });

  it('rejects a file with no extension at all', () => {
    const result = validateFileExtension('Makefile', 'text/plain', 'premium');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('no extension');
  });

  it('points Standard at Premium for a new family instead of calling it unsupported', () => {
    const result = validateFileExtension(
      'budget.xlsx',
      canonicalMimeTypeForExtension('xlsx')!,
      'standard'
    );
    expect(result.valid).toBe(false);
    expect(result.suggestedTier).toBe('premium');
  });

  it('gives a superadmin on a low tier the Premium format set', () => {
    const result = validateFileExtension(
      'book.epub',
      canonicalMimeTypeForExtension('epub')!,
      'basic',
      'superadmin'
    );
    expect(result.valid).toBe(true);
  });
});

describe('validateFile with the extension gate', () => {
  it('returns the canonical type, not the one the client declared', () => {
    const result = validateFile(file('paper.tex', 'application/x-tex'), 'premium', 0);
    expect(result.valid).toBe(true);
    expect(result.canonicalMimeType).toBe('text/x-tex');
  });

  it('canonicalises a CSV a browser announced as plain text', () => {
    // This is the case that decides routing: stored as text/plain the file
    // would go to the plain-text extractor and never reach Docling.
    const result = validateFile(file('regions.csv', 'text/plain'), 'premium', 0);
    expect(result.valid).toBe(true);
    expect(result.canonicalMimeType).toBe('text/csv');
  });

  it('leaves the existing formats on the types they already had', () => {
    for (const [filename, declared, canonical] of [
      ['a.pdf', 'application/pdf', 'application/pdf'],
      ['b.txt', 'text/plain', 'text/plain'],
      ['c.md', 'text/plain', 'text/markdown'],
      ['d.png', 'image/png', 'image/png'],
    ] as const) {
      const result = validateFile(file(filename, declared), 'premium', 0);
      expect(result.valid, `${filename} was rejected`).toBe(true);
      expect(result.canonicalMimeType).toBe(canonical);
    }
  });

  it('fails the whole validation, not just one check, on a spoof', () => {
    const result = validateFile(file('invoice.pdf', 'text/csv'), 'premium', 0);
    expect(result.valid).toBe(false);
    expect(result.checks.extension.valid).toBe(false);
    expect(result.canonicalMimeType).toBeUndefined();
  });

  it('reports the file-count limit ahead of a format problem', () => {
    // Both are wrong; the user can only act on one of them, and re-picking a
    // file they have no room for is the worse instruction.
    const result = validateFile(file('extra.pdf', 'text/plain'), 'premium', 10);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('File count limit');
  });
});
