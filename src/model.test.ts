import { describe, expect, it } from 'vitest';
import { HOUR, fontSize, formatMl, nextReminder, parseWater, scoreAt, validateConfig } from './model';

const base = { start: 0, end: 8*HOUR, targetUnits: 210000, actualUnits: 0 };
describe('visible score stays consistent with native core fixtures',()=>{
  it.each([[0,0,'0.00'],[HOUR,0,'50.00'],[HOUR+800,0,'50.01'],[2*HOUR,30000,'42.86'],[3*HOUR,30000,'92.86'],[3*HOUR,78750,'0.00'],[3*HOUR,10000,'100.00'],[8*HOUR,210000,'0.00']])('time %s, actual %s',(now,actual,score)=>{
    expect(scoreAt(now,{...base,actualUnits:actual}).toFixed(2)).toBe(score);
  });
  it('keeps real precision for font scaling and bounds it at narrow widths',()=>{
    expect(fontSize(50.0001,300)).toBeGreaterThan(fontSize(50,300));
    expect(fontSize(75,340)-fontSize(50,340)).toBeGreaterThan(fontSize(25,340)-fontSize(0,340));
    expect(fontSize(100,300)*3.65).toBeLessThanOrEqual(300);
  });
});
describe('exact water input',()=>{
  it.each(['','0','-2','NaN','Infinity','1e2','1.234','1.','.5','90071992547409.92'])('rejects %s',value=>expect(()=>parseWater(value)).toThrow());
  it('keeps cents exact and formats without rounding',()=>{
    expect(parseWater('2117.50')).toBe(211750);
    expect(parseWater('0.01')).toBe(1);
    expect(formatMl(211750)).toBe('2117.5');
    expect(formatMl(210000)).toBe('2100');
    expect(formatMl(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
  });
});
describe('schedule and settings',()=>{
  it('predicts future band changes',()=>{
    expect(nextReminder(0,base,null)).toBe(HOUR);
    expect(nextReminder(2*HOUR-1,base,2*HOUR-600000)).toBe(2*HOUR+300000);
    expect(nextReminder(8*HOUR,base,null)).toBeNull();
    expect(nextReminder(HOUR,{...base,actualUnits:52500},null)).toBe(3*HOUR);
  });
  it('rejects unsupported overnight shifts and preserves odd jin',()=>{
    const config={weightJin:121,startTime:'09:30',endTime:'17:30',crackEnabled:true};
    expect(()=>validateConfig(config)).not.toThrow();
    expect(config.weightJin*1750).toBe(211750);
    expect(()=>validateConfig({...config,weightJin:120.5})).toThrow();
    expect(()=>validateConfig({...config,startTime:'19:00',endTime:'23:00'})).toThrow();
    expect(()=>validateConfig({...config,endTime:'08:00'})).toThrow();
  });
});
