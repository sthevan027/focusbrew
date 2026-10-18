pub mod client;
pub mod models;

use chrono::{DateTime, Local, NaiveDate, TimeZone, Utc};

/// Local midnight at the start of `date`, as a UTC instant. Reports are bounded in local
/// days, so a naive UTC midnight would shift every day by the user's offset.
pub fn local_midnight(date: NaiveDate) -> DateTime<Utc> {
    let naive = date.and_hms_opt(0, 0, 0).expect("midnight is always valid");
    match Local.from_local_datetime(&naive).earliest() {
        Some(local) => local.with_timezone(&Utc),
        // Midnight falls inside a DST gap on some zones; fall back to the UTC reading.
        None => naive.and_utc(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Timelike;

    #[test]
    fn local_midnight_is_midnight_in_local_time() {
        let date = NaiveDate::from_ymd_opt(2026, 10, 17).unwrap();
        let local = local_midnight(date).with_timezone(&Local);
        assert_eq!(local.date_naive(), date);
        assert_eq!((local.hour(), local.minute(), local.second()), (0, 0, 0));
    }
}
