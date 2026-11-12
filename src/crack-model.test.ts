import { describe, expect, it } from 'vitest';
import { crackGrowth, crackPaths, maxCrackDistance, pathReveal, visibleCrackPath, crackWidth, visibleCrackShape } from './crack-model';

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

describe('continuous crack width', () => {
  const trunk = crackPaths[0];
  it('widens at every score and fractional change, without band jumps', () => {
    expect(crackWidth(trunk, 0)).toBe(0);
    expect(crackWidth(trunk, crackGrowth(1))).toBeGreaterThan(0.9);
    for (let score = 1; score <= 100; score++) {
      expect(crackWidth(trunk, crackGrowth(score))).toBeGreaterThan(crackWidth(trunk, crackGrowth(score - 1)));
    }
    expect(crackWidth(trunk, crackGrowth(50.01))).toBeGreaterThan(crackWidth(trunk, crackGrowth(50)));
    for (const boundary of [20, 50, 80]) {
      expect(crackWidth(trunk, crackGrowth(boundary - 1e-7))).toBeCloseTo(crackWidth(trunk, crackGrowth(boundary + 1e-7)), 6);
    }
    const steps = [19, 30, 60, 90].map(s => crackWidth(trunk, crackGrowth(s + 1)) - crackWidth(trunk, crackGrowth(s)));
    expect(steps[1]).toBeGreaterThan(steps[0]);
    expect(steps[2]).toBeGreaterThan(steps[1]);
    expect(steps[3]).toBeGreaterThan(steps[2]);
    expect(crackWidth(trunk, 1)).toBeCloseTo(16);
  });
  it('keeps branches narrower than the trunk and tapers each tip to zero', () => {
    const branch = crackPaths.find(p => p.depth === 1)!;
    const twig = crackPaths.find(p => p.depth === 2)!;
    expect(crackWidth(branch, 1)).toBeLessThan(crackWidth(trunk, 1));
    expect(crackWidth(twig, 1)).toBeLessThan(crackWidth(branch, 1));
    for (const path of crackPaths) {
      const revealed = pathReveal(path, 0.7) * path.length;
      if (revealed <= 0) continue;
      expect(crackWidth(path, 0.7, revealed * 0.9)).toBeLessThan(crackWidth(path, 0.7, revealed * 0.5));
      expect(crackWidth(path, 0.7, revealed)).toBeCloseTo(0, 6);
      expect(crackWidth(path, 1, path.length)).toBe(0);
    }
  });
  it('narrows existing geometry on drinking and clears at zero', () => {
    for (const path of crackPaths) {
      for (const distance of [0, path.length * 0.2, path.length * 0.8]) {
        let previous = Infinity;
        for (let score = 100; score >= 0; score--) {
          const width = crackWidth(path, crackGrowth(score), distance);
          expect(width).toBeLessThanOrEqual(previous);
          previous = width;
        }
        expect(previous).toBe(0);
      }
    }
  });
  it('draws connected, finite filled ribbons only on the reached prefix', () => {
    for (const path of crackPaths) {
      expect(visibleCrackShape(path, 0)).toBe('');
      expect(visibleCrackShape(path, Math.max(0, path.start - 1) / maxCrackDistance)).toBe('');
      for (const growth of [crackGrowth(1), 0.08, 0.32, 0.68, 1]) {
        const shape = visibleCrackShape(path, growth);
        if (!shape) continue;
        expect(shape.endsWith(' Z')).toBe(true);
        expect(shape).not.toMatch(/NaN|Infinity/);
        const outline = [...shape.matchAll(/[ML](-?[\d.e+-]+) (-?[\d.e+-]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
        const tip = outline[outline.length / 2 - 1];
        const centerline = [...visibleCrackPath(path, growth).matchAll(/[ML]([\d.]+) ([\d.]+)/g)];
        expect(tip[0]).toBeCloseTo(Number(centerline.at(-1)![1]), 6);
        expect(tip[1]).toBeCloseTo(Number(centerline.at(-1)![2]), 6);
      }
    }
    expect(crackPaths.slice(1).every(p => visibleCrackShape(p, crackGrowth(1)) === '')).toBe(true);
  });
  it('bounds invalid and out-of-range inputs', () => {
    for (const growth of [NaN, Infinity, -Infinity, -1]) {
      expect(crackWidth(trunk, growth)).toBe(0);
      expect(visibleCrackShape(trunk, growth)).toBe('');
    }
    expect(crackWidth(trunk, 2)).toBe(crackWidth(trunk, 1));
    expect(visibleCrackShape(trunk, 2)).toBe(visibleCrackShape(trunk, 1));
    expect(crackWidth(trunk, 1, NaN)).toBe(0);
  });
  it('never produces invalid normals at exact junctions or segment ends', () => {
    for (const path of crackPaths) {
      let distance = path.start;
      for (let i = 0; i < path.points.length; i++) {
        if (i) distance += Math.hypot(path.points[i][0] - path.points[i - 1][0], path.points[i][1] - path.points[i - 1][1]);
        for (const delta of [-1e-12, 0, 1e-12]) {
          expect(visibleCrackShape(path, (distance + delta) / maxCrackDistance)).not.toMatch(/NaN|Infinity/);
        }
      }
    }
  });
});
