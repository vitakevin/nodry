import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { native } from './bridge';

// Fixed vector paths: no screenshots, shader pipeline or high-frequency particles.
const paths = [
  'M0 110 L44 133 L57 169 L92 183 L114 221 L151 237 L166 278',
  'M44 133 L79 120 L101 141 M92 183 L82 216 L99 251 M114 221 L146 206 L176 219',
  'M142 0 L151 42 L184 60 L178 98 L214 126 L228 165',
  'M151 42 L119 66 L124 98 M178 98 L149 117 L140 148',
  'M1000 90 L957 117 L944 157 L909 180 L895 220 L857 248 L849 287',
  'M957 117 L924 103 L904 124 M909 180 L933 208 L925 237 M895 220 L863 209 L837 226',
  'M831 0 L826 43 L799 68 L806 107 L777 136',
  'M826 43 L855 67 L851 94 M806 107 L835 126',
  'M0 610 L39 589 L53 552 L89 539 L111 503 L146 491 L164 455',
  'M53 552 L35 522 L42 498 M111 503 L103 471 L118 444',
  'M1000 605 L956 582 L943 544 L907 526 L888 492 L852 477 L838 445',
  'M943 544 L960 515 L951 486 M888 492 L899 459 L883 434',
  'M197 700 L204 666 L234 646 L230 610 L257 585',
  'M204 666 L177 642 L182 614 M234 646 L260 661',
  'M787 700 L781 663 L753 642 L758 608 L731 583',
  'M781 663 L809 642 L804 615 M758 608 L788 592',
];
export default function Crack() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!native) return;
    const pending = listen('crack-play', () => setKey(k => k + 1));
    return () => { void pending.then(unlisten => unlisten()); };
  }, []);
  return <div key={key} className="crack-layer" aria-hidden="true">
    <svg viewBox="0 0 1000 700" preserveAspectRatio="none">
      <g className="crack-highlight">{paths.map((d,i)=><path key={i} d={d}/>)}</g>
      <g className="crack-stroke">{paths.map((d,i)=><path key={i} d={d} style={{animationDelay:`${i%4*80}ms`}}/>)}</g>
    </svg>
    <div className="crack-message"><span>别太干巴了</span><strong>干巴到屏幕都裂了，喝口水吧。</strong></div>
  </div>;
}
