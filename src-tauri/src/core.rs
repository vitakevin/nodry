use serde::{Deserialize, Serialize};

pub const HOUR: i64 = 3_600_000;
pub const MAX_UNITS: i64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub weight_jin: i64,
    pub start_time: String,
    pub end_time: String,
    pub crack_enabled: bool,
}

pub fn clock_minutes(value: &str) -> Result<i64, String> {
    let b = value.as_bytes();
    if b.len() != 5 || b[2] != b':' || ![b[0], b[1], b[3], b[4]].iter().all(u8::is_ascii_digit) {
        return Err("时间请使用 HH:mm 格式".into());
    }
    let hour = (b[0] - b'0') as i64 * 10 + (b[1] - b'0') as i64;
    let minute = (b[3] - b'0') as i64 * 10 + (b[4] - b'0') as i64;
    if hour > 23 || minute > 59 {
        return Err("请输入有效时间".into());
    }
    Ok(hour * 60 + minute)
}

impl Config {
    pub fn target(&self) -> Result<i64, String> {
        let units = self
            .weight_jin
            .checked_mul(1750)
            .filter(|n| *n > 0 && *n <= MAX_UNITS)
            .ok_or("体重必须是可安全计算的正整数斤")?;
        let start = clock_minutes(&self.start_time)?;
        let end = clock_minutes(&self.end_time)?.min(19 * 60);
        if end <= start {
            return Err("下班时间须晚于上班时间，且上班时间须早于19:00；本版不处理夜班".into());
        }
        Ok(units)
    }
}

pub fn parse_water(value: &str) -> Result<i64, String> {
    // Decimal parsing only: never round or truncate the user's input.
    let value = value.trim();
    let pieces: Vec<_> = value.split('.').collect();
    if pieces.is_empty()
        || pieces.len() > 2
        || pieces[0].is_empty()
        || !pieces[0].bytes().all(|b| b.is_ascii_digit())
        || pieces
            .get(1)
            .is_some_and(|p| p.is_empty() || p.len() > 2 || !p.bytes().all(|b| b.is_ascii_digit()))
    {
        return Err("请输入大于0的水量，最多两位小数".into());
    }
    let whole: i64 = pieces[0].parse().map_err(|_| "水量超出可安全计算范围")?;
    let cents = match pieces.get(1) {
        Some(p) => p.parse::<i64>().unwrap() * if p.len() == 1 { 10 } else { 1 },
        None => 0,
    };
    whole
        .checked_mul(100)
        .and_then(|v| v.checked_add(cents))
        .filter(|v| *v > 0 && *v <= MAX_UNITS)
        .ok_or_else(|| "水量必须大于0，且不能超出可安全计算范围".into())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Period {
    pub start: i64,
    pub end: i64,
    pub units: i64,
}

pub fn periods(target: i64, start: i64, end: i64) -> Vec<Period> {
    let total = end - start;
    if total <= 0 || target <= 0 {
        return vec![];
    }
    let mut result = Vec::new();
    let mut remainders = Vec::new();
    let mut cursor = start;
    while cursor < end {
        let stop = (cursor + HOUR).min(end);
        let numerator = target as i128 * (stop - cursor) as i128;
        let units = (numerator / total as i128) as i64;
        remainders.push((result.len(), numerator % total as i128));
        result.push(Period {
            start: cursor,
            end: stop,
            units,
        });
        cursor = stop;
    }
    let missing = target - result.iter().map(|p| p.units).sum::<i64>();
    remainders.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    for (idx, _) in remainders.into_iter().take(missing as usize) {
        result[idx].units += 1;
    }
    result
}

pub fn dryness(now: i64, start: i64, end: i64, target: i64, actual: i64) -> f64 {
    if end <= start || target <= 0 || actual >= target {
        return 0.0;
    }
    let progress = ((now - start) as f64 / (end - start) as f64).clamp(0.0, 1.0);
    let expected = target as f64 * progress;
    let hourly = target as f64 * HOUR as f64 / (end - start) as f64;
    ((expected - actual as f64).max(0.0) / hourly * 50.0).min(100.0)
}

pub fn interval_ms(score: f64) -> Option<i64> {
    if score <= 0.0 {
        None
    } else if score < 50.0 {
        Some(HOUR)
    } else if score < 100.0 {
        Some(HOUR / 2)
    } else {
        Some(HOUR / 4)
    }
}

/// Continuous overlay state is independent of notification timing and daily flags.
pub fn crack_score(now: i64, work_time: (i64, i64), score: f64, enabled: bool) -> f64 {
    let (start, end) = work_time;
    if !enabled || now < start || now >= end || !score.is_finite() {
        return 0.0;
    }
    score.clamp(0.0, 100.0)
}

pub fn notification_due(
    now: i64,
    work_time: (i64, i64),
    score: f64,
    next_due: Option<i64>,
) -> bool {
    let (start, end) = work_time;
    now >= start
        && now < end
        && score.is_finite()
        && score > 0.0
        && next_due.is_some_and(|due| due <= now)
}

/// Earliest eligible alert, accounting for FUTURE band transitions.
/// Anchors are advanced only by real reminders, successful drinks, skips or settings.
/// A zero-score buffer is derived from actual water, never from app launch time.
pub fn next_reminder(
    now: i64,
    start: i64,
    end: i64,
    target: i64,
    actual: i64,
    anchor: Option<i64>,
) -> Option<i64> {
    if now >= end || actual >= target || target <= 0 || end <= start {
        return None;
    }
    let zero_at = start as f64 + (end - start) as f64 * actual as f64 / target as f64;
    let onset = zero_at.floor() as i64 + 1;
    let at50 = (zero_at + HOUR as f64).ceil() as i64;
    let at100 = (zero_at + HOUR as f64 * 2.0).ceil() as i64;
    let base = anchor
        .unwrap_or(zero_at.ceil() as i64)
        .max(zero_at.ceil() as i64);
    for (lo, hi, interval) in [
        (onset, at50, HOUR),
        (at50, at100, HOUR / 2),
        (at100, end, HOUR / 4),
    ] {
        let hi = hi.min(end);
        if hi <= now || hi <= lo {
            continue;
        }
        let candidate = (base + interval).max(lo).max(now).max(start);
        if candidate < hi {
            return Some(candidate);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    fn score(hours: f64, units: i64) -> f64 {
        dryness((hours * HOUR as f64) as i64, 0, 8 * HOUR, 210000, units)
    }
    fn config(weight: i64) -> Config {
        Config {
            weight_jin: weight,
            start_time: "09:00".into(),
            end_time: "17:00".into(),
            crack_enabled: true,
        }
    }

    #[test]
    fn continuous_crack_starts_with_fractional_scores_and_recedes() {
        let now = HOUR;
        for score in [
            0.0, 0.01, 1.0, 19.99, 20.01, 49.99, 50.01, 79.99, 80.01, 100.0, 42.5, 0.0,
        ] {
            assert_eq!(crack_score(now, (0, 8 * HOUR), score, true), score);
        }
        assert_eq!(crack_score(now, (0, 8 * HOUR), 120.0, true), 100.0);
        assert_eq!(crack_score(now, (0, 8 * HOUR), -1.0, true), 0.0);
    }

    #[test]
    fn continuous_crack_respects_switch_work_time_and_invalid_scores() {
        for (now, score, enabled) in [
            (-1, 100.0, true),
            (8 * HOUR, 100.0, true),
            (HOUR, 100.0, false),
            (HOUR, f64::NAN, true),
            (HOUR, f64::INFINITY, true),
        ] {
            assert_eq!(crack_score(now, (0, 8 * HOUR), score, enabled), 0.0);
        }
    }

    #[test]
    fn continuous_crack_does_not_accelerate_normal_notifications() {
        let now = 2 * HOUR;
        assert_eq!(crack_score(now, (0, 8 * HOUR), 100.0, true), 100.0);
        assert!(!notification_due(now, (0, 8 * HOUR), 100.0, None));
        assert!(!notification_due(
            now,
            (0, 8 * HOUR),
            100.0,
            Some(now + HOUR / 4)
        ));
        assert!(notification_due(
            now + HOUR / 4,
            (0, 8 * HOUR),
            100.0,
            Some(now + HOUR / 4)
        ));
        assert!(!notification_due(8 * HOUR, (0, 8 * HOUR), 100.0, Some(now)));
        assert!(!notification_due(now, (0, 8 * HOUR), 0.0, Some(now)));
    }

    #[test]
    fn targets_and_validation() {
        assert_eq!(config(120).target().unwrap(), 210000);
        assert_eq!(config(121).target().unwrap(), 211750);
        assert!(config(0).target().is_err());
        assert!(config(i64::MAX).target().is_err());
        let mut c = config(120);
        c.start_time = "19:00".into();
        c.end_time = "23:00".into();
        assert!(c.target().is_err());
        c.start_time = "9:00".into();
        assert!(c.target().is_err());
        for bad in ["24:00", "09:60", "aa:bb", "00:000"] {
            assert!(clock_minutes(bad).is_err());
        }
    }
    #[test]
    fn exact_decimal_input() {
        for bad in [
            "",
            "0",
            "0.00",
            "-1",
            "NaN",
            "inf",
            "1e3",
            "1.001",
            "1.",
            ".5",
            "1.2.3",
            "90071992547409.92",
        ] {
            assert!(parse_water(bad).is_err(), "{bad}");
        }
        assert_eq!(parse_water("2117.50").unwrap(), 211750);
        assert_eq!(parse_water("0.01").unwrap(), 1);
        assert_eq!(parse_water("300").unwrap(), 30000);
        assert_eq!(parse_water("90071992547409.91").unwrap(), MAX_UNITS);
    }
    #[test]
    fn scoring_examples_and_real_deficit() {
        assert_eq!(score(0.0, 0), 0.0);
        assert_eq!(score(1.0, 0), 50.0);
        assert_eq!(score(2.0, 0), 100.0);
        assert_eq!(format!("{:.2}", score(2.0, 30000)), "42.86");
        assert_eq!(format!("{:.2}", score(3.0, 30000)), "92.86");
        assert_eq!(score(3.0, 78750), 0.0);
        assert_eq!(score(3.0, 10000), 100.0);
        assert_eq!(score(8.0, 210000), 0.0);
        assert_eq!(score(20.0, 190000), score(8.0, 190000));
        assert_eq!(
            format!("{:.2}", dryness(HOUR + 800, 0, 8 * HOUR, 210000, 0)),
            "50.01"
        );
        assert_eq!(dryness(-1, 0, 8 * HOUR, 210000, 0), 0.0);
    }
    #[test]
    fn period_totals_and_tie_breaking() {
        let p = periods(210000, 0, HOUR * 7 + HOUR / 2);
        assert_eq!(p.len(), 8);
        assert!(p[..7].iter().all(|p| p.units == 28000));
        assert_eq!(p[7].units, 14000);
        assert_eq!(
            periods(5, 0, 3 * HOUR)
                .iter()
                .map(|p| p.units)
                .collect::<Vec<_>>(),
            vec![2, 2, 1]
        );
        for target in [1, 17, 211750, MAX_UNITS] {
            assert_eq!(
                periods(target, 12345, 7 * HOUR + 123)
                    .iter()
                    .map(|p| p.units)
                    .sum::<i64>(),
                target
            );
        }
    }
    #[test]
    fn adaptive_schedule_accounts_for_upcoming_bands() {
        let end = 8 * HOUR;
        assert_eq!(next_reminder(0, 0, end, 210000, 0, None), Some(HOUR));
        assert_eq!(
            next_reminder(HOUR, 0, end, 210000, 0, Some(HOUR)),
            Some(HOUR + HOUR / 2)
        );
        assert_eq!(
            next_reminder(2 * HOUR, 0, end, 210000, 0, Some(2 * HOUR)),
            Some(2 * HOUR + HOUR / 4)
        );
        // After a recent response, reaching 100 shortens the upcoming interval.
        assert_eq!(
            next_reminder(
                2 * HOUR - 1,
                0,
                end,
                210000,
                0,
                Some(2 * HOUR - 10 * 60_000)
            ),
            Some(2 * HOUR + 5 * 60_000)
        );
        // Prepaid water creates a real buffer; opening the app doesn't restart it.
        assert_eq!(
            next_reminder(HOUR, 0, end, 210000, 52500, None),
            Some(3 * HOUR)
        );
    }
    #[test]
    fn resume_stop_and_config_suppression() {
        assert_eq!(
            next_reminder(5 * HOUR, 0, 8 * HOUR, 210000, 0, Some(HOUR)),
            Some(5 * HOUR)
        );
        assert_eq!(
            next_reminder(5 * HOUR, 0, 8 * HOUR, 210000, 0, Some(5 * HOUR)),
            Some(5 * HOUR + HOUR / 4)
        );
        assert_eq!(next_reminder(8 * HOUR, 0, 8 * HOUR, 210000, 0, None), None);
        assert_eq!(next_reminder(HOUR, 0, 8 * HOUR, 210000, 210000, None), None);
        assert_eq!(interval_ms(49.999), Some(HOUR));
        assert_eq!(interval_ms(50.0), Some(HOUR / 2));
        assert_eq!(interval_ms(99.999), Some(HOUR / 2));
        assert_eq!(interval_ms(100.0), Some(HOUR / 4));
    }
}
