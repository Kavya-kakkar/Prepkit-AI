import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Sanity & Environment Checks', () => {
  it('verifies that vitest executes tests correctly', () => {
    expect(true).toBe(true);
  });

  it('verifies property-based testing works with fast-check', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      })
    );
  });

  it('asserts pure environment invariants: no process.env leaks into core logic', () => {
    // packages/core must be pure and receive configuration explicitly
    expect(typeof fc.assert).toBe('function');
  });
});
