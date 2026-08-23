import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * One Docling image version lives in four kinds of file: the Dockerfile that
 * declares it, the build workflow matrix that publishes it, and two compose
 * files that run it. On 2026-08-23 a bump reached three of them and missed the
 * workflow and the root compose, which would have published an image with
 * docling-mcp 3.1.0 inside under the tag `3.0.0`. Nothing failed, because
 * nothing compared them.
 *
 * This test is that comparison. The Dockerfile LABEL is the single source of
 * truth; every other mention has to agree with it.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const DOCKER_DIR = resolve(REPO_ROOT, 'packages/course-gen-platform/docker');
const BUILD_WORKFLOW = resolve(REPO_ROOT, '.github/workflows/build-docling-images.yml');

/** Image names whose tags are governed by a Dockerfile LABEL in `docker/<name>/`. */
const GOVERNED_IMAGES = ['docling-serve', 'docling-serve-advanced', 'docling-mcp'] as const;

function readDockerfileVersion(imageName: string): string {
  const dockerfile = join(DOCKER_DIR, imageName, 'Dockerfile');
  expect(existsSync(dockerfile), `${dockerfile} is missing`).toBe(true);
  const source = readFileSync(dockerfile, 'utf8');
  const match = source.match(/^LABEL\s+org\.opencontainers\.image\.version="([^"]+)"/m);
  expect(match, `${imageName}/Dockerfile declares no org.opencontainers.image.version`).not.toBe(
    null
  );
  return match![1];
}

function trackedYamlFiles(): string[] {
  const listed = spawnSync('git', ['ls-files', '-z', '*.yml', '*.yaml'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  expect(listed.status, listed.stderr).toBe(0);
  return listed.stdout.split('\0').filter(Boolean);
}

/** Every `image: mc2/<name>:<tag>` mention across tracked YAML, with its origin. */
function composeImageReferences(): Array<{
  file: string;
  line: number;
  name: string;
  tag: string;
}> {
  const references: Array<{ file: string; line: number; name: string; tag: string }> = [];
  for (const relative of trackedYamlFiles()) {
    const lines = readFileSync(resolve(REPO_ROOT, relative), 'utf8').split('\n');
    lines.forEach((text, index) => {
      const match = text.match(/^\s*image:\s*mc2\/([\w.-]+):(\S+)\s*$/);
      if (match) {
        references.push({ file: relative, line: index + 1, name: match[1], tag: match[2] });
      }
    });
  }
  return references;
}

/** The build matrix, read as `dockerfile path -> published version`. */
function workflowMatrixVersions(): Map<string, string> {
  const source = readFileSync(BUILD_WORKFLOW, 'utf8');
  const versions = new Map<string, string>();
  const entries = source.matchAll(/dockerfile:\s*(\S+)[\s\S]*?\n\s+version:\s*(\S+)/g);
  for (const entry of entries) {
    versions.set(entry[1], entry[2]);
  }
  return versions;
}

describe('Docling image version consistency', () => {
  const declared = new Map(GOVERNED_IMAGES.map(name => [name, readDockerfileVersion(name)]));

  it('derives the advanced profile tag from the baseline Serve tag', () => {
    expect(declared.get('docling-serve-advanced')).toBe(
      `${declared.get('docling-serve')}-advanced`
    );
  });

  it('builds the advanced profile FROM the Serve image its own tag names', () => {
    const source = readFileSync(join(DOCKER_DIR, 'docling-serve-advanced/Dockerfile'), 'utf8');
    const base = source.match(/^ARG BASE_IMAGE=mc2\/docling-serve:(\S+)$/m);
    expect(
      base,
      'docling-serve-advanced/Dockerfile declares no mc2/docling-serve BASE_IMAGE'
    ).not.toBe(null);
    expect(base![1]).toBe(declared.get('docling-serve'));
  });

  it('tags every compose reference with the version its Dockerfile declares', () => {
    const references = composeImageReferences();
    expect(
      references.length,
      'no mc2/* image references found — the scan is broken'
    ).toBeGreaterThan(0);

    const mismatched = references
      .filter(reference => declared.has(reference.name))
      .filter(reference => reference.tag !== declared.get(reference.name))
      .map(
        reference =>
          `${reference.file}:${reference.line} uses mc2/${reference.name}:${reference.tag}, Dockerfile declares ${declared.get(reference.name)}`
      );
    expect(mismatched).toEqual([]);

    const ungoverned = references
      .filter(reference => !declared.has(reference.name))
      .map(reference => `${reference.file}:${reference.line} -> mc2/${reference.name}`);
    expect(ungoverned, 'an mc2/* image with no Dockerfile LABEL to check it against').toEqual([]);
  });

  it('publishes each image under the version its Dockerfile declares', () => {
    const matrix = workflowMatrixVersions();
    expect(
      matrix.size,
      'build-docling-images.yml exposes no dockerfile/version pairs'
    ).toBeGreaterThan(0);

    const mismatched: string[] = [];
    for (const [dockerfile, version] of matrix) {
      const name = dockerfile.match(/docker\/([\w.-]+)\/Dockerfile$/)?.[1];
      expect(name, `unrecognised dockerfile path in the build matrix: ${dockerfile}`).toBeDefined();
      const expected = declared.get(name as (typeof GOVERNED_IMAGES)[number]);
      expect(expected, `${dockerfile} is published but carries no governed LABEL`).toBeDefined();
      if (version !== expected) {
        mismatched.push(
          `build-docling-images.yml publishes ${dockerfile} as ${version}, Dockerfile declares ${expected}`
        );
      }
    }
    expect(mismatched).toEqual([]);
  });
});
