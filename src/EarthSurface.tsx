import { useId } from 'react';
import { earthCells, earthOpacity, earthReveal, earthTile, earthRim, fissureOpacity } from './crack-model';
import soilTexture from './assets/dry-clay.webp';

export default function EarthSurface({ growth }: { growth: number }) {
  const clipId = `earth-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const textureId = `${clipId}-clay`;
  const reveal = earthReveal(growth);
  const lip = 2.8 * Math.max(0, Math.min(1, growth)) ** 0.6;
  const tiles = reveal ? earthCells.map(cell => ({ ...cell,
    d: earthTile(cell, growth), top: earthTile(cell, growth, lip), rim: earthRim(cell, growth, lip) })) : [];
  return <svg viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
    {reveal && <>
      <defs>
        <clipPath id={clipId}><path d={reveal} /></clipPath>
        <pattern id={textureId} patternUnits="userSpaceOnUse" width="1000" height="1000">
          <image href={soilTexture} width="1000" height="1000" preserveAspectRatio="none" />
        </pattern>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={`M0 0H1000V700H0Z ${tiles.map(cell => cell.d).join(' ')}`}
          fill="#21140e" fillRule="evenodd" opacity={fissureOpacity(growth)} />
        <g opacity={fissureOpacity(growth) * 0.85}>
          {tiles.map(cell => <path key={cell.id} d={`${cell.d} ${cell.top}`}
            fillRule="evenodd" fill="#89603c" />)}
        </g>
        <g opacity={earthOpacity(growth)}>
          {tiles.map(cell => <g key={cell.id}>
            <path d={cell.top} fill={cell.color} />
            <path d={cell.top} fill={`url(#${textureId})`} opacity="0.92" />
            <path d={cell.rim} fill="none" stroke="#edc78b" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
          </g>)}
        </g>
      </g>
    </>}
  </svg>;
}
