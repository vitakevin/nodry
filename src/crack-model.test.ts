import { describe, expect, it } from 'vitest';
import { crackGrowth, earthCells, earthRadius, earthReveal, earthGap, earthTile, earthOpacity, fissureOpacity, type Point } from './crack-model';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EarthSurface from './EarthSurface';

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
});

const points = (d: string): Point[] => [...d.matchAll(/[ML](-?[\d.e+-]+) (-?[\d.e+-]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
const area = (polygon: readonly Point[]) => Math.abs(polygon.reduce((sum, a, i) => {
  const b = polygon[(i + 1) % polygon.length];
  return sum + a[0] * b[1] - b[0] * a[1];
}, 0)) / 2;
function contains(polygon: readonly Point[], x: number, y: number): boolean {
  let inside = false;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  });
  return inside;
}

describe('cracked earth surface', () => {
  it('partitions the surface into closed irregular soil patches', () => {
    expect(earthCells.length).toBeGreaterThan(50);
    expect(earthCells.reduce((sum, cell) => sum + area(cell.boundary), 0)).toBeCloseTo(700000, 3);
    expect(earthCells.every(cell => cell.boundary.length >= 3 && contains(cell.boundary, ...cell.center))).toBe(true);
    const areas = earthCells.map(cell => area(cell.boundary));
    expect(Math.max(...areas) / Math.min(...areas)).toBeGreaterThan(2);
    expect(new Set(earthCells.map(cell => cell.boundary.length)).size).toBeGreaterThan(2);
  });
  it('forms a shared network of edges instead of disconnected branches', () => {
    const edges = new Map<string, number>();
    const key = (p: Point) => p.map(n => n.toFixed(3)).join(',');
    for (const cell of earthCells) cell.outline.forEach((a, i) => {
      const b = cell.outline[(i + 1) % cell.outline.length];
      const edge = [key(a), key(b)].sort().join(':');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    });
    expect([...edges.values()].filter(count => count === 2).length).toBeGreaterThan(100);
    expect([...edges.values()].every(count => count <= 2)).toBe(true);
    for (const [edge, count] of edges) {
      if (count === 2) continue;
      const [a, b] = edge.split(':').map(p => p.split(',').map(Number));
      expect((a[0] === b[0] && [0, 1000].includes(a[0])) || (a[1] === b[1] && [0, 700].includes(a[1])), edge).toBe(true);
    }
  });
  it('starts at the bottom-right from one point and reaches the whole surface at 100', () => {
    expect(earthReveal(0)).toBe('');
    const tiny = points(earthReveal(crackGrowth(1)));
    expect(tiny[0]).toEqual([1000, 700]);
    expect(contains(tiny, 999, 699)).toBe(true);
    expect(tiny.every(([x, y]) => x > 970 && y > 670)).toBe(true);
    const full = points(earthReveal(1));
    for (const [x, y] of [[1, 1], [999, 1], [1, 699], [999, 699]]) expect(contains(full, x, y)).toBe(true);
    expect(earthRadius(crackGrowth(1.01))).toBeGreaterThan(earthRadius(crackGrowth(1)));
  });
  it('expands coverage and opens gaps smoothly across all score boundaries', () => {
    for (const boundary of [20, 50, 80]) {
      const before = crackGrowth(boundary - 1e-7), after = crackGrowth(boundary + 1e-7);
      expect(earthRadius(before)).toBeCloseTo(earthRadius(after), 4);
      for (const cell of earthCells) expect(earthGap(cell, before)).toBeCloseTo(earthGap(cell, after), 5);
    }
    for (const cell of earthCells) {
      let previous = 0;
      for (let score = 0; score <= 100; score++) {
        const width = earthGap(cell, crackGrowth(score));
        expect(width).toBeGreaterThanOrEqual(previous);
        previous = width;
      }
    }
    const corner = earthCells[0];
    const steps = [19, 40, 70, 90].map(s => earthGap(corner, crackGrowth(s + 1)) - earthGap(corner, crackGrowth(s)));
    expect(steps[1]).toBeGreaterThan(steps[0]);
    expect(steps[2]).toBeGreaterThan(steps[1]);
    expect(steps[3]).toBeGreaterThan(steps[2]);
  });
  it('opens gaps by moving clay inward and closes them along the same geometry', () => {
    for (const cell of earthCells) {
      const low = points(earthTile(cell, crackGrowth(20)));
      const high = points(earthTile(cell, 1));
      expect(high.length).toBe(cell.outline.length);
      expect(area(high)).toBeLessThan(area(low));
      expect(area(points(earthTile(cell, 1, 2.8)))).toBeLessThan(area(high));
      high.forEach((point, i) => {
        const origin = cell.outline[i], center = cell.center;
        const onX = Math.abs(origin[0]) < 1e-6 || Math.abs(origin[0] - 1000) < 1e-6;
        const onY = Math.abs(origin[1]) < 1e-6 || Math.abs(origin[1] - 700) < 1e-6;
        if (onX) expect(point[0]).toBeCloseTo(origin[0], 6);
        if (onY) expect(point[1]).toBeCloseTo(origin[1], 6);
        expect(Math.hypot(point[0] - center[0], point[1] - center[1])).toBeLessThanOrEqual(Math.hypot(low[i][0] - center[0], low[i][1] - center[1]));
        if (!onX && !onY) expect((point[0] - center[0]) * (origin[1] - center[1]) - (point[1] - center[1]) * (origin[0] - center[0])).toBeCloseTo(0, 7);
      });
      expect(earthTile(cell, 0)).toBe('');
    }
  });
  it('keeps a stable layout and finite geometry through every point and fractional changes', () => {
    for (const score of [0.001, 1, 1.01, 20, 20.01, 50, 50.01, 80, 80.01, 100]) {
      const growth = crackGrowth(score);
      expect(earthReveal(growth)).not.toMatch(/NaN|Infinity/);
      for (const cell of earthCells) {
        const d = earthTile(cell, growth);
        expect(d.endsWith(' Z')).toBe(true);
        expect(d).not.toMatch(/NaN|Infinity/);
        expect(area(points(d))).toBeGreaterThan(0);
      }
    }
  });
  it('clears at zero and keeps the soil translucent', () => {
    expect(earthOpacity(0)).toBe(0);
    expect(fissureOpacity(0)).toBe(0);
    expect(fissureOpacity(1)).toBeLessThanOrEqual(0.85);
    expect(fissureOpacity(1)).toBeGreaterThan(earthOpacity(1));
    for (let score = 1; score <= 100; score++) {
      const opacity = earthOpacity(crackGrowth(score));
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThanOrEqual(0.52);
      expect(earthRadius(crackGrowth(score))).toBeGreaterThan(earthRadius(crackGrowth(score - 1)));
    }
    expect(renderToStaticMarkup(createElement(EarthSurface, { growth: 0 }))).not.toContain('<path');
  });
  it('safely handles invalid inputs and caps the effect', () => {
    for (const value of [-10, NaN, Infinity, -Infinity]) {
      expect(earthReveal(value)).toBe('');
      expect(earthOpacity(value)).toBe(0);
      expect(earthTile(earthCells[0], value)).toBe('');
      expect(earthGap(earthCells[0], value)).toBe(0);
    }
    expect(earthReveal(2)).toBe(earthReveal(1));
    expect(earthTile(earthCells[0], 2)).toBe(earthTile(earthCells[0], 1));
  });
  it('renders actual filled soil cells with independent clip IDs for multiple surfaces', () => {
    const markup = renderToStaticMarkup(createElement('div', null,
      createElement(EarthSurface, { growth: 1 }), createElement(EarthSurface, { growth: 0.5 })));
    const ids = [...markup.matchAll(/<clipPath id="([^"]+)"/g)].map(m => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(markup.match(/fill="#c[369]/g)!.length).toBe(earthCells.length * 2);
    expect(markup).toContain('<pattern');
    expect(markup).toContain('fill-rule="evenodd"');
    expect(markup).not.toContain('stroke-dash');
  });
});
