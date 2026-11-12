use crate::core::{self, Config, Period};
use chrono::{Local, NaiveTime, TimeZone};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;

pub struct Store {
    pub conn: Connection,
}

#[derive(Default, Clone, Debug)]
pub struct DayState {
    pub anchor: Option<i64>,
    // Read only in upgrade tests; the legacy column no longer limits the effect.
    #[cfg(test)]
    pub cracked: bool,
    pub active: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub now: i64,
    pub local_date: String,
    pub config: Option<Config>,
    pub target_units: i64,
    pub actual_units: i64,
    pub start: i64,
    pub end: i64,
    pub score: f64,
    pub completed: bool,
    pub next_reminder_at: Option<i64>,
    pub suggested_units: i64,
    pub interval_minutes: Option<i64>,
    pub reminder_active: bool,
    pub periods: Vec<Period>,
}

pub fn local_day(now: i64) -> Result<String, String> {
    Ok(Local
        .timestamp_millis_opt(now)
        .single()
        .ok_or("系统时间无效")?
        .format("%Y-%m-%d")
        .to_string())
}

pub fn bounds(config: &Config, now: i64) -> Result<(i64, i64), String> {
    config.target()?;
    let date = Local
        .timestamp_millis_opt(now)
        .single()
        .ok_or("系统时间无效")?
        .date_naive();
    let start =
        NaiveTime::parse_from_str(&config.start_time, "%H:%M").map_err(|e| e.to_string())?;
    let end_minute = core::clock_minutes(&config.end_time)?.min(19 * 60);
    let end = NaiveTime::from_hms_opt((end_minute / 60) as u32, (end_minute % 60) as u32, 0)
        .ok_or("截止时间无效")?;
    let to_ms = |time| {
        Local
            .from_local_datetime(&date.and_time(time))
            .earliest()
            .map(|v| v.timestamp_millis())
            .ok_or_else(|| "该时区中的工作时间不存在，请修改时间".to_string())
    };
    let (s, e) = (to_ms(start)?, to_ms(end)?);
    if e <= s {
        return Err("有效工作时段为空，请修改设置".into());
    }
    Ok((s, e))
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        Self::init(Connection::open(path).map_err(|e| e.to_string())?)
    }
    fn init(conn: Connection) -> Result<Self, String> {
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS drinks (id TEXT PRIMARY KEY, units INTEGER NOT NULL CHECK(units>0), recorded_at INTEGER NOT NULL, local_date TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS drinks_day ON drinks(local_date);
            CREATE TABLE IF NOT EXISTS reminder_days (local_date TEXT PRIMARY KEY, anchor INTEGER, cracked INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 0);
            PRAGMA user_version=1;") .map_err(|e| e.to_string())?;
        conn.busy_timeout(std::time::Duration::from_secs(3))
            .map_err(|e| e.to_string())?;
        Ok(Self { conn })
    }
    pub fn config(&self) -> Result<Option<Config>, String> {
        let raw: Option<String> = self
            .conn
            .query_row("SELECT config FROM settings WHERE id=1", [], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        raw.map(|v| serde_json::from_str(&v).map_err(|_| "配置文件无法读取，请重新保存设置".into()))
            .transpose()
    }
    pub fn state(&self, day: &str) -> Result<DayState, String> {
        self.conn
            .query_row(
                "SELECT anchor, cracked, active FROM reminder_days WHERE local_date=?",
                [day],
                |r| {
                    Ok(DayState {
                        anchor: r.get(0)?,
                        #[cfg(test)]
                        cracked: r.get(1)?,
                        active: r.get(2)?,
                    })
                },
            )
            .optional()
            .map(|v| v.unwrap_or_default())
            .map_err(|e| e.to_string())
    }
    pub fn snapshot(&self, now: i64) -> Result<Snapshot, String> {
        let day = local_day(now)?;
        let config = self.config()?;
        let actual: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE(SUM(units),0) FROM drinks WHERE local_date=?",
                [&day],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let state = self.state(&day)?;
        let mut v = Snapshot {
            now,
            local_date: day,
            config: config.clone(),
            actual_units: actual,
            target_units: 0,
            start: 0,
            end: 0,
            score: 0.0,
            completed: false,
            next_reminder_at: None,
            suggested_units: 0,
            interval_minutes: None,
            reminder_active: false,
            periods: vec![],
        };
        if let Some(c) = config {
            let (s, e) = bounds(&c, now)?;
            v.target_units = c.target()?;
            v.start = s;
            v.end = e;
            v.score = core::dryness(now, s, e, v.target_units, actual);
            v.completed = actual >= v.target_units;
            v.periods = core::periods(v.target_units, s, e);
            v.next_reminder_at =
                core::next_reminder(now, s, e, v.target_units, actual, state.anchor);
            v.interval_minutes = core::interval_ms(v.score).map(|v| v / 60000);
            v.suggested_units = v
                .periods
                .iter()
                .find(|p| now >= p.start && now < p.end)
                .map(|p| p.units.min((v.target_units - actual).max(0)))
                .unwrap_or(0);
            v.reminder_active =
                state.active && !v.completed && now >= s && now < e && v.score > 0.0;
        }
        Ok(v)
    }
    pub fn save_config(&mut self, config: &Config, now: i64) -> Result<(), String> {
        bounds(config, now)?;
        let day = local_day(now)?;
        let raw = serde_json::to_string(config).map_err(|e| e.to_string())?;
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO settings(id,config) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config", [raw]).map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO reminder_days(local_date,anchor,active) VALUES(?,?,0) ON CONFLICT(local_date) DO UPDATE SET anchor=excluded.anchor,active=0", params![day, now]).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn record(&mut self, id: &str, amount: &str, now: i64) -> Result<(), String> {
        if id.is_empty()
            || id.len() > 80
            || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
        {
            return Err("记录标识无效，请重试".into());
        }
        let units = core::parse_water(amount)?;
        if self.config()?.is_none() {
            return Err("请先完成设置".into());
        }
        let day = local_day(now)?;
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        let previous: Option<i64> = tx
            .query_row("SELECT units FROM drinks WHERE id=?", [id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(previous) = previous {
            if previous != units {
                return Err("这笔记录已保存，请重新输入新的水量".into());
            }
            return Ok(()); // Idempotent retry: don't move the reminder anchor again.
        }
        let actual: i64 = tx
            .query_row(
                "SELECT COALESCE(SUM(units),0) FROM drinks WHERE local_date=?",
                [&day],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if actual
            .checked_add(units)
            .is_none_or(|n| n > core::MAX_UNITS)
        {
            return Err("今日累计水量超出可安全计算范围".into());
        }
        tx.execute(
            "INSERT INTO drinks(id,units,recorded_at,local_date) VALUES(?,?,?,?)",
            params![id, units, now, day],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO reminder_days(local_date,anchor,active) VALUES(?,?,0) ON CONFLICT(local_date) DO UPDATE SET anchor=excluded.anchor,active=0", params![day, now]).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn skip(&self, now: i64) -> Result<(), String> {
        self.conn.execute("INSERT INTO reminder_days(local_date,anchor,active) VALUES(?,?,0) ON CONFLICT(local_date) DO UPDATE SET anchor=excluded.anchor,active=0", params![local_day(now)?, now]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn mark_reminder(&self, now: i64, cracked: bool) -> Result<(), String> {
        self.conn.execute("INSERT INTO reminder_days(local_date,anchor,cracked,active) VALUES(?,?,?,1) ON CONFLICT(local_date) DO UPDATE SET anchor=excluded.anchor,cracked=MAX(reminder_days.cracked,excluded.cracked),active=1", params![local_day(now)?, now, cracked]).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> Store {
        Store::init(Connection::open_in_memory().unwrap()).unwrap()
    }
    fn now() -> i64 {
        Local
            .with_ymd_and_hms(2026, 11, 11, 11, 0, 0)
            .earliest()
            .unwrap()
            .timestamp_millis()
    }
    fn config() -> Config {
        Config {
            weight_jin: 121,
            start_time: "09:00".into(),
            end_time: "17:00".into(),
            crack_enabled: true,
        }
    }

    #[test]
    fn continuous_crack_ignores_old_daily_claims_and_does_not_move_anchor() {
        let mut s = store();
        let t = now();
        s.save_config(&config(), t).unwrap();
        // A v0.1.1 daily claim must not suppress the new continuous effect.
        s.mark_reminder(t, true).unwrap();
        let before = s.state(&local_day(t).unwrap()).unwrap();
        let v = s.snapshot(t + 1000).unwrap();
        assert_eq!(
            core::crack_score(v.now, (v.start, v.end), v.score, true),
            100.0
        );
        assert_eq!(s.state(&v.local_date).unwrap().anchor, before.anchor);
        s.record("repair", "300", t + 1000).unwrap();
        let v = s.snapshot(t + 1000).unwrap();
        let reduced = core::crack_score(v.now, (v.start, v.end), v.score, true);
        assert!(reduced > 0.0 && reduced < 100.0);
        s.skip(t + 2000).unwrap();
        let v = s.snapshot(t + 2000).unwrap();
        assert!(core::crack_score(v.now, (v.start, v.end), v.score, true) > 0.0);
        s.record("clear", "1000", t + 3000).unwrap();
        let v = s.snapshot(t + 3000).unwrap();
        assert_eq!(
            core::crack_score(v.now, (v.start, v.end), v.score, true),
            0.0
        );
    }
    #[test]
    fn idempotency_and_exact_completion() {
        let mut s = store();
        let t = now();
        s.save_config(&config(), t).unwrap();
        s.record("a", "2000", t).unwrap();
        s.record("a", "2000", t + 1000).unwrap();
        assert!(s.record("a", "100", t).is_err());
        s.record("b", "117.49", t).unwrap();
        assert!(!s.snapshot(t).unwrap().completed);
        s.record("c", "0.01", t).unwrap();
        let v = s.snapshot(t).unwrap();
        assert!(v.completed);
        assert_eq!(v.actual_units, 211750);
        assert_eq!(v.next_reminder_at, None);
    }
    #[test]
    fn edits_preserve_records_and_suppress_immediate_reminders() {
        let mut s = store();
        let t = now();
        s.save_config(&config(), t).unwrap();
        s.record("a", "100", t).unwrap();
        let mut c = config();
        c.weight_jin = 120;
        s.save_config(&c, t + 1000).unwrap();
        let v = s.snapshot(t + 1000).unwrap();
        assert_eq!(v.actual_units, 10000);
        assert!(v.next_reminder_at.unwrap() > t + 1000);
        assert_eq!(s.snapshot(t + 86400000).unwrap().actual_units, 0);
    }
    #[test]
    fn reminder_flags_and_skip_do_not_change_water() {
        let mut s = store();
        let t = now();
        s.save_config(&config(), t).unwrap();
        s.mark_reminder(t, true).unwrap();
        assert!(s.state(&local_day(t).unwrap()).unwrap().cracked);
        s.skip(t + 1000).unwrap();
        let v = s.snapshot(t + 1000).unwrap();
        assert_eq!(v.actual_units, 0);
        assert_eq!(v.score, 100.0);
        assert!(!v.reminder_active);
        assert!(s.state(&local_day(t).unwrap()).unwrap().cracked);
        assert!(!s.state(&local_day(t + 86400000).unwrap()).unwrap().cracked);
    }
    #[test]
    fn failed_record_is_atomic() {
        let mut s = store();
        let t = now();
        s.save_config(&config(), t).unwrap();
        s.record("a", "90071992547409.91", t).unwrap();
        assert!(s.record("b", "0.01", t).is_err());
        assert_eq!(s.snapshot(t).unwrap().actual_units, core::MAX_UNITS);
        assert!(s
            .conn
            .query_row("SELECT id FROM drinks WHERE id='b'", [], |r| r
                .get::<_, String>(0))
            .optional()
            .unwrap()
            .is_none());
    }
    #[test]
    fn disk_reopen_preserves_config_water_and_anchor() {
        let path =
            std::env::temp_dir().join(format!("hydration-test-{}.sqlite", std::process::id()));
        let t = now();
        {
            let mut s = Store::open(&path).unwrap();
            s.save_config(&config(), t).unwrap();
            s.record("persistent", "250.25", t).unwrap();
            s.mark_reminder(t + 1000, true).unwrap();
        }
        {
            let s = Store::open(&path).unwrap();
            let v = s.snapshot(t + 2000).unwrap();
            assert_eq!(v.actual_units, 25025);
            assert_eq!(v.config.unwrap().weight_jin, 121);
            assert!(s.state(&local_day(t).unwrap()).unwrap().cracked);
            assert!(v.next_reminder_at.unwrap() > t + 2000);
        }
        let _ = std::fs::remove_file(path);
    }
}
