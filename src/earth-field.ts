import { earthCells } from './crack-model';

// An eight-neighbor distance transform of the fixed soil patches. The field is
// built once; animation only updates a GPU uniform, not thousands of SVG nodes.
export function boundaryDistances(labels: Uint8Array, width: number, height: number): Float32Array {
  const d = new Float32Array(width * height).fill(1000);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if ((x && labels[i] !== labels[i - 1]) || (x + 1 < width && labels[i] !== labels[i + 1])
      || (y && labels[i] !== labels[i - width]) || (y + 1 < height && labels[i] !== labels[i + width])) d[i] = 0;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (x) d[i] = Math.min(d[i], d[i - 1] + 1);
    if (y) d[i] = Math.min(d[i], d[i - width] + 1);
    if (x && y) d[i] = Math.min(d[i], d[i - width - 1] + Math.SQRT2);
    if (x + 1 < width && y) d[i] = Math.min(d[i], d[i - width + 1] + Math.SQRT2);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    if (x + 1 < width) d[i] = Math.min(d[i], d[i + 1] + 1);
    if (y + 1 < height) d[i] = Math.min(d[i], d[i + width] + 1);
    if (x + 1 < width && y + 1 < height) d[i] = Math.min(d[i], d[i + width + 1] + Math.SQRT2);
    if (x && y + 1 < height) d[i] = Math.min(d[i], d[i + width - 1] + Math.SQRT2);
  }
  return d;
}

let cached: Uint8Array | undefined;
export function earthField(): Uint8Array {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 1000; canvas.height = 700;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('土地材质初始化失败');
  earthCells.forEach(cell => {
    ctx.beginPath();
    cell.outline.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fillStyle = `rgb(${cell.id + 1},0,0)`; ctx.fill();
  });
  const pixels = ctx.getImageData(0, 0, 1000, 700).data;
  const labels = new Uint8Array(700000);
  for (let i = 0; i < labels.length; i++) labels[i] = pixels[i * 4];
  const distances = boundaryDistances(labels, 1000, 700);
  const result = new Uint8Array(2800000);
  for (let i = 0; i < labels.length; i++) {
    const cell = earthCells[Math.max(0, Math.min(earthCells.length - 1, labels[i] - 1))];
    result[i * 4] = Math.round(Math.min(1, distances[i] / 64) * 255);
    result[i * 4 + 1] = Math.round(cell.widthBias * 255);
    result[i * 4 + 2] = (cell.id * 97 + 41) % 256;
    result[i * 4 + 3] = Math.round(Math.hypot(1000 - cell.center[0], 700 - cell.center[1]) / 1400 * 255);
  }
  cached = result;
  return result;
}
