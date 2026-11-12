// Integrated growth rates: equal score increases reveal more geometry in higher bands.
// This changes only the visual effect, never the hydration score or reminder timer.
export function crackGrowth(score: number): number {
  if (!Number.isFinite(score)) return 0;
  const s = Math.max(0, Math.min(100, score));
  return (Math.min(s, 20) + Math.max(0, Math.min(s - 20, 30)) * 2
    + Math.max(0, Math.min(s - 50, 30)) * 3 + Math.max(0, s - 80) * 4) / 250;
}

export type Point = readonly [number, number];
export interface EarthCell {
  id: number;
  center: Point;
  boundary: readonly Point[];
  outline: readonly Point[];
  color: string;
  widthBias: number;
}
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const path = (points: readonly Point[]) => points.length < 3 ? ''
  : points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ') + ' Z';

// Clip a convex polygon to a Voronoi half-plane. Cells share their boundaries;
// unlike a branching tree, these edges form closed patches of earth.
function clip(points: readonly Point[], nx: number, ny: number, limit: number): Point[] {
  const result: Point[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const da = a[0] * nx + a[1] * ny - limit;
    const db = b[0] * nx + b[1] * ny - limit;
    if (da <= 1e-8) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  });
  return result;
}

function buildCells(): EarthCell[] {
  let state = 71423;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  // This pair's shared seam runs through the bottom-right corner, making the
  // first tiny revealed patch cracked too. All other sites stay well spaced.
  const sites: Point[] = [[972, 688], [988, 672]];
  for (let tries = 0; sites.length < 140 && tries < 10000; tries++) {
    const site: Point = [15 + random() * 970, 15 + random() * 670];
    if (sites.every(other => distance(site, other) > 34)) sites.push(site);
  }
  const palette = ['#c9a56c', '#c3a06a', '#c6a16b'];
  return sites.map((center, id) => {
    let boundary: Point[] = [[0, 0], [1000, 0], [1000, 700], [0, 700]];
    for (const other of sites) {
      if (other === center) continue;
      const nx = other[0] - center[0], ny = other[1] - center[1];
      boundary = clip(boundary, nx, ny,
        (other[0] ** 2 + other[1] ** 2 - center[0] ** 2 - center[1] ** 2) / 2);
    }
    const outline = boundary.flatMap((a, i) => roughEdge(a, boundary[(i + 1) % boundary.length]).slice(0, -1));
    return { id, center, boundary, outline, color: palette[Math.floor(random() * palette.length)], widthBias: 0.55 + random() * 0.45 };
  });
}

// Slightly uneven shared edges avoid a neat paving-stone pattern. The same
// canonical endpoints always yield the same edge in both adjacent cells.
function roughEdge(a: Point, b: Point): Point[] {
  const key = (p: Point) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
  const reverse = key(a) > key(b), first = reverse ? b : a, last = reverse ? a : b;
  const length = distance(first, last);
  if (length < 1e-6 || (Math.abs(a[0] - b[0]) < 1e-6 && (Math.abs(a[0]) < 1e-6 || Math.abs(a[0] - 1000) < 1e-6))
    || (Math.abs(a[1] - b[1]) < 1e-6 && (Math.abs(a[1]) < 1e-6 || Math.abs(a[1] - 700) < 1e-6))) return [a, b];
  let hash = 2166136261;
  for (const char of key(first) + ':' + key(last)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const points: Point[] = [first];
  for (const fraction of [0.10, 0.19, 0.30, 0.44, 0.53, 0.64, 0.78, 0.90]) {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const offset = (((hash >>> 0) / 4294967296) - 0.5) * Math.min(13, length * 0.2);
    points.push([first[0] + (last[0] - first[0]) * fraction - (last[1] - first[1]) / length * offset,
      first[1] + (last[1] - first[1]) * fraction + (last[0] - first[0]) / length * offset]);
  }
  points.push(last);
  return reverse ? points.reverse() : points;
}

export const earthCells = buildCells();

export function earthRadius(growth: number): number {
  const g = clamp(growth);
  return 1350 * g + 24 * (1 - Math.exp(-250 * g));
}

export function earthReveal(growth: number): string {
  const radius = earthRadius(growth);
  if (!radius) return '';
  const points: Point[] = [[1000, 700]];
  for (let i = 0; i <= 32; i++) {
    const angle = Math.PI + i / 32 * Math.PI / 2;
    const uneven = 1 + 0.025 * Math.sin(i / 32 * Math.PI * 6) + 0.018 * Math.sin(i / 32 * Math.PI * 14);
    points.push([1000 + Math.cos(angle) * radius * uneven, 700 + Math.sin(angle) * radius * uneven]);
  }
  return path(points);
}

export const EARTH_GAP_INITIAL = 1.1;
export const EARTH_GAP_OPENING = 4.9;

export function earthGap(cell: EarthCell, growth: number): number {
  const g = clamp(growth);
  const maturity = clamp((earthRadius(g) - distance(cell.center, [1000, 700]) + 40) / 200);
  return (EARTH_GAP_INITIAL * (1 - Math.exp(-500 * g)) + EARTH_GAP_OPENING * g * maturity) * cell.widthBias;
}

function earthTilePoints(cell: EarthCell, growth: number, lip = 0): Point[] {
  const g = clamp(growth);
  if (!g) return [];
  // Pull the soil inward, revealing an actual gap between filled clay patches.
  // The layout is fixed across scores; drinking closes the very same gaps.
  const inset = earthGap(cell, g) / 2 + lip;
  return cell.outline.map(point => {
    const variation = 0.55 + 0.45 * Math.sin(point[0] * 0.081 + point[1] * 0.063) ** 2;
    const scale = Math.max(0, 1 - inset * variation / Math.max(1, distance(point, cell.center)));
    const x = cell.center[0] + (point[0] - cell.center[0]) * scale;
    const y = cell.center[1] + (point[1] - cell.center[1]) * scale;
    // Soil continues beyond the display; shrinking the outside edges would
    // otherwise leave an artificial dark frame around the entire screen.
    return [Math.abs(point[0]) < 1e-6 ? 0 : Math.abs(point[0] - 1000) < 1e-6 ? 1000 : x,
      Math.abs(point[1]) < 1e-6 ? 0 : Math.abs(point[1] - 700) < 1e-6 ? 700 : y] as Point;
  });
}

export function earthTile(cell: EarthCell, growth: number, lip = 0): string {
  return path(earthTilePoints(cell, growth, lip));
}

// Only the chipped lips facing the light catch it; a uniform pale outline
// around every polygon would make the ground look like paving or a diagram.
export function earthRim(cell: EarthCell, growth: number, lip: number): string {
  const points = earthTilePoints(cell, growth, lip);
  return points.flatMap((a, i) => {
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    return length > 1e-6 && (0.8 * dx - 0.6 * dy) / length > 0.35
      ? [`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`] : [];
  }).join(' ');
}

export function earthOpacity(growth: number): number {
  const g = clamp(growth);
  return g ? (0.32 + 0.20 * g) * (1 - Math.exp(-500 * g)) : 0;
}

export function earthLift(growth: number): number {
  return clamp(growth) ** 0.85;
}

// Fissures stay darker than the translucent soil instead of turning pale gray.
export function fissureOpacity(growth: number): number {
  const g = clamp(growth);
  return (0.70 + 0.15 * g) * (1 - Math.exp(-500 * g));
}
