import { useEffect, useRef, useState } from 'react';
import EarthFallback from './EarthFallback';
import { earthField } from './earth-field';
import { earthLift } from './crack-model';
import { earthVertex, earthFragment } from './earth-shader';
import soilTexture from './assets/dry-clay.webp';

export default function EarthSurface({ growth }: { growth: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const draw = useRef<(() => void) | undefined>(undefined);
  const progress = useRef(growth);
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  progress.current = growth;
  useEffect(() => {
    const element = canvas.current!;
    const gl = element.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return;
    let disposed = false;
    const shaders: WebGLShader[] = [], textures: WebGLTexture[] = [];
    let program: WebGLProgram | undefined, buffer: WebGLBuffer | undefined;
    let observer: ResizeObserver | undefined;
    const image = new Image();
    const lost = (event: Event) => { event.preventDefault(); draw.current = undefined; setReady(false); };
    const restored = () => setGeneration(value => value + 1);
    element.addEventListener('webglcontextlost', lost);
    element.addEventListener('webglcontextrestored', restored);
    try {
      const shader = (type: number, source: string) => {
        const result = gl.createShader(type);
        if (!result) throw new Error('无法创建土地着色器');
        shaders.push(result); gl.shaderSource(result, source); gl.compileShader(result);
        if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) ?? '着色器编译失败');
        return result;
      };
      program = gl.createProgram() ?? undefined;
      if (!program) throw new Error('无法初始化土地渲染');
      gl.attachShader(program, shader(gl.VERTEX_SHADER, earthVertex));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, earthFragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? '着色器链接失败');
      gl.useProgram(program);
      buffer = gl.createBuffer() ?? undefined;
      if (!buffer) throw new Error('无法创建土地绘图缓冲');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const field = gl.createTexture(), soil = gl.createTexture();
      if (!field || !soil) throw new Error('无法创建土壤材质');
      textures.push(field, soil);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, field);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1000, 700, 0, gl.RGBA, gl.UNSIGNED_BYTE, earthField());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program, 'uField'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'uSoil'), 1);
      const uniform = gl.getUniformLocation(program, 'uGrowth');
      const liftUniform = gl.getUniformLocation(program, 'uLift');
      image.onload = () => {
        if (disposed || gl.isContextLost()) return;
        // Power-of-two texture permits wrapping on WebGL 1, including older
        // native WebViews. No runtime image generation or network service.
        const tile = document.createElement('canvas'); tile.width = tile.height = 1024;
        const ctx = tile.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, 1024, 1024);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, soil);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tile);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        draw.current = () => {
          if (disposed || gl.isContextLost()) return;
          const rect = element.getBoundingClientRect();
          const scale = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(2000000 / Math.max(1, rect.width * rect.height)));
          const width = Math.max(1, Math.round(rect.width * scale)), height = Math.max(1, Math.round(rect.height * scale));
          if (element.width !== width || element.height !== height) { element.width = width; element.height = height; }
          gl.viewport(0, 0, width, height);
          const growth = Number.isFinite(progress.current) ? Math.max(0, Math.min(1, progress.current)) : 0;
          gl.uniform1f(uniform, growth);
          gl.uniform1f(liftUniform, earthLift(growth));
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        observer = new ResizeObserver(() => draw.current?.()); observer.observe(element);
        draw.current(); setReady(true);
      };
      image.onerror = () => setReady(false);
      image.src = soilTexture;
    } catch (error) {
      console.warn('立体土地渲染不可用，使用基础效果', error); setReady(false);
    }
    return () => {
      disposed = true; draw.current = undefined; observer?.disconnect();
      image.onload = image.onerror = null;
      element.removeEventListener('webglcontextlost', lost); element.removeEventListener('webglcontextrestored', restored);
      textures.forEach(texture => gl.deleteTexture(texture)); shaders.forEach(value => gl.deleteShader(value));
      if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program);
    };
  }, [generation]);
  useEffect(() => { draw.current?.(); }, [growth]);
  return <div className="earth-surface" aria-hidden="true">
    <canvas ref={canvas} data-renderer={ready ? 'webgl' : 'fallback'} />
    {!ready && <EarthFallback growth={growth} />}
  </div>;
}
