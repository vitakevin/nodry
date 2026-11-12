import { describe, expect, it } from 'vitest';
import { crackGrowth, crackPaths, maxCrackDistance, pathReveal, visibleCrackPath } from './crack-model';

describe('continuous crack growth', () => {
  it('starts at one point and preserves fractional score changes', () => {
    expect(crackGrowth(0)).toBe(0);
    expect(crackGrowth(1)).toBeGreaterThan(0);
    expect(crackGrowth(1.01)).toBeGreaterThan(crackGrowth(1));
    for (let score = 1; score <= 100; score++) {
      expect(crackGrowth(score)).toBeGreaterThan(crackGrowth(score - 1));
    }
    expect(crackGrowth(100)).toBe(1);
  });
  it('changes growth rate without jumping at 20, 50 or 80', () => {
    for (const boundary of [20, 50, 80]) {
      expect(crackGrowth(boundary - 1e-7)).toBeCloseTo(crackGrowth(boundary), 7);
      expect(crackGrowth(boundary + 1e-7)).toBeCloseTo(crackGrowth(boundary), 7);
    }
    const steps = [10, 30, 60, 90].map(s => crackGrowth(s+1)-crackGrowth(s));
    expect(steps[1]).toBeGreaterThan(steps[0]);
    expect(steps[2]).toBeGreaterThan(steps[1]);
    expect(steps[3]).toBeGreaterThan(steps[2]);
  });
  it('caps the effect and safely ignores invalid scores', () => {
    for (const score of [-10, NaN, Infinity, -Infinity]) expect(crackGrowth(score)).toBe(0);
    expect(crackGrowth(101)).toBe(1);
  });
  it('begins at the bottom-right and reveals branches only after their junctions', () => {
    expect(crackPaths[0].d.startsWith('M999 699')).toBe(true);
    expect(crackPaths[0].start).toBe(0);
    expect(pathReveal(crackPaths[0], crackGrowth(1))).toBeGreaterThan(0);
    expect(crackPaths.slice(1).every(p => pathReveal(p, crackGrowth(1)) === 0)).toBe(true);
    for (let i = 1; i < crackPaths.length; i++) {
      const path = crackPaths[i];
      const origin = path.d.match(/^M([\d.]+) ([\d.]+)/)!.slice(1).map(Number);
      const connected = crackPaths.slice(0, i).some(parent => {
        const points = [...parent.d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
        let distance = parent.start;
        return points.some(([x,y], j) => {
          if (j) distance += Math.hypot(x-points[j-1][0],y-points[j-1][1]);
          return x===origin[0] && y===origin[1] && Math.abs(distance-path.start)<1e-7;
        });
      });
      expect(connected, path.d).toBe(true);
      expect(pathReveal(path, path.start/maxCrackDistance)).toBeCloseTo(0, 10);
    }
  });
  it('renders only a geometric prefix, including on Retina WebKit without SVG dash support', () => {
    expect(crackPaths.every(p => visibleCrackPath(p, 0) === '')).toBe(true);
    const first = visibleCrackPath(crackPaths[0], crackGrowth(1));
    expect(first.startsWith('M999 699 L')).toBe(true);
    expect(first.match(/L/g)).toHaveLength(1);
    expect(crackPaths.slice(1).every(p => visibleCrackPath(p, crackGrowth(1)) === '')).toBe(true);
    for (const path of crackPaths) {
      expect(visibleCrackPath(path, 1)).toBe(path.d);
      expect(visibleCrackPath(path, Math.max(0, path.start-1)/maxCrackDistance)).toBe('');
    }
  });
  it('retracts on exactly the same paths as the score drops, to a fully clear screen', () => {
    for (const p of crackPaths) {
      expect(pathReveal(p, 0)).toBe(0);
      expect(pathReveal(p, 1)).toBeCloseTo(1, 10);
      let previous = 1;
      for (let score = 100; score >= 0; score--) {
        const visible = pathReveal(p, crackGrowth(score));
        expect(visible).toBeLessThanOrEqual(previous);
        previous = visible;
      }
      expect(previous).toBe(0);
    }
  });
});
