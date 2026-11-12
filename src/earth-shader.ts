import { EARTH_GAP_INITIAL, EARTH_GAP_OPENING } from './crack-model';

export const earthVertex = `
attribute vec2 aPosition;
varying vec2 vUV;
void main() { vUV = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

export const earthFragment = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uField;
uniform sampler2D uSoil;
uniform float uGrowth;
uniform float uLift;
const vec2 domain = vec2(1000.0, 700.0);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
vec4 field(vec2 p) { return texture2D(uField, clamp(p / domain, 0.0, 1.0)); }
float radius() { return 1350.0*uGrowth + 24.0*(1.0-exp(-250.0*uGrowth)); }
float gap(vec4 f) {
  float age=clamp((radius()-f.a*1400.0+40.0)/200.0,0.0,1.0);
  return (${EARTH_GAP_INITIAL.toFixed(1)}*(1.0-exp(-500.0*uGrowth))+${EARTH_GAP_OPENING.toFixed(1)}*uGrowth*age)*f.g;
}
float edge(vec2 p) {
  vec4 f=field(p);
  return f.r*64.0 - gap(f)*0.5 + (noise(p*0.7)-0.5)*0.75*uGrowth;
}
float height(vec2 p) {
  vec4 f=field(p); float d=edge(p);
  if(d<0.0) return -3.0;
  // The perimeter rises while the middle stays low: a cup-shaped thin mud
  // flake, not a raised flat paving stone. Variation makes some lips curl more.
  float lift=(7.0+19.0*f.b)*uLift;
  float curl=exp(-d/(6.0+10.0*f.b));
  return lift*curl*(0.75+0.25*noise(p*0.09))
    +(texture2D(uSoil,p/1000.0).r-0.5)*0.65*uGrowth;
}
void main() {
  if(uGrowth<=0.0) { gl_FragColor=vec4(0); return; }
  vec2 screen=vec2(vUV.x,1.0-vUV.y)*domain;
  vec2 delta=domain-screen;
  float theta=atan(max(0.0,delta.y),max(0.0001,delta.x));
  float outline=1.0+0.025*sin(theta*12.0)+0.018*sin(theta*28.0);
  float reveal=1.0-smoothstep(radius()*outline-0.8,radius()*outline+0.8,length(delta));
  if(reveal<=0.0) { gl_FragColor=vec4(0); return; }
  vec2 p=screen;
  for(int i=0;i<3;i++) {
    float h=max(0.0,height(p));
    p=mix(p,screen+vec2(-0.045,0.16)*h,0.6);
  }
  vec4 f=field(p);
  float d=edge(p), h=height(p);
  vec3 normal=normalize(vec3(-(height(p+vec2(1,0))-height(p-vec2(1,0)))*0.5,
    -(height(p+vec2(0,1))-height(p-vec2(0,1)))*0.5,1.0));
  vec3 light=normalize(vec3(-0.65,-0.8,1.25));
  float diffuse=max(0.0,dot(normal,light));
  // Raised fragments cast short shadows into the depressed centers and gaps.
  float occlusion=0.0;
  for(int i=1;i<=3;i++) {
    float stepSize=float(i)*3.5;
    float blocker=height(p+normalize(light.xy)*stepSize);
    occlusion=max(occlusion,smoothstep(0.5,3.5,blocker-h-stepSize*0.75));
  }
  vec3 soil=texture2D(uSoil,p/1000.0).rgb*(0.91+0.15*f.b);
  float lighting=(0.43+0.69*diffuse)*(1.0-0.45*occlusion);
  soil*=lighting;
  float lip=exp(-max(d,0.0)*0.8)*uGrowth;
  soil=mix(soil,soil*vec3(0.70,0.60,0.48),lip*0.32);
  vec3 deep=vec3(0.085,0.050,0.027)*(0.85+0.2*noise(p*0.5));
  float face=smoothstep(-0.25,0.8,d);
  float wall=smoothstep(-2.0,0.6,d)*(1.0-face);
  deep=mix(deep,soil*vec3(0.58,0.48,0.36),wall*0.85);
  float fade=1.0-exp(-500.0*uGrowth);
  float alpha=mix(0.70+0.15*uGrowth,0.32+0.20*uGrowth,face)*fade*reveal;
  gl_FragColor=vec4(mix(deep,soil,face),alpha);
}
`;
