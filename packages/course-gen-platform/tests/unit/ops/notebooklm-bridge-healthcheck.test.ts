import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * What the NotebookLM bridge's healthcheck is allowed to ask, and how.
 *
 * The bridge runs behind HTTP_PROXY=socks5h://... so its NotebookLM traffic
 * takes the geo-bypass hop. That single variable decides both halves of this
 * test:
 *
 * The image's `HEALTHCHECK` used `urllib.request.urlopen`, which reads
 * HTTP_PROXY and routes even a loopback request through the SOCKS proxy. It
 * cannot succeed inside this container. Measured with the proxy variables set:
 * `urllib.error.URLError: <urlopen error unknown url type: socks5h>`, against a
 * server that was answering 200 on the same port.
 *
 * So all three compose files replaced it with a bare TCP connect, which proves
 * that uvicorn bound the port and nothing else. `/health` knows whether the
 * auth file is present, whether the SOCKS proxy actually answers, whether the
 * session cookies have expired and whether the master token can renew them; a
 * socket knows none of it. That is how a dead session and a severed tunnel both
 * sat behind `Up (healthy)` from 2026-03-31 to 2026-08-22 (mc2-h6nlv, and
 * `.codex/repository-failure-modes.md` under "Healthcheck That Reads a
 * Variable").
 *
 * `http.client` opens the connection itself and never consults the environment,
 * so it is the one form that both asks the endpoint and survives the proxy. The
 * command now exists in four files, which is three chances to drift; this keeps
 * them one string.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const DOCKERFILE = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/docker/notebooklm-bridge/Dockerfile'
);
const COMPOSE_FILES = [
  'docker-compose.dev.yml',
  'docker-compose.infra.yml',
  'docker-compose.production.yml',
];

interface ComposeService {
  environment?: string[] | Record<string, string>;
  healthcheck?: { test?: string | string[] };
}

function loadCompose(relative: string): Record<string, ComposeService> {
  const path = resolve(REPO_ROOT, relative);
  expect(existsSync(path), `${relative} is missing`).toBe(true);
  const document = yaml.load(readFileSync(path, 'utf8')) as {
    services?: Record<string, ComposeService>;
  };
  return document.services ?? {};
}

/** The command after `CMD` in the Dockerfile's HEALTHCHECK, continuations joined. */
function dockerfileHealthcheckCommand(): string {
  const source = readFileSync(DOCKERFILE, 'utf8').replace(/\\\r?\n\s*/g, ' ');
  const match = source.match(/^HEALTHCHECK\s+.*?\sCMD\s+(.+)$/m);
  expect(match, 'the bridge Dockerfile declares no HEALTHCHECK').not.toBe(null);
  return match![1].trim();
}

/** The shell string a compose healthcheck runs, whatever form it was written in. */
function healthcheckCommand(service: ComposeService): string | null {
  const test = service.healthcheck?.test;
  if (!test) return null;
  if (typeof test === 'string') return test;
  return test.filter(part => part !== 'CMD' && part !== 'CMD-SHELL').join(' ');
}

function environmentEntries(service: ComposeService): string[] {
  const environment = service.environment;
  if (!environment) return [];
  return Array.isArray(environment)
    ? environment
    : Object.entries(environment).map(([key, value]) => `${key}=${value}`);
}

describe('the NotebookLM bridge healthcheck', () => {
  it('asks /health rather than proving a port is open', () => {
    const command = dockerfileHealthcheckCommand();

    expect(command).toContain('/health');
    // A connect that never reads a response is the check this replaced.
    expect(command).toContain('getresponse');
    expect(command).toContain('== 200');
  });

  it('reaches loopback without consulting the proxy variables', () => {
    const command = dockerfileHealthcheckCommand();

    // `urllib` and `requests` both honour HTTP_PROXY; `http.client` does not.
    expect(command).not.toContain('urllib');
    expect(command).not.toContain('requests.');
    expect(command).toContain('http.client');
  });

  it('is the same command in the image and in every compose file that runs it', () => {
    const expected = dockerfileHealthcheckCommand();
    const found: Record<string, string | null> = {};

    for (const relative of COMPOSE_FILES) {
      for (const [name, service] of Object.entries(loadCompose(relative))) {
        if (!name.includes('notebooklm-bridge')) continue;
        found[`${relative}:${name}`] = healthcheckCommand(service);
      }
    }

    // Every file that runs the bridge has to appear here: a service that
    // silently stopped matching would make this test pass by checking nothing.
    expect(Object.keys(found).sort()).toEqual([
      'docker-compose.dev.yml:notebooklm-bridge-dev',
      'docker-compose.infra.yml:notebooklm-bridge',
      'docker-compose.production.yml:notebooklm-bridge',
    ]);
    for (const [where, command] of Object.entries(found)) {
      expect(command, `${where} overrides the image healthcheck with something else`).toBe(
        expected
      );
    }
  });

  it('lets no proxied service anywhere health-check itself through urllib', () => {
    // The trap generalised: any container given HTTP_PROXY has the same
    // problem, and the next one to be written will not remember this one.
    const broken: string[] = [];

    for (const relative of COMPOSE_FILES) {
      for (const [name, service] of Object.entries(loadCompose(relative))) {
        const proxied = environmentEntries(service).some(entry =>
          /^(HTTP_PROXY|HTTPS_PROXY)=/i.test(entry)
        );
        const command = healthcheckCommand(service);
        if (proxied && command && /urllib|requests\.|\bcurl\b|\bwget\b/.test(command)) {
          broken.push(`${relative}:${name}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
