import { describe, expect, it } from 'vitest';
import { boundaryDistances } from './earth-field';

describe('soil fracture distance field', () => {
  it('keeps screen edges solid and measures distance to shared cracks', () => {
    const labels = new Uint8Array([
      1,1,1,1,2,2,2,2,
      1,1,1,1,2,2,2,2,
      1,1,1,1,2,2,2,2,
    ]);
    const d = boundaryDistances(labels, 8, 3);
    expect([...d.slice(8,16)]).toEqual([3,2,1,0,0,1,2,3]);
    expect(d[0]).toBe(3);
  });
  it('retains irregular corners and gives finite nonnegative distances', () => {
    const labels = new Uint8Array([
      1,1,1,1,1,
      1,1,1,1,1,
      1,1,2,1,1,
      1,1,1,1,1,
      1,1,1,1,1,
    ]);
    const d = boundaryDistances(labels, 5, 5);
    expect(d[12]).toBe(0);
    expect(d[7]).toBe(0);
    expect(d[0]).toBeGreaterThan(1);
    expect([...d].every(value => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(boundaryDistances(new Uint8Array([1,1,1]),3,1)[0]).toBeGreaterThan(64);
  });
});
