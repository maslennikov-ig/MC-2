import { Buffer } from 'node:buffer';

/** canonicalJson/v1 for the strict Helixa generation contract. */
export function canonicalGenerationJsonV1(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new TypeError('canonical JSON requires safe integers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(item => canonicalGenerationJsonV1(item)).join(',')}]`;
  if (typeof value !== 'object' || value === undefined) throw new TypeError('canonical JSON requires JSON-compatible values');
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('canonical JSON requires plain objects');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')));
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalGenerationJsonV1(record[key])}`).join(',')}}`;
}
