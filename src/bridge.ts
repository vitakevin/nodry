import { invoke, isTauri } from '@tauri-apps/api/core';
import { HOUR, nextReminder, parseWater, scoreAt, validateConfig, type Config, type RuntimeInfo, type Snapshot } from './model';

export const native = isTauri();
export const demo = !native && new URLSearchParams(location.search).get('demo') === '1';
const KEY = 'stay-hydrated.developer-demo.v1';
interface DemoData { config: Config | null; drinks: { id: string; units: number; day: string }[]; anchor: number | null; clock: number; autostart: boolean }
let offset = 0;
function emptyDemo(): DemoData {
  const d = new Date(); d.setHours(9, 0, 0, 0);
  return { config: null, drinks: [], anchor: null, clock: d.getTime(), autostart: false };
}
function read(): DemoData {
  if (!demo) throw new Error('请在桌面应用中使用');
  const saved = localStorage.getItem(KEY);
  return saved ? JSON.parse(saved) as DemoData : emptyDemo();
}
function write(data: DemoData) { localStorage.setItem(KEY, JSON.stringify(data)); }
if (demo) offset = read().clock - Date.now();
export const currentTime = () => Date.now() + offset;
export function setDemoClock(ms: number) { const d = read(); d.clock = ms; offset = ms - Date.now(); write(d); }
export function resetDemo() { const d = emptyDemo(); write(d); offset = d.clock - Date.now(); }

function demoSnapshot(): Snapshot {
  const data = read(), now = currentTime(), date = new Date(now);
  const day = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const actualUnits = data.drinks.filter(d => d.day === day).reduce((n, d) => n + d.units, 0);
  const s: Snapshot = { now, localDate: day, config: data.config, actualUnits, targetUnits: 0, start: 0, end: 0, score: 0, completed: false, nextReminderAt: null, suggestedUnits: 0, intervalMinutes: null, reminderActive: false, periods: [] };
  if (data.config) {
    validateConfig(data.config);
    const stamp = (time: string) => { const d = new Date(now); const [h, m] = time.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); };
    s.start = stamp(data.config.startTime); s.end = Math.min(stamp(data.config.endTime), stamp('19:00'));
    s.targetUnits = data.config.weightJin * 1750; s.score = scoreAt(now, s); s.completed = actualUnits >= s.targetUnits;
    for (let cursor = s.start; cursor < s.end; cursor += HOUR) s.periods.push({ start: cursor, end: Math.min(cursor+HOUR,s.end), units: 0 });
    const remainders = s.periods.map((p, i) => {
      const numerator = BigInt(s.targetUnits) * BigInt(p.end-p.start), duration = BigInt(s.end-s.start);
      p.units = Number(numerator/duration); return { i, remainder: numerator%duration };
    }).sort((a, b) => a.remainder === b.remainder ? a.i-b.i : a.remainder > b.remainder ? -1 : 1);
    const missing = s.targetUnits-s.periods.reduce((n,p)=>n+p.units,0);
    for (const {i} of remainders.slice(0,missing)) s.periods[i].units++;
    s.suggestedUnits = Math.min(s.periods.find(p => now>=p.start && now<p.end)?.units ?? 0, Math.max(0,s.targetUnits-actualUnits));
    s.nextReminderAt = nextReminder(now,s,data.anchor);
    s.intervalMinutes = s.score <= 0 ? null : s.score < 50 ? 60 : s.score < 100 ? 30 : 15;
  }
  return s;
}
export async function getSnapshot(): Promise<Snapshot> { return native ? invoke('get_snapshot') : demoSnapshot(); }
export async function getRuntime(): Promise<RuntimeInfo> { return native ? invoke('get_runtime_info') : { autostart: read().autostart, backgroundError: null, notificationStatus: 'demo', qa: false }; }
export async function saveConfig(config: Config, autostart: boolean): Promise<Snapshot> {
  validateConfig(config);
  if (native) return invoke('save_config', { config, autostart });
  const d = read(); d.config = config; d.autostart = autostart; d.anchor = currentTime(); write(d); return demoSnapshot();
}
export async function recordWater(id: string, amount: string): Promise<Snapshot> {
  parseWater(amount);
  if (native) return invoke('record_water', { id, amount });
  const d = read(), snapshot = demoSnapshot(), units = parseWater(amount);
  if (!d.drinks.some(v => v.id === id)) {
    if (!Number.isSafeInteger(snapshot.actualUnits+units)) throw new Error('今日累计水量超出可安全计算范围');
    d.drinks.push({ id, units, day: snapshot.localDate }); d.anchor = currentTime(); write(d);
  }
  return demoSnapshot();
}
export async function skipReminder(): Promise<Snapshot> {
  if (native) return invoke('skip_reminder');
  const d = read(); d.anchor = currentTime(); write(d); return demoSnapshot();
}
