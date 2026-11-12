import { useId } from 'react';
import { earthCells, earthOpacity, earthReveal, earthTile } from './crack-model';

export default function EarthSurface({ growth }: { growth: number }) {
  const clipId = `earth-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const reveal = earthReveal(growth);
  return <svg viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
    {reveal && <>
      <defs><clipPath id={clipId}><path d={reveal} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`} opacity={earthOpacity(growth)}>
        <path d={reveal} fill="#3f291b" />
        {earthCells.map(cell => <path key={cell.id} d={earthTile(cell, growth)}
          fill={cell.color} stroke="#e6c58d" strokeWidth="0.65" strokeLinejoin="round" />)}
      </g>
    </>}
  </svg>;
}
