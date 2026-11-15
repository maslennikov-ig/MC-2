import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
export type HelixaHttpRefusal = { status: number; code: string };
type Refusal = HelixaHttpRefusal;

function header(request: Request, name: string): string | null {
  const value = request.headers[name];
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

function isJsonContentType(value: string | undefined): boolean {
  if (!value) return false;
  return value.split(';')[0].trim().toLowerCase() === 'application/json';
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  // A length difference is not secret-dependent here: both the signature and the system
  // id have a fixed expected length, so failing early leaks nothing a timing attack could use.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Refuses before any parsing. Every branch answers with a code and nothing else — no
 * echo of the header value, the expected signature, the binding, or any internal id.
 */
export function authenticateHelixaRequest(
  request: Request,
  environment: NodeJS.ProcessEnv
): Refusal | null {
  if (!isJsonContentType(request.headers['content-type']))
    return { status: 415, code: 'unsupported_media_type' };
  const externalSystemId = environment.HELIXA_EXTERNAL_SYSTEM_ID;
  const hmacKey = environment.HELIXA_KNOWLEDGE_SYNC_HMAC_KEY;
  if (!externalSystemId || !hmacKey) return { status: 503, code: 'generation_not_configured' };
  const claimedSystemId = header(request, 'x-helixa-external-system-id');
  const signature = header(request, 'x-helixa-signature');
  if (!claimedSystemId || !signature) return { status: 400, code: 'missing_required_header' };
  if (!constantTimeEquals(claimedSystemId, externalSystemId))
    return { status: 403, code: 'unknown_external_system' };
  const raw: unknown = request.body;
  if (!Buffer.isBuffer(raw)) return { status: 400, code: 'malformed_json' };
  const expected = `sha256=${createHmac('sha256', hmacKey).update(raw).digest('hex')}`;
  if (!constantTimeEquals(signature, expected)) return { status: 401, code: 'invalid_signature' };
  return null;
}
