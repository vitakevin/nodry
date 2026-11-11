export interface Config { weightJin: number; startTime: string; endTime: string; crackEnabled: boolean }
export interface Period { start: number; end: number; units: number }
export interface Snapshot {
  now: number; localDate: string; config: Config | null;
  targetUnits: number; actualUnits: number; start: number; end: number;
  score: number; completed: boolean; nextReminderAt: number | null;
  suggestedUnits: number; intervalMinutes: number | null; reminderActive: boolean; periods: Period[];
}
export interface RuntimeInfo { autostart: boolean; backgroundError: string | null; notificationStatus: string; qa: boolean }
export const HOUR = 3_600_000;

export function scoreAt(now: number, s: Pick<Snapshot, 'start'|'end'|'targetUnits'|'actualUnits'>): number {
  if (s.end <= s.start || s.targetUnits <= 0 || s.actualUnits >= s.targetUnits) return 0;
  const progress = Math.max(0, Math.min(1, (now - s.start) / (s.end - s.start)));
  const deficit = Math.max(0, s.targetUnits * progress - s.actualUnits);
  return Math.min(100, deficit / (s.targetUnits * HOUR / (s.end - s.start)) * 50);
}
export function parseWater(value: string): number {
  const text = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('请输入大于0的水量，最多两位小数');
  const [whole, cents = ''] = text.split('.');
  const units = BigInt(whole) * 100n + BigInt(cents.padEnd(2, '0'));
  if (units <= 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('水量必须大于0，且不能超出可安全计算范围');
  return Number(units);
}
export function validateConfig(c: Config) {
  if (!Number.isSafeInteger(c.weightJin) || c.weightJin <= 0 || c.weightJin > Math.floor(Number.MAX_SAFE_INTEGER / 1750)) throw new Error('体重必须是可安全计算的正整数斤');
  const minutes = (t: string) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error('请输入有效的上下班时间');
    const [h, m] = t.split(':').map(Number); return h * 60 + m;
  };
  if (Math.min(minutes(c.endTime), 19 * 60) <= minutes(c.startTime)) throw new Error('下班时间须晚于上班时间，且上班时间须早于19:00；本版不处理夜班');
}
export function nextReminder(now: number, s: Pick<Snapshot, 'start'|'end'|'targetUnits'|'actualUnits'>, anchor: number | null): number | null {
  if (now >= s.end || s.targetUnits <= 0 || s.actualUnits >= s.targetUnits) return null;
  const zero = s.start + (s.end - s.start) * s.actualUnits / s.targetUnits;
  const base = Math.max(anchor ?? Math.ceil(zero), Math.ceil(zero));
  const bands = [[Math.floor(zero) + 1, Math.ceil(zero + HOUR), HOUR], [Math.ceil(zero + HOUR), Math.ceil(zero + HOUR * 2), HOUR / 2], [Math.ceil(zero + HOUR * 2), s.end, HOUR / 4]];
  for (const [lo, rawHi, interval] of bands) {
    const hi = Math.min(rawHi, s.end);
    if (hi <= now || hi <= lo) continue;
    const candidate = Math.max(base + interval, lo, now, s.start);
    if (candidate < hi) return candidate;
  }
  return null;
}
export function formatMl(units: number): string {
  // Format integer units without float multiplication or scientific notation.
  const n = BigInt(units), whole = n / 100n, cents = (n % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return whole.toString() + (cents ? `.${cents}` : '');
}
export function fontSize(score: number, width: number): number {
  const min = 38, max = Math.max(min, Math.min(128, (width - 20) / 3.65));
  const growth = Math.expm1(3 * Math.max(0, Math.min(1, score / 100))) / Math.expm1(3);
  return min + (max - min) * growth;
}
export function timeLabel(ms: number): string { return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
