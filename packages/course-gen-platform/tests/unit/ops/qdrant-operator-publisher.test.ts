import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const PUBLISHER = resolve(REPO_ROOT, 'deploy/qdrant/publish-qdrant-operator.sh');
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const CONFIRMATION = `PUBLISH qdrant-operator ${COMMIT}`;
const REPOSITORY = 'ghcr.io/maslennikov-ig/mc-2/qdrant-operator';
const SOURCE_REPOSITORY = 'https://github.com/maslennikov-ig/MC-2.git';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const OTHER_DIGEST = `sha256:${'b'.repeat(64)}`;
const TOKEN = 'ghp_q12SyntheticTokenNeverPersisted_123456789';
const BUILDKIT_METADATA_KEY = 'https://mobyproject.org/buildkit@v1#metadata';
const BUILDKIT_V1_BUILD_TYPE =
  'https://github.com/moby/buildkit/blob/master/docs/attestations/slsa-definitions.md';
const roots: string[] = [];

function provenance(
  revision = COMMIT,
  source = SOURCE_REPOSITORY,
  includeMaxEvidence = true
): Record<string, unknown> {
  return {
    buildType: 'https://mobyproject.org/buildkit@v1',
    metadata: {
      [BUILDKIT_METADATA_KEY]: {
        vcs: { revision, source },
        ...(includeMaxEvidence
          ? {
              source: {
                infos: [
                  {
                    filename: 'packages/course-gen-platform/Dockerfile',
                    data: 'FROM runner AS qdrant-operator',
                  },
                ],
              },
            }
          : {}),
      },
    },
  };
}

function provenanceV1(
  revision = COMMIT,
  source = SOURCE_REPOSITORY,
  includeMaxEvidence = true
): Record<string, unknown> {
  return {
    buildDefinition: {
      buildType: BUILDKIT_V1_BUILD_TYPE,
      externalParameters: { request: { frontend: 'dockerfile.v0' } },
    },
    runDetails: {
      builder: { id: '' },
      metadata: {
        buildkit_metadata: {
          vcs: { revision, source },
          ...(includeMaxEvidence
            ? {
                source: {
                  infos: [
                    {
                      filename: 'packages/course-gen-platform/Dockerfile',
                      data: 'FROM runner AS qdrant-operator',
                    },
                  ],
                },
              }
            : {}),
        },
        buildkit_completeness: { request: true, resolvedDependencies: false },
      },
    },
  };
}

function buildMetadata(buildProvenance: unknown = provenance(), digest = DIGEST): string {
  return JSON.stringify({
    'containerimage.digest': digest,
    'buildx.build.provenance': buildProvenance,
  });
}

interface Fixture {
  root: string;
  bin: string;
  home: string;
  runTemp: string;
  commandLog: string;
  gitMode: string;
  dockerMode: string;
  utilityMode: string;
  statePath: string;
  env: NodeJS.ProcessEnv;
}

function executable(path: string, contents: string): void {
  writeFileSync(path, contents, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function fixture(): Fixture {
  const root = mkdtempSync('/tmp/mc2-qdrant-publisher-test-');
  roots.push(root);
  chmodSync(root, 0o700);
  const bin = join(root, 'bin');
  const home = join(root, 'home');
  const runTemp = join(root, 'run-temp');
  for (const directory of [bin, home, runTemp]) {
    mkdirSync(directory, { mode: 0o700 });
    chmodSync(directory, 0o700);
  }

  const commandLog = join(root, 'commands.log');
  const gitMode = join(root, 'git-mode');
  const dockerMode = join(root, 'docker-mode');
  const utilityMode = join(root, 'utility-mode');
  const statePath = join(root, 'state-path');
  writeFileSync(gitMode, 'success\n', { mode: 0o600 });
  writeFileSync(dockerMode, 'success\n', { mode: 0o600 });
  writeFileSync(utilityMode, 'success\n', { mode: 0o600 });

  const utilityPaths: Record<string, string> = {
    chmod: '/usr/bin/chmod',
    env: '/usr/bin/env',
    mkdir: '/usr/bin/mkdir',
    mktemp: '/usr/bin/mktemp',
    python3: '/usr/bin/python3',
    rm: '/usr/bin/rm',
    stat: '/usr/bin/stat',
  };
  for (const [name, realPath] of Object.entries(utilityPaths)) {
    let specialBehavior = '';
    if (name === 'mktemp') {
      specialBehavior = `if [[ "$(<${shellQuote(utilityMode)})" == signal-mktemp ]]; then
  state_path="$(${shellQuote(realPath)} "$@")"
  printf '%s\\n' "$state_path" > ${shellQuote(statePath)}
  /usr/bin/kill -TERM "$PPID"
  /usr/bin/sleep 0.05
  exit 143
fi`;
    } else if (name === 'mkdir') {
      specialBehavior = `if [[ "$(<${shellQuote(utilityMode)})" == signal-mkdir && "\${!#}" == */mc2-qdrant-publisher.* ]]; then
  ${shellQuote(realPath)} "$@"
  printf '%s\\n' "\${!#}" > ${shellQuote(statePath)}
  /usr/bin/kill -TERM "$PPID"
  /usr/bin/sleep 0.05
  exit 0
fi`;
    } else if (name === 'rm') {
      specialBehavior = `if [[ "$(<${shellQuote(utilityMode)})" == signal-cleanup-rm && "\${!#}" == */mc2-qdrant-publisher.* ]]; then
  parent="$PPID"
  /usr/bin/kill -TERM "$parent"
  /usr/bin/sleep 0.05
  /usr/bin/kill -0 "$parent" 2>/dev/null || exit 143
  exec ${shellQuote(realPath)} "$@"
fi`;
    }
    executable(
      join(bin, name),
      `#!/usr/bin/bash
set -eu
printf 'external\\t${name}' >> ${shellQuote(commandLog)}
printf '\\t%q' "$@" >> ${shellQuote(commandLog)}
printf '\\n' >> ${shellQuote(commandLog)}
[[ "$(<${shellQuote(utilityMode)})" != ${shellQuote(`fail-${name}`)} ]] || exit 73
${specialBehavior}
exec ${shellQuote(realPath)} "$@"
`
    );
  }

  executable(
    join(bin, 'git'),
    `#!/usr/bin/bash
set -eu
printf 'git' >> ${shellQuote(commandLog)}
printf '\\t%q' "$@" >> ${shellQuote(commandLog)}
printf '\\n' >> ${shellQuote(commandLog)}
mode="$(<${shellQuote(gitMode)})"
if [[ "$*" == 'rev-parse --show-toplevel' ]]; then
  printf '%s\\n' ${shellQuote(REPO_ROOT)}
elif [[ "\${1:-}" == cat-file && "\${2:-}" == -e ]]; then
  [[ "$mode" != unreachable ]]
elif [[ "\${1:-}" == remote && "\${2:-}" == get-url && "\${3:-}" == origin ]]; then
  printf '%s\\n' 'https://github.com/maslennikov-ig/MC-2.git'
elif [[ "\${1:-}" == fetch && "\${5:-}" == origin ]]; then
  :
elif [[ "\${1:-}" == for-each-ref ]]; then
  [[ "$mode" == unpushed ]] || printf '%s\\n' 'refs/remotes/origin/codex/accepted'
elif [[ "\${1:-}" == worktree && "\${2:-}" == add ]]; then
  worktree="\${4:?missing worktree path}"
  /usr/bin/mkdir -p "$worktree/packages/course-gen-platform"
  printf '%s\\n' 'gitdir: synthetic' > "$worktree/.git"
  printf '%s\\n' 'FROM runner AS qdrant-operator' > "$worktree/packages/course-gen-platform/Dockerfile"
elif [[ "\${1:-}" == -C && "\${3:-}" == rev-parse && "\${4:-}" == HEAD ]]; then
  printf '%s\\n' ${shellQuote(COMMIT)}
elif [[ "\${1:-}" == -C && "\${3:-}" == status ]]; then
  [[ "$mode" == dirty ]] && printf '%s\\n' '?? synthetic-residue' || true
elif [[ "\${1:-}" == worktree && "\${2:-}" == remove ]]; then
  if [[ "$mode" == signal-cleanup-worktree ]]; then
    parent="$PPID"
    /usr/bin/kill -TERM "$parent"
    /usr/bin/sleep 0.05
    /usr/bin/kill -0 "$parent" 2>/dev/null || exit 143
  fi
  [[ "$mode" != worktree-remove-failure ]] || exit 72
  /usr/bin/rm -rf -- "\${4:?missing worktree path}"
else
  printf '%s\\n' 'unexpected synthetic git command' >&2
  exit 97
fi
`
  );

  executable(
    join(bin, 'docker'),
    `#!/usr/bin/bash
set -eu
printf 'docker\\tdocker_config=%s\\thome=%s\\tinherited=%s' "\${DOCKER_CONFIG:-}" "\${HOME:-}" "\${UNRELATED_SECRET:-}" >> ${shellQuote(commandLog)}
printf '\\t%q' "$@" >> ${shellQuote(commandLog)}
printf '\\n' >> ${shellQuote(commandLog)}
mode="$(<${shellQuote(dockerMode)})"
build_state="\${DOCKER_CONFIG%/docker-config}/synthetic-built"
case "\${1:-} \${2:-}" in
  'login ghcr.io')
    [[ "\${3:-}" == --username ]]
    [[ -n "\${4:-}" ]]
    [[ "\${5:-}" == --password-stdin ]]
    [[ "$#" -eq 5 ]]
    IFS= read -r token || true
    [[ -n "\${token:-}" ]] || exit 41
    printf 'docker-check\\tconfig-dir-mode=%s\\tconfig-file-mode=%s\\tstdin-bytes=%s\\n' \
      "$(/usr/bin/stat -c %a "$DOCKER_CONFIG")" \
      "$(/usr/bin/stat -c %a "$DOCKER_CONFIG/config.json")" \
      "\${#token}" >> ${shellQuote(commandLog)}
    if [[ "$mode" == helper-injection ]]; then
      printf '%s\\n' '{"credsStore":"pass","auths":{}}' > "$DOCKER_CONFIG/config.json"
    else
      printf '%s\\n' '{"auths":{"ghcr.io":{"auth":"synthetic-redacted"}}}' > "$DOCKER_CONFIG/config.json"
    fi
    /usr/bin/chmod 0600 "$DOCKER_CONFIG/config.json"
    ;;
  'buildx build')
    [[ "$mode" != build-failure ]] || exit 42
    if [[ "$mode" == signal ]]; then
      /usr/bin/kill -TERM "$PPID"
      /usr/bin/sleep 0.05
      exit 143
    fi
    metadata=''
    previous=''
    for argument in "$@"; do
      if [[ "$previous" == --metadata-file ]]; then metadata="$argument"; fi
      case "$argument" in --metadata-file=*) metadata="\${argument#--metadata-file=}" ;; esac
      previous="$argument"
    done
    [[ -n "$metadata" ]] || exit 43
    case "$mode" in
      malformed-metadata) printf '%s\\n' '{' > "$metadata" ;;
      null-provenance) printf '%s\\n' ${shellQuote(buildMetadata(null))} > "$metadata" ;;
      wrong-revision) printf '%s\\n' ${shellQuote(buildMetadata(provenance('f'.repeat(40))))} > "$metadata" ;;
      wrong-source) printf '%s\\n' ${shellQuote(buildMetadata(provenance(COMMIT, 'https://github.com/example/wrong.git')))} > "$metadata" ;;
      missing-max) printf '%s\\n' ${shellQuote(buildMetadata(provenance(COMMIT, SOURCE_REPOSITORY, false)))} > "$metadata" ;;
      slsa-v1|v1-wrong-remote-*|v1-missing-remote-max) printf '%s\\n' ${shellQuote(buildMetadata(provenanceV1()))} > "$metadata" ;;
      v1-wrong-revision) printf '%s\\n' ${shellQuote(buildMetadata(provenanceV1('f'.repeat(40))))} > "$metadata" ;;
      v1-wrong-source) printf '%s\\n' ${shellQuote(buildMetadata(provenanceV1(COMMIT, 'https://github.com/example/wrong.git')))} > "$metadata" ;;
      v1-missing-max) printf '%s\\n' ${shellQuote(buildMetadata(provenanceV1(COMMIT, SOURCE_REPOSITORY, false)))} > "$metadata" ;;
      *) printf '%s\\n' ${shellQuote(buildMetadata())} > "$metadata" ;;
    esac
    if [[ "$mode" == slsa-v1* || "$mode" == v1-* ]]; then
      /usr/bin/chmod 0644 "$metadata"
    else
      /usr/bin/chmod 0600 "$metadata"
    fi
    : > "$build_state"
    ;;
  'buildx imagetools')
    [[ "\${3:-}" == inspect ]]
    [[ "\${5:-}" == --format ]]
    reference="\${4:?missing reference}"
    format="\${6:?missing format}"
    if [[ "$format" == '{{ json .Manifest.Digest }}' ]]; then
      if [[ ! -e "$build_state" ]]; then
        case "$mode" in
          tag-exists) printf '"%s"\\n' ${shellQuote(DIGEST)} ;;
          preflight-auth) printf 'ERROR: denied: denied to package\\n' >&2; exit 44 ;;
          preflight-network) printf 'ERROR: failed to do request: network unavailable\\n' >&2; exit 44 ;;
          preflight-ambiguous) printf 'ERROR: unexpected registry response\\n' >&2; exit 44 ;;
          preflight-not-found) printf 'ERROR: %s: not found\\n' "$reference" >&2; exit 44 ;;
          *) printf 'ERROR: %s: manifest unknown\\n' "$reference" >&2; exit 44 ;;
        esac
      elif [[ "$mode" == digest-mismatch ]]; then
        printf '"%s"\\n' ${shellQuote(OTHER_DIGEST)}
      else
        printf '"%s"\\n' ${shellQuote(DIGEST)}
      fi
    elif [[ "$format" == '{{ json .Provenance.SLSA }}' ]]; then
      [[ -e "$build_state" ]] || exit 45
      case "$mode" in
        malformed-remote-provenance) printf '%s\\n' '{' ;;
        null-remote-provenance) printf '%s\\n' 'null' ;;
        wrong-remote-revision) printf '%s\\n' ${shellQuote(JSON.stringify(provenance('e'.repeat(40))))} ;;
        wrong-remote-source) printf '%s\\n' ${shellQuote(JSON.stringify(provenance(COMMIT, 'https://github.com/example/wrong.git')))} ;;
        missing-remote-max) printf '%s\\n' ${shellQuote(JSON.stringify(provenance(COMMIT, SOURCE_REPOSITORY, false)))} ;;
        slsa-v1|v1-wrong-revision|v1-wrong-source|v1-missing-max) printf '%s\\n' ${shellQuote(JSON.stringify(provenanceV1()))} ;;
        v1-wrong-remote-revision) printf '%s\\n' ${shellQuote(JSON.stringify(provenanceV1('e'.repeat(40))))} ;;
        v1-wrong-remote-source) printf '%s\\n' ${shellQuote(JSON.stringify(provenanceV1(COMMIT, 'https://github.com/example/wrong.git')))} ;;
        v1-missing-remote-max) printf '%s\\n' ${shellQuote(JSON.stringify(provenanceV1(COMMIT, SOURCE_REPOSITORY, false)))} ;;
        *) printf '%s\\n' ${shellQuote(JSON.stringify(provenance()))} ;;
      esac
    else
      printf '%s\\n' 'unexpected synthetic inspect format' >&2
      exit 46
    fi
    ;;
  'logout ghcr.io')
    cleanup_signal=''
    case "$mode" in
      signal-cleanup-logout-hup) cleanup_signal=HUP ;;
      signal-cleanup-logout-int) cleanup_signal=INT ;;
      signal-cleanup-logout|signal-cleanup-logout-failure) cleanup_signal=TERM ;;
    esac
    if [[ -n "$cleanup_signal" ]]; then
      parent="$PPID"
      /usr/bin/kill -"$cleanup_signal" "$parent"
      /usr/bin/sleep 0.05
      /usr/bin/kill -0 "$parent" 2>/dev/null || exit 143
    fi
    [[ "$mode" != logout-failure && "$mode" != signal-cleanup-logout-failure ]] || exit 71
    printf '%s\\n' '{"auths":{}}' > "$DOCKER_CONFIG/config.json"
    /usr/bin/chmod 0600 "$DOCKER_CONFIG/config.json"
    ;;
  *)
    printf '%s\\n' 'unexpected synthetic docker command' >&2
    exit 98
    ;;
esac
`
  );

  return {
    root,
    bin,
    home,
    runTemp,
    commandLog,
    gitMode,
    dockerMode,
    utilityMode,
    statePath,
    env: {
      PATH: bin,
      HOME: home,
      TMPDIR: runTemp,
      LC_ALL: 'C',
      UNRELATED_SECRET: 'must-not-reach-docker',
    },
  };
}

function args(commit = COMMIT, confirmation = CONFIRMATION, username = 'maslennikov-ig'): string[] {
  return [PUBLISHER, '--commit', commit, '--github-user', username, '--confirm', confirmation];
}

function run(
  item: Fixture,
  options: {
    commit?: string;
    confirmation?: string;
    username?: string;
    input?: string;
    env?: NodeJS.ProcessEnv;
    trace?: boolean;
  } = {}
): ReturnType<typeof spawnSync> {
  return spawnSync(
    '/usr/bin/bash',
    [
      ...(options.trace === true ? ['-x'] : []),
      ...args(options.commit, options.confirmation, options.username),
    ],
    {
      env: { ...item.env, ...options.env },
      input: options.input ?? `${TOKEN}\n`,
      encoding: 'utf8',
    }
  );
}

function commands(item: Fixture): string {
  return existsSync(item.commandLog) ? readFileSync(item.commandLog, 'utf8') : '';
}

function treeText(path: string): string {
  if (!existsSync(path)) return '';
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return '';
  if (stat.isFile()) return readFileSync(path, 'utf8');
  if (!stat.isDirectory()) return '';
  return readdirSync(path)
    .map(name => treeText(join(path, name)))
    .join('\n');
}

function expectNoSecret(item: Fixture, result: ReturnType<typeof spawnSync>, secret: string): void {
  const captured = `${result.stdout}${result.stderr}${commands(item)}${treeText(item.root)}`;
  expect(captured).not.toContain(secret);
}

function expectNoToken(item: Fixture, result: ReturnType<typeof spawnSync>): void {
  expectNoSecret(item, result, TOKEN);
}

function expectNoRunResidue(item: Fixture): void {
  expect(readdirSync(item.runTemp)).toEqual([]);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Q12 build-only qdrant-operator publisher', () => {
  it('fails closed for malformed, unreachable, unpushed, and dirty commits', () => {
    const malformed = fixture();
    const malformedResult = run(malformed, {
      commit: 'short-sha',
      confirmation: 'PUBLISH qdrant-operator short-sha',
    });
    expect(malformedResult.status).not.toBe(0);
    expect(malformedResult.stderr).toContain('commit must be exactly 40 lowercase hexadecimal');
    expect(commands(malformed)).not.toContain('docker\t');

    for (const mode of ['unreachable', 'unpushed', 'dirty']) {
      const item = fixture();
      writeFileSync(item.gitMode, `${mode}\n`, { mode: 0o600 });
      const result = run(item);
      expect(result.status).not.toBe(0);
      if (mode === 'dirty') {
        expect(commands(item)).not.toContain('\tlogin\tghcr.io');
        expect(commands(item)).not.toContain('\tbuildx\tbuild\t');
        expect(commands(item)).toContain('\tlogout\tghcr.io');
      } else {
        expect(commands(item)).not.toContain('docker\t');
      }
      expectNoRunResidue(item);
      expectNoToken(item, result);
    }
  });

  it('rejects incorrect confirmation and invalid GitHub usernames before reading credentials', () => {
    const confirmation = fixture();
    const confirmationResult = run(confirmation, {
      confirmation: `PUBLISH qdrant-operator ${'f'.repeat(40)}`,
    });
    expect(confirmationResult.status).not.toBe(0);
    expect(confirmationResult.stderr).toContain('confirmation must exactly equal');
    expect(commands(confirmation)).toBe('');

    const username = fixture();
    const usernameResult = run(username, { username: 'invalid/user' });
    expect(usernameResult.status).not.toBe(0);
    expect(usernameResult.stderr).toContain('GitHub username is invalid');
    expect(commands(username)).toBe('');
  });

  it('requires the token on stdin and refuses inherited Docker authentication', () => {
    const missing = fixture();
    const missingResult = run(missing, { input: '' });
    expect(missingResult.status).not.toBe(0);
    expect(missingResult.stderr).toContain('registry token must be supplied on stdin');
    expect(commands(missing)).not.toContain('docker\t');

    const configured = fixture();
    const configuredResult = run(configured, {
      env: { DOCKER_CONFIG: join(configured.root, 'inherited-docker') },
    });
    expect(configuredResult.status).not.toBe(0);
    expect(configuredResult.stderr).toContain('inherited Docker authentication is forbidden');
    expect(commands(configured)).not.toContain('docker\t');

    const dirtyHome = fixture();
    const inheritedConfig = join(dirtyHome.home, '.docker');
    mkdirSync(inheritedConfig, { mode: 0o700 });
    writeFileSync(
      join(inheritedConfig, 'config.json'),
      '{"auths":{"ghcr.io":{"auth":"redacted"}},"credsStore":"pass"}\n',
      { mode: 0o600 }
    );
    const dirtyResult = run(dirtyHome);
    expect(dirtyResult.status).not.toBe(0);
    expect(dirtyResult.stderr).toContain('inherited Docker authentication is forbidden');
    expect(commands(dirtyHome)).not.toContain('docker\t');
  });

  it('accepts only classic ghp_ PATs without imposing a fixed token length', () => {
    for (const invalidToken of [
      'github_pat_syntheticFineGrainedToken',
      'ghs_syntheticInstallationToken',
      'ghu_syntheticAppUserToken',
      'syntheticUnknownCredential',
    ]) {
      const item = fixture();
      const result = run(item, { input: `${invalidToken}\n` });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('classic PAT beginning with ghp_');
      expect(commands(item)).not.toContain('\tlogin\tghcr.io');
      expectNoRunResidue(item);
      expectNoSecret(item, result, invalidToken);
    }

    const shortClassicPat = 'ghp_x';
    const accepted = fixture();
    const acceptedResult = run(accepted, { input: `${shortClassicPat}\n` });
    expect(acceptedResult.status).toBe(0);
    expectNoSecret(accepted, acceptedResult, shortClassicPat);
  });

  it('rejects an unterminated nonempty second stdin line', () => {
    const item = fixture();
    const result = run(item, { input: `${TOKEN}\nunexpected-second-line` });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('stdin must contain exactly one line');
    expect(commands(item)).not.toContain('\tlogin\tghcr.io');
    expectNoRunResidue(item);
    expectNoToken(item, result);
  });

  it('publishes exactly one linux/amd64 full-SHA operator target with maximum provenance', () => {
    const item = fixture();
    const result = run(item);
    const log = commands(item);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${REPOSITORY}@${DIGEST}`);
    expect(log).toContain('git\tcat-file\t-e');
    expect(log).toContain('git\tremote\tget-url\torigin');
    expect(log).toContain('git\tfetch\t--quiet\t--prune\t--no-tags\torigin');
    expect(log).toContain('git\tfor-each-ref');
    expect(log).toContain('git\tworktree\tadd\t--detach');
    const builds = log
      .split('\n')
      .filter(line => line.startsWith('docker\t') && line.includes('\tbuildx\tbuild\t'));
    expect(builds).toHaveLength(1);
    const build = builds[0];
    expect(build).toContain('\t--target\tqdrant-operator');
    expect(build).toContain('\t--platform\tlinux/amd64');
    expect(build).toContain(`\t--tag\t${REPOSITORY}:${COMMIT}`);
    expect(build).toContain('\t--provenance=mode=max');
    expect(build).toContain('\t--metadata-file\t');
    expect(build).toContain('\t--push\t');
    expect(build).toContain(`\t--label\torg.opencontainers.image.revision=${COMMIT}`);
    const inspections = log
      .split('\n')
      .filter(
        line => line.startsWith('docker\t') && line.includes('\tbuildx\timagetools\tinspect\t')
      );
    expect(inspections).toHaveLength(3);
    expect(inspections.filter(line => line.includes('Manifest.Digest'))).toHaveLength(2);
    expect(inspections.filter(line => line.includes('Provenance.SLSA'))).toHaveLength(1);
    expect(inspections[0]).toContain(`\t${REPOSITORY}:${COMMIT}\t--format\t`);
    expect(inspections[2]).toContain(`\t${REPOSITORY}@${DIGEST}\t--format\t`);
    expect(log.indexOf('\tlogin\tghcr.io\t')).toBeLessThan(log.indexOf(inspections[0]));
    expect(log.indexOf(inspections[0])).toBeLessThan(log.indexOf(build));
    expect(log.split('\n').filter(line => line.startsWith('external\tpython3\t'))).toHaveLength(2);
    expect(log).not.toMatch(/\t(?:ssh|scp|compose|service|deploy|migration|push)\t/iu);
    expectNoRunResidue(item);
    expectNoToken(item, result);
  });

  it('keeps the canonical repository independent from the authenticated GitHub user', () => {
    const item = fixture();
    writeFileSync(item.dockerMode, 'preflight-not-found\n', { mode: 0o600 });
    const result = run(item, { username: 'release-bot' });
    const log = commands(item);

    expect(result.status).toBe(0);
    expect(log).toContain('\tlogin\tghcr.io\t--username\trelease-bot\t--password-stdin');
    expect(log).toContain(`\t--tag\t${REPOSITORY}:${COMMIT}`);
    expect(log).not.toContain('ghcr.io/release-bot/');
    expectNoRunResidue(item);
    expectNoToken(item, result);
  });

  it('refuses an existing immutable-input tag before build and push', () => {
    const item = fixture();
    writeFileSync(item.dockerMode, 'tag-exists\n', { mode: 0o600 });
    const result = run(item);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already exists');
    expect(commands(item)).toContain(`\tbuildx\timagetools\tinspect\t${REPOSITORY}:${COMMIT}`);
    expect(commands(item)).not.toContain('\tbuildx\tbuild\t');
    expectNoRunResidue(item);
    expectNoToken(item, result);
  });

  it('fails closed when authenticated tag preflight is not an exact absence result', () => {
    for (const mode of ['preflight-auth', 'preflight-network', 'preflight-ambiguous']) {
      const item = fixture();
      writeFileSync(item.dockerMode, `${mode}\n`, { mode: 0o600 });
      const result = run(item);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('unable to prove that the publication tag is absent');
      expect(commands(item)).not.toContain('\tbuildx\tbuild\t');
      expect(commands(item)).toContain('\tlogout\tghcr.io');
      expectNoRunResidue(item);
      expectNoToken(item, result);
    }
  });

  it('requires well-formed full local Buildx provenance for the accepted source revision', () => {
    for (const mode of [
      'malformed-metadata',
      'null-provenance',
      'wrong-revision',
      'wrong-source',
      'missing-max',
    ]) {
      const item = fixture();
      writeFileSync(item.dockerMode, `${mode}\n`, { mode: 0o600 });
      const result = run(item);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Buildx metadata provenance validation failed');
      expect(commands(item)).not.toContain('Provenance.SLSA');
      expectNoRunResidue(item);
      expectNoToken(item, result);
    }
  });

  it('requires well-formed full remote provenance for the verified pushed digest', () => {
    for (const mode of [
      'malformed-remote-provenance',
      'null-remote-provenance',
      'wrong-remote-revision',
      'wrong-remote-source',
      'missing-remote-max',
    ]) {
      const item = fixture();
      writeFileSync(item.dockerMode, `${mode}\n`, { mode: 0o600 });
      const result = run(item);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('remote provenance validation failed');
      expect(commands(item)).toContain(`\tbuildx\timagetools\tinspect\t${REPOSITORY}@${DIGEST}`);
      expectNoRunResidue(item);
      expectNoToken(item, result);
    }
  });

  it('publishes with SLSA v1 provenance and a group-readable metadata file as real buildx writes them', () => {
    const item = fixture();
    writeFileSync(item.dockerMode, 'slsa-v1\n', { mode: 0o600 });
    const result = run(item);
    const log = commands(item);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${REPOSITORY}@${DIGEST}`);
    expect(log).toContain('\t--provenance=mode=max');
    expect(log.split('\n').filter(line => line.startsWith('external\tpython3\t'))).toHaveLength(2);
    expectNoRunResidue(item);
    expectNoToken(item, result);
  });

  it('requires well-formed full SLSA v1 local Buildx provenance for the accepted source revision', () => {
    for (const mode of ['v1-wrong-revision', 'v1-wrong-source', 'v1-missing-max']) {
      const item = fixture();
      writeFileSync(item.dockerMode, `${mode}\n`, { mode: 0o600 });
      const result = run(item);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Buildx metadata provenance validation failed');
      expect(commands(item)).not.toContain('Provenance.SLSA');
      expectNoRunResidue(item);
      expectNoToken(item, result);
    }
  });

  it('requires well-formed full SLSA v1 remote provenance for the verified pushed digest', () => {
    for (const mode of [
      'v1-wrong-remote-revision',
      'v1-wrong-remote-source',
      'v1-missing-remote-max',
    ]) {
      const item = fixture();
      writeFileSync(item.dockerMode, `${mode}\n`, { mode: 0o600 });
      const result = run(item);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('remote provenance validation failed');
      expect(commands(item)).toContain(`\tbuildx\timagetools\tinspect\t${REPOSITORY}@${DIGEST}`);
      expectNoRunResidue(item);
      expectNoToken(item, result);
    }
  });

  it('uses stdin-only login and a minimal environment with unique owner-only Docker configs', () => {
    const item = fixture();
    const first = run(item);
    const second = run(item);
    const log = commands(item);

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    const logins = log
      .split('\n')
      .filter(line => line.startsWith('docker\t') && line.includes('\tlogin\tghcr.io\t'));
    expect(logins).toHaveLength(2);
    for (const login of logins) {
      expect(login).toContain('\t--username\tmaslennikov-ig\t--password-stdin');
      expect(login).not.toContain(TOKEN);
      expect(login).toContain('\tinherited=');
      expect(login).not.toContain('must-not-reach-docker');
    }
    const checks = log.split('\n').filter(line => line.startsWith('docker-check\t'));
    expect(checks).toHaveLength(2);
    for (const check of checks) {
      expect(check).toContain('config-dir-mode=700');
      expect(check).toContain('config-file-mode=600');
      expect(check).toMatch(/stdin-bytes=[1-9][0-9]*/u);
    }
    const configPaths = logins.map(line => /docker_config=([^\t]+)/u.exec(line)?.[1]);
    expect(new Set(configPaths).size).toBe(2);
    expectNoRunResidue(item);
    expectNoToken(item, first);
    expectNoToken(item, second);
  });

  it('keeps the stdin token out of xtrace, argv, output, and captured state', () => {
    const item = fixture();
    const result = run(item, { trace: true });

    expect(result.status).toBe(0);
    expectNoRunResidue(item);
    expectNoToken(item, result);
  });

  it('rejects a credential helper injected into the isolated Docker config', () => {
    const item = fixture();
    writeFileSync(item.dockerMode, 'helper-injection\n', { mode: 0o600 });
    const result = run(item);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('isolated Docker config contains a credential helper or store');
    expect(commands(item)).not.toContain('\tbuildx\tbuild\t');
    expect(commands(item)).toContain('\tlogout\tghcr.io');
    expectNoRunResidue(item);
    expectNoToken(item, result);
  });

  it('removes unique state when setup fails after mktemp', () => {
    const item = fixture();
    writeFileSync(item.utilityMode, 'fail-chmod\n', { mode: 0o600 });
    const result = run(item);

    expect(result.status).not.toBe(0);
    expect(commands(item)).toContain('external\tmktemp\t-u');
    expectNoRunResidue(item);
    expectNoToken(item, result);
  });

  it('leaves no state when signaled across the state-creation boundary', () => {
    for (const mode of ['signal-mktemp', 'signal-mkdir']) {
      const item = fixture();
      writeFileSync(item.utilityMode, `${mode}\n`, { mode: 0o600 });
      const result = run(item);

      expect(result.status).not.toBe(0);
      expect(existsSync(item.statePath)).toBe(true);
      const attemptedPath = readFileSync(item.statePath, 'utf8').trim();
      expect(attemptedPath).not.toBe('');
      expect(existsSync(attemptedPath)).toBe(false);
      expectNoRunResidue(item);
      expectNoToken(item, result);
    }
  });

  it('fails when the independently inspected digest differs from Buildx metadata', () => {
    const item = fixture();
    writeFileSync(item.dockerMode, 'digest-mismatch\n', { mode: 0o600 });
    const result = run(item);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('remote digest does not match Buildx metadata');
    expect(commands(item)).toContain('\tbuildx\timagetools\tinspect\t');
    expect(commands(item)).toContain('\tlogout\tghcr.io');
    expectNoRunResidue(item);
    expectNoToken(item, result);
  });

  it('removes credentials, metadata, and worktrees after ordinary failure and signal', () => {
    for (const mode of ['build-failure', 'signal']) {
      const item = fixture();
      writeFileSync(item.dockerMode, `${mode}\n`, { mode: 0o600 });
      const result = run(item);

      expect(result.status).not.toBe(0);
      expect(commands(item)).toContain('\tlogin\tghcr.io');
      expect(commands(item)).toContain('\tlogout\tghcr.io');
      expect(commands(item)).toContain('git\tworktree\tremove\t--force');
      expectNoRunResidue(item);
      expectNoToken(item, result);
    }
  });

  it('defers HUP, INT, and TERM through every cleanup phase', () => {
    for (const [phase, expectedStatus, configure] of [
      [
        'Docker logout HUP',
        129,
        (item: Fixture) =>
          writeFileSync(item.dockerMode, 'signal-cleanup-logout-hup\n', { mode: 0o600 }),
      ],
      [
        'Docker logout INT',
        130,
        (item: Fixture) =>
          writeFileSync(item.dockerMode, 'signal-cleanup-logout-int\n', { mode: 0o600 }),
      ],
      [
        'Docker logout TERM',
        143,
        (item: Fixture) =>
          writeFileSync(item.dockerMode, 'signal-cleanup-logout\n', { mode: 0o600 }),
      ],
      [
        'Git worktree removal',
        143,
        (item: Fixture) =>
          writeFileSync(item.gitMode, 'signal-cleanup-worktree\n', { mode: 0o600 }),
      ],
      [
        'state-root removal',
        143,
        (item: Fixture) => {
          writeFileSync(item.dockerMode, 'build-failure\n', { mode: 0o600 });
          writeFileSync(item.utilityMode, 'signal-cleanup-rm\n', { mode: 0o600 });
        },
      ],
    ] as const) {
      const item = fixture();
      configure(item);
      const result = run(item);
      const log = commands(item);

      expect(result.status, phase).toBe(expectedStatus);
      expect(result.signal, phase).toBeNull();
      expect(result.stdout, phase).not.toContain('Published qdrant-operator');
      expect(log, phase).toContain('\tlogout\tghcr.io');
      expect(log, phase).toContain('git\tworktree\tremove\t--force');
      expect(log, phase).toContain('external\trm\t-rf\t--\t');
      expectNoRunResidue(item);
      expectNoToken(item, result);
    }
  });

  it('makes cleanup failure status 90 outrank a deferred cleanup signal', () => {
    const item = fixture();
    writeFileSync(item.dockerMode, 'signal-cleanup-logout-failure\n', { mode: 0o600 });
    const result = run(item);
    const log = commands(item);

    expect(result.status).toBe(90);
    expect(result.signal).toBeNull();
    expect(result.stderr).toContain('publisher cleanup failed');
    expect(result.stdout).not.toContain('Published qdrant-operator');
    expect(log).toContain('\tlogout\tghcr.io');
    expect(log).toContain('git\tworktree\tremove\t--force');
    expect(log).toContain('external\trm\t-rf\t--\t');
    expectNoRunResidue(item);
    expectNoToken(item, result);
  });

  it('makes cleanup failure override an otherwise successful publication', () => {
    for (const [kind, mode] of [
      ['Docker logout', 'logout-failure'],
      ['Git worktree removal', 'worktree-remove-failure'],
    ] as const) {
      const item = fixture();
      const modeFile = kind === 'Docker logout' ? item.dockerMode : item.gitMode;
      writeFileSync(modeFile, `${mode}\n`, { mode: 0o600 });
      const result = run(item);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('publisher cleanup failed');
      expectNoRunResidue(item);
      expectNoToken(item, result);
    }
  });
});
