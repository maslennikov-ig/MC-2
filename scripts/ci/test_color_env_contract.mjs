#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  colorOverlayKeys,
  envAssignmentKeys,
  hostResolvedKeys,
  missingRequiredByEnvironment,
  requiredComposeVariables,
} from './check_color_env_contract.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checkerPath = resolve(rootDir, 'scripts/ci/check_color_env_contract.mjs');

assert.deepEqual(
  requiredComposeVariables([
    'image: ${API_IMAGE:?API image required}\nvolumes:\n  - ${DATA_DIR:?set it}:/data',
    'image: ${API_IMAGE:?same key elsewhere}\nname: ${OPTIONAL_NAME:-default}',
  ]),
  ['API_IMAGE', 'DATA_DIR'],
  'required Compose keys must be derived, deduplicated, and sorted'
);

assert.deepEqual(
  envAssignmentKeys(' # comment\n API_IMAGE=repo@sha256:abc\nexport DATA_DIR=/srv/data\nEMPTY=\n'),
  ['API_IMAGE', 'DATA_DIR', 'EMPTY'],
  'environment keys must be parsed without reading or validating their values'
);

assert.deepEqual(
  colorOverlayKeys(`
write_color_env() {
  printf 'COLOR=%s\\n' "$1"
  printf 'API_IMAGE=%s\\n' "$2"
}

require_immutable_ref() {
  :
}
`),
  ['API_IMAGE', 'COLOR'],
  'colour-specific keys must come from the real generator contract'
);

assert.deepEqual(
  hostResolvedKeys(`
     gid="$(stat -c %g "$dir")"
     if grep -q "^QDRANT_METRICS_GID=" "$file"; then
       sed -i "s/^QDRANT_METRICS_GID=.*/QDRANT_METRICS_GID=$gid/" "$file"
     else
       printf "QDRANT_METRICS_GID=%s\\n" "$gid" >> "$file"
     fi
`),
  ['QDRANT_METRICS_GID'],
  'a host-derived key must be credited to the step that appends it, not to the heredoc'
);

assert.throws(
  () => hostResolvedKeys('echo "QDRANT_METRICS_GID is mentioned but never written"'),
  /writes no environment keys/,
  'mentioning a key without appending it must not count as guaranteeing it'
);

assert.deepEqual(
  missingRequiredByEnvironment(
    ['API_IMAGE', 'QDRANT_METRICS_GID'],
    new Map([
      ['.env.blue', ['API_IMAGE', 'QDRANT_METRICS_GID']],
      ['.env.green', ['API_IMAGE']],
    ])
  ),
  new Map([['.env.green', ['QDRANT_METRICS_GID']]]),
  'a required key missing from only one colour must fail that colour'
);

const output = execFileSync(process.execPath, [checkerPath], {
  cwd: rootDir,
  encoding: 'utf8',
});
assert.match(
  output,
  /^color env contract passed: \d+ required variables guaranteed in \.env\.blue and \.env\.green\n$/,
  'the current repository producer and consumer contract must pass'
);

console.log('color env contract tests passed');
