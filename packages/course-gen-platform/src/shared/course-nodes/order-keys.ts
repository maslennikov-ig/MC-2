import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Generate N evenly-spaced order keys for initial batch creation.
 * Keys are lexicographically ordered: keys[0] < keys[1] < ... < keys[N-1]
 *
 * Uses generateNKeysBetween internally for shorter, more balanced keys
 * compared to sequential generateKeyBetween calls.
 */
export function generateInitialOrderKeys(count: number): string[] {
  if (count <= 0) return [];
  return generateNKeysBetween(null, null, count);
}

/**
 * Generate an order key between two existing keys.
 * - before=null, after=key  --> key before `after`
 * - before=key,  after=null --> key after `before`
 * - before=null, after=null --> first key
 */
export function generateOrderKeyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}
