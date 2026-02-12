import { describe, it, expect } from 'vitest';
import {
  generateInitialOrderKeys,
  generateOrderKeyBetween,
} from '../../../src/shared/course-nodes/order-keys';

describe('generateInitialOrderKeys', () => {
  it('returns empty array for count 0', () => {
    expect(generateInitialOrderKeys(0)).toEqual([]);
  });

  it('returns empty array for negative count', () => {
    expect(generateInitialOrderKeys(-1)).toEqual([]);
  });

  it('returns single key for count 1', () => {
    const keys = generateInitialOrderKeys(1);
    expect(keys).toHaveLength(1);
    expect(typeof keys[0]).toBe('string');
  });

  it('returns sorted keys for count 5', () => {
    const keys = generateInitialOrderKeys(5);
    expect(keys).toHaveLength(5);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] > keys[i - 1]).toBe(true);
    }
  });

  it('handles large count (100)', () => {
    const keys = generateInitialOrderKeys(100);
    expect(keys).toHaveLength(100);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] > keys[i - 1]).toBe(true);
    }
  });

  it('all keys are unique', () => {
    const keys = generateInitialOrderKeys(50);
    const unique = new Set(keys);
    expect(unique.size).toBe(50);
  });
});

describe('generateOrderKeyBetween', () => {
  it('generates key between two keys', () => {
    const keys = generateInitialOrderKeys(3);
    const between = generateOrderKeyBetween(keys[0], keys[1]);
    expect(between > keys[0]).toBe(true);
    expect(between < keys[1]).toBe(true);
  });

  it('generates key before first key', () => {
    const keys = generateInitialOrderKeys(2);
    const before = generateOrderKeyBetween(null, keys[0]);
    expect(before < keys[0]).toBe(true);
  });

  it('generates key after last key', () => {
    const keys = generateInitialOrderKeys(2);
    const after = generateOrderKeyBetween(keys[keys.length - 1], null);
    expect(after > keys[keys.length - 1]).toBe(true);
  });

  it('generates first key from nulls', () => {
    const key = generateOrderKeyBetween(null, null);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('can insert multiple keys between two adjacent keys', () => {
    const keys = generateInitialOrderKeys(2);
    const mid1 = generateOrderKeyBetween(keys[0], keys[1]);
    const mid2 = generateOrderKeyBetween(keys[0], mid1);
    const mid3 = generateOrderKeyBetween(mid1, keys[1]);

    // Verify full ordering: keys[0] < mid2 < mid1 < mid3 < keys[1]
    const sorted = [keys[0], mid2, mid1, mid3, keys[1]];
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] > sorted[i - 1]).toBe(true);
    }
  });
});
