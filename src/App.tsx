import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { listen } from '@tauri-apps/api/event';
import * as bridge from './bridge';
import { fontSize, formatMl, HOUR, parseWater, scoreAt, timeLabel, validateConfig, type Config, type RuntimeInfo, type Snapshot } from './model';

function Drop({ small = false }: { small?: boolean }) {
  return <svg width={small ? 22 : 30} height={small ? 26 : 34} viewBox="0 0 30 34" fill="none" aria-hidden="true"><path d="M15 1C12 6 3 15 3 22a12 12 0 0 0 24 0C27 15 18 6 15 1Z" fill="currentColor"/><path d="M10 23c1 5 7 6 10 2" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function SettingsIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg>; }
function errorText(e: unknown) { return e instanceof Error ? e.message : String(e); }

function Settings({ snapshot, runtime, onSaved, onCancel }: { snapshot: Snapshot; runtime: RuntimeInfo | null; onSaved: (s: Snapshot) => void; onCancel: () => void }) {
  const [weight, setWeight] = useState(snapshot.config ? String(snapshot.config.weightJin) : '');
  const [start, setStart] = useState(snapshot.config?.startTime ?? '09:00');
  const [end, setEnd] = useState(snapshot.config?.endTime ?? '18:00');
  const [crack, setCrack] = useState(snapshot.config?.crackEnabled ?? true);
  const [autostart, setAutostart] = useState(runtime?.autostart ?? false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => { if (runtime) setAutostart(runtime.autostart); }, [runtime?.autostart]);
  async function save(e: FormEvent) {
    e.preventDefault(); if (savingRef.current) return;
    try {
      if (!/^\d+$/.test(weight)) throw new Error('体重请填写大于0的整数，单位为斤');
      const config: Config = { weightJin: Number(weight), startTime: start, endTime: end, crackEnabled: crack };
      validateConfig(config); setError(''); savingRef.current = true; setSaving(true);
      onSaved(await bridge.saveConfig(config, autostart));
    } catch (e) { setError(errorText(e)); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <form className="settings" onSubmit={save} noValidate>
    <div className="intro-mark"><Drop /></div>
    <h2>{snapshot.config ? '把提醒调到你的节奏' : '给今天安排点水分'}</h2>
    <p className="intro-copy">{snapshot.config ? '饮水记录会保留，保存后按新设置重新计算。' : '设置体重和工作时间，剩下的交给我。'}</p>
    <fieldset disabled={saving}>
      <label className="field-label" htmlFor="weight">体重 <span>斤</span></label>
      <input id="weight" inputMode="numeric" autoComplete="off" placeholder="例如 120" value={weight} onChange={e=>setWeight(e.target.value)} aria-describedby={error ? 'settings-error' : undefined} />
      <div className="time-fields">
        <label>上班时间<input aria-label="上班时间" type="time" value={start} onChange={e=>setStart(e.target.value)} /></label>
        <label>下班时间<input aria-label="下班时间" type="time" value={end} onChange={e=>setEnd(e.target.value)} /></label>
      </div>
      <p className="field-note">按当天工作时段提醒，最晚到19:00。</p>
      <label className="switch-row"><span><strong>登录时启动</strong><small>自动在后台开始今天的提醒</small></span><input type="checkbox" role="switch" checked={autostart} onChange={e=>setAutostart(e.target.checked)} /></label>
      <label className="switch-row"><span><strong>屏幕干裂提醒</strong><small>右下角泥土逐渐干裂、翘边，喝水后收拢消退</small></span><input type="checkbox" role="switch" checked={crack} onChange={e=>setCrack(e.target.checked)} /></label>
    </fieldset>
    <p className="system-note">系统通知由电脑管理。未收到提醒时，请在系统设置中允许“别太干巴了”发送通知。</p>
    {error && <p id="settings-error" className="error" role="alert">{error}</p>}
    <button className="primary" type="submit" disabled={saving}>{saving ? '正在保存…' : snapshot.config ? '保存设置' : '保存并开始'}</button>
    {snapshot.config && <button className="text-button cancel" type="button" onClick={onCancel} disabled={saving}>返回</button>}
  </form>;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pending = useRef<{id: string; amount: string} | null>(null);
  const [now, setNow] = useState(bridge.currentTime());
  const [metricWidth, setMetricWidth] = useState(340);
  const metric = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    if (!bridge.native && !bridge.demo) return;
    try { setSnapshot(await bridge.getSnapshot()); }
    catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => {
    if (!bridge.native && !bridge.demo) return;
    void refresh();
    void bridge.getRuntime().then(setRuntime).catch(e=>setError(errorText(e)));
    let frame = 0;
    const draw = () => { setNow(bridge.currentTime()); frame = requestAnimationFrame(draw); };
    const visibility = () => { cancelAnimationFrame(frame); if (!document.hidden) { void refresh(); void bridge.getRuntime().then(setRuntime).catch(()=>{}); draw(); } };
    draw();
    const poll = window.setInterval(()=>{ if (!document.hidden) void refresh(); }, 1500);
    const health = window.setInterval(()=>{ if (!document.hidden) void bridge.getRuntime().then(setRuntime).catch(()=>{}); }, 10000);
    document.addEventListener('visibilitychange', visibility);
    const listeners = bridge.native ? [listen('data-changed', ()=>void refresh()), listen<string>('backend-error', e=>setError(e.payload))] : [];
    return () => { cancelAnimationFrame(frame); clearInterval(poll); clearInterval(health); document.removeEventListener('visibilitychange', visibility); for (const p of listeners) void p.then(fn=>fn()); };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return; const timer = setTimeout(()=>setNotice(''), 3500); return ()=>clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!metric.current) return;
    const observer = new ResizeObserver(entries=>setMetricWidth(entries[0].contentRect.width));
    observer.observe(metric.current); return ()=>observer.disconnect();
  }, [snapshot?.config, settings]);
  async function drink(e: FormEvent) {
    e.preventDefault(); if (busyRef.current) return;
    try {
      parseWater(amount); setError(''); busyRef.current = true; setBusy(true);
      if (!pending.current || pending.current.amount !== amount) pending.current = { id: crypto.randomUUID(), amount };
      const next = await bridge.recordWater(pending.current.id, amount);
      setSnapshot(next); pending.current = null; setAmount(''); setNow(bridge.currentTime());
      setNotice(next.completed ? '今天的目标完成啦' : '这口水，记下了');
    } catch (e) { setError(errorText(e)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function skip() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { setSnapshot(await bridge.skipReminder()); setAmount(''); pending.current = null; setError(''); }
    catch (e) { setError(errorText(e)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function saved(next: Snapshot) { setSnapshot(next); setSettings(false); setError(''); void bridge.getRuntime().then(setRuntime).catch(()=>{}); setNotice(snapshot?.config ? '已按新设置重新计算' : '开始今天的水灵生活'); }

  if (!bridge.native && !bridge.demo) return <main className="browser-gate"><div className="brand-mark"><Drop/></div><h1>别太干巴了</h1><p>这是一款菜单栏／托盘喝水提醒应用。</p><p>日常使用请打开已安装的桌面版本。</p><a href="?demo=1">打开开发演示</a></main>;
  const score = snapshot ? scoreAt(now, snapshot) : 0;
  const completed = snapshot?.completed ?? false;
  const before = snapshot ? now < snapshot.start : false;
  const ended = snapshot?.config ? now >= snapshot.end : false;
  const intensity = score >= 100 ? 'dry' : score >= 50 ? 'warm' : 'fresh';
  return <main className={`app ${intensity}`}>
    {bridge.demo && <div className="demo-banner">演示模式 · 独立数据，不发送真实提醒</div>}
    {runtime?.qa && <div className="demo-banner">测试构建 · 独立本地数据</div>}
    <header className="header"><div className="brand"><div className="brand-mark"><Drop small/></div><div><h1>别太干巴了</h1><p>STAY HYDRATED</p></div></div>
      {snapshot?.config && !settings && <button className="icon-button" type="button" aria-label="设置" title="设置" disabled={busy} onClick={()=>setSettings(true)}><SettingsIcon/></button>}
    </header>
    {!snapshot ? <div className="loading">{error ? <><p className="error" role="alert">{error}</p><button type="button" className="secondary" onClick={()=>void refresh()}>重试</button></> : '正在打开今天的水分计划…'}</div>
    : !snapshot.config || settings ? <Settings snapshot={snapshot} runtime={runtime} onSaved={saved} onCancel={()=>setSettings(false)} />
    : <>
      <div className="workline"><span className="live-dot"/>{before ? '还没到上班时间' : ended ? '今日提醒已结束' : completed ? '今天的目标已达成' : '今天也要水灵灵'}<span>{snapshot.config.startTime} — {timeLabel(snapshot.end)}</span></div>
      <section className={`metric-card ${completed ? 'is-complete' : ''}`} aria-label="今日饮水状态">
        <div className="metric-space" ref={metric}>
          {completed ? <div className="completion"><span className="completion-drop"><Drop/></span><h2>今天又是<br/>水灵灵的一天</h2><p>目标达成，今天不再催你啦。</p></div> : <><span className="metric-label">干巴值</span><div className="metric-number" data-testid="dryness" style={{fontSize:fontSize(score,metricWidth)}}>{score.toFixed(2)}</div><p className="metric-copy">{before ? '到点再提醒，现在不着急。' : score === 0 ? '当前进度刚刚好，水分在线。' : score >= 100 ? '有点干巴了，记得喝口水。' : '再忙，也给自己留一口水。'}</p></>}
        </div>
        <div className="progress-heading"><span>今日已喝 <strong>{formatMl(snapshot.actualUnits)}</strong> mL</span><span>目标 {formatMl(snapshot.targetUnits)} mL</span></div>
        <div className="progress-track" role="progressbar" aria-label="今日饮水进度" aria-valuemin={0} aria-valuemax={snapshot.targetUnits} aria-valuenow={Math.min(snapshot.actualUnits,snapshot.targetUnits)}><div style={{width:`${Math.min(100,snapshot.actualUnits/snapshot.targetUnits*100)}%`}}/></div>
      </section>
      <section className="next-reminder" aria-label="提醒计划"><span className="clock-icon" aria-hidden="true">◷</span><div><span>{completed ? '今日提醒已完成' : ended ? '今日提醒已结束' : score === 0 && !before ? '当前不用补水' : '下一次提醒'}</span><strong>{completed ? '明天继续水灵灵' : ended ? '仍然可以记录喝水' : snapshot.nextReminderAt ? timeLabel(snapshot.nextReminderAt) : '今天暂无后续提醒'}</strong></div><small>{!completed && !ended && score>0 ? `${score<50?60:score<100?30:15}分钟 / 次` : '按干巴值调整'}</small></section>
      {snapshot.reminderActive && <section className="active-reminder" role="status"><div><strong>该补点水了</strong><p>本时段建议 {formatMl(snapshot.suggestedUnits)} mL，按实际喝的量记录。</p></div><button type="button" onClick={()=>void skip()} disabled={busy}>暂时不喝水</button></section>}
      <form className="drink-form" onSubmit={drink} noValidate><label htmlFor="amount">刚刚喝了多少？</label><div className="amount-field"><input id="amount" aria-label="喝水量" autoComplete="off" inputMode="decimal" placeholder="输入实际喝水量" value={amount} onChange={e=>{setAmount(e.target.value); if(pending.current?.amount!==e.target.value) pending.current=null;}} disabled={busy}/><span>mL</span></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? '正在记录…' : '已喝水'}<span aria-hidden="true">↗</span></button>
      </form>
      {runtime?.backgroundError && <p className="error" role="alert">{runtime.backgroundError}</p>}
      <p className="background-note">关闭窗口后，菜单栏／托盘里的我会继续提醒。</p>
    </>}
    {notice && <div className="toast" role="status">✓ {notice}</div>}
    <footer>数据只留在这台电脑 · 干巴值为提醒分数</footer>
    {bridge.demo && snapshot && <aside className="demo-controls"><span>{timeLabel(now)} · 开发时钟</span><div>{[0,1,2,3].map(h=><button type="button" key={h} onClick={()=>{const d=new Date(now);d.setHours(9,0,0,0);bridge.setDemoClock(d.getTime()+h*HOUR);void refresh();}}>{h===0?'上班时刻':`${h}小时后`}</button>)}<button type="button" onClick={()=>{bridge.resetDemo();setAmount('');void refresh();}}>重置演示</button></div></aside>}
  </main>;
}
