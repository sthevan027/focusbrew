use chrono::{DateTime, Duration, TimeZone, Utc};
use focusbrew_tracker::recorder::Recorder;

fn t(secs: i64) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 17, 12, 0, 0).unwrap() + Duration::seconds(secs)
}

#[test]
fn checkpoint_writes_span_so_far_and_keeps_segment_open() {
    let mut r = Recorder::default();
    r.observe(Some(("Code.exe", false)), t(0));

    let part = r.checkpoint(t(60)).expect("checkpoint writes the span so far");
    assert_eq!(part.started_at, t(0));
    assert_eq!(part.ended_at, Some(t(60)));

    assert!(r.observe(Some(("Code.exe", false)), t(61)).is_none(), "same app keeps going");
    let rest = r.finish(t(120)).expect("remainder is flushed");
    assert_eq!(rest.started_at, t(60), "no gap and no overlap with the checkpointed span");
    assert_eq!(rest.ended_at, Some(t(120)));
}

#[test]
fn checkpoint_without_open_segment_writes_nothing() {
    assert!(Recorder::default().checkpoint(t(1)).is_none());
}

#[test]
fn same_app_and_idle_state_keeps_segment_open() {
    let mut r = Recorder::default();
    assert!(r.observe(Some(("Code.exe", false)), t(0)).is_none());
    assert!(r.observe(Some(("Code.exe", false)), t(1)).is_none());
}

#[test]
fn app_change_closes_previous_segment_with_its_span() {
    let mut r = Recorder::default();
    r.observe(Some(("Code.exe", false)), t(0));
    let closed = r.observe(Some(("chrome.exe", false)), t(600)).expect("segment should close");
    assert_eq!(closed.app_name, "Code.exe");
    assert_eq!(closed.started_at, t(0));
    assert_eq!(closed.ended_at, Some(t(600)));
    assert!(!closed.is_idle);
}

#[test]
fn idle_transitions_produce_idle_segments() {
    let mut r = Recorder::default();
    r.observe(Some(("Code.exe", false)), t(0));
    let active = r.observe(Some(("Code.exe", true)), t(600)).expect("active segment closes at idle");
    assert!(!active.is_idle);
    let idle = r.observe(Some(("Code.exe", false)), t(1200)).expect("idle segment closes at activity");
    assert!(idle.is_idle);
    assert_eq!(idle.started_at, t(600));
    assert_eq!(idle.ended_at, Some(t(1200)));
}

#[test]
fn missing_foreground_closes_segment_and_starts_nothing() {
    let mut r = Recorder::default();
    r.observe(Some(("Code.exe", false)), t(0));
    let closed = r.observe(None, t(60)).expect("segment closes when no foreground window");
    assert_eq!(closed.ended_at, Some(t(60)));
    assert!(r.observe(None, t(61)).is_none());
}

#[test]
fn finish_flushes_open_segment_once() {
    let mut r = Recorder::default();
    r.observe(Some(("Code.exe", false)), t(0));
    let last = r.finish(t(30)).expect("open segment is flushed");
    assert_eq!(last.ended_at, Some(t(30)));
    assert!(r.finish(t(31)).is_none());
}

#[test]
fn zero_length_segment_is_dropped() {
    let mut r = Recorder::default();
    r.observe(Some(("Code.exe", false)), t(5));
    assert!(r.observe(Some(("chrome.exe", false)), t(5)).is_none());
}
