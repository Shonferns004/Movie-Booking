import { describe, it, expect } from 'vitest';
import { sha256, randomToken } from '../src/utils/crypto.js';

describe('crypto', () => {
  it('hashes deterministically', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
  });
  it('generates tokens', () => {
    expect(randomToken(8)).toHaveLength(16);
  });
});
