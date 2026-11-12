import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { native } from './bridge';
import { crackGrowth } from './crack-model';
import EarthSurface from './EarthSurface';

interface CrackState { score: number }

export default function Crack() {
  const [score, setScore] = useState(0);
  const [growth, setGrowth] = useState(0);
  const currentGrowth = useRef(0);
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let receivedEvent = false;
    // Subscribe before requesting the initial state, including on restart at a high
    // score. The backend only shows the window after this ready handshake.
    void listen<CrackState>('crack-state', event => {
      receivedEvent = true;
      if (!disposed) setScore(event.payload.score);
    }).then(async off => {
      if (disposed) { off(); return; }
      unlisten = off;
      const initial = await invoke<CrackState>('get_crack_state');
      if (!disposed && !receivedEvent) setScore(initial.score);
    }).catch(error => console.error('裂纹状态同步失败', error));
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    const target = crackGrowth(score), from = currentGrowth.current;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1000;
    let frame = 0, start: number | undefined, last = -Infinity;
    const animate = (time: number) => {
      start ??= time;
      const progress = duration ? Math.min(1, (time - start) / duration) : 1;
      if (time - last >= 30 || progress === 1) {
        currentGrowth.current = from + (target - from) * progress;
        setGrowth(currentGrowth.current);
        last = time;
      }
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return <div className="crack-layer" aria-hidden="true" data-score={score} data-growth={growth}>
    <EarthSurface growth={growth} />
  </div>;
}
