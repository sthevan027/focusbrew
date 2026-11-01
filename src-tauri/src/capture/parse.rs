//! Turns the text a dictation tool types ("Tarefa: revisar o PR.") into a
//! structured capture. Pure: no I/O, no clock, no logging of the input.

use chrono::{Duration, NaiveDate};

use crate::tracker::tasks::{clean_title, is_valid_day, split_project};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Parsed {
    Task {
        title: String,
        project: Option<String>,
        minutes: Option<u32>,
        day: Option<String>,
    },
    Note {
        text: String,
    },
    SetMinutes {
        minutes: u32,
    },
    Unknown {
        text: String,
    },
}

/// Longest note accepted, in characters.
const MAX_NOTE_CHARS: usize = 20_000;
/// Longest run of digits read as a number of minutes/hours.
const MAX_DIGITS: usize = 6;

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Task,
    Note,
    Time,
}

/// Lowercase and without accents, for keyword matching.
fn fold(word: &str) -> String {
    word.chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'á' | 'ã' | 'â' | 'à' => 'a',
            'é' | 'ê' => 'e',
            'í' => 'i',
            'ó' | 'õ' | 'ô' => 'o',
            'ú' => 'u',
            'ç' => 'c',
            other => other,
        })
        .collect()
}

fn is_tail_punct(c: char) -> bool {
    matches!(c, '.' | '!' | '?' | ';' | ',' | ':')
}

/// Trimmed, without the punctuation dictation tools add at the end.
fn strip_tail(s: &str) -> &str {
    s.trim().trim_end_matches(|c: char| is_tail_punct(c) || c.is_whitespace())
}

/// Splits off the last whitespace-separated word: (head, last).
fn last_word(s: &str) -> (&str, &str) {
    match s.rsplit_once(char::is_whitespace) {
        Some((head, last)) => (head.trim_end(), last),
        None => ("", s),
    }
}

fn parse_number(word: &str) -> Option<u32> {
    if word.is_empty() || word.len() > MAX_DIGITS || !word.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    word.parse().ok()
}

fn unit_factor(word: &str) -> Option<u32> {
    match fold(word).as_str() {
        "min" | "mins" | "minuto" | "minutos" => Some(1),
        "h" | "hora" | "horas" => Some(60),
        _ => None,
    }
}

/// "N min", "N minutos", "N hora(s)" or "tempo N" at the end of `s`.
fn take_time(s: &str) -> Option<(&str, u32)> {
    let s = strip_tail(s);
    let (h1, w1) = last_word(s);
    if let Some(factor) = unit_factor(w1) {
        let (h2, w2) = last_word(h1);
        let minutes = parse_number(w2)?.checked_mul(factor)?;
        let (h3, w3) = last_word(strip_tail(h2));
        let head = if fold(w3) == "tempo" { h3 } else { h2 };
        return Some((head, minutes));
    }
    let minutes = parse_number(w1)?;
    let (h2, w2) = last_word(h1);
    (fold(w2) == "tempo").then_some((h2, minutes))
}

/// "hoje", "amanhã" or "AAAA-MM-DD" at the end of `s`, relative to `today`.
fn take_day<'a>(s: &'a str, today: &str) -> Option<(&'a str, String)> {
    let s = strip_tail(s);
    let (head, last) = last_word(s);
    let word = fold(last);
    let base = NaiveDate::parse_from_str(today, "%Y-%m-%d").ok();
    let format = |d: NaiveDate| d.format("%Y-%m-%d").to_string();
    match word.as_str() {
        "hoje" => base.map(|d| (head, format(d))),
        "amanha" => base
            .and_then(|d| d.checked_add_signed(Duration::days(1)))
            .map(|d| (head, format(d))),
        _ if is_valid_day(&word) => Some((head, word)),
        _ => None,
    }
}

fn keyword(first: &str) -> Option<Kind> {
    let word = fold(first.trim_end_matches(|c: char| is_tail_punct(c) || c == '-'));
    match word.as_str() {
        "tarefa" | "task" | "atividade" => Some(Kind::Task),
        "nota" | "note" => Some(Kind::Note),
        "tempo" | "time" => Some(Kind::Time),
        _ => None,
    }
}

/// "40", "40 min", "1 hora" (the part after the "tempo" keyword).
fn parse_set_minutes(rest: &str) -> Option<u32> {
    let rest = strip_tail(rest);
    if let Some(n) = parse_number(rest) {
        return Some(n);
    }
    let (head, unit) = last_word(rest);
    parse_number(head)?.checked_mul(unit_factor(unit)?)
}

pub fn parse_capture(input: &str, today: &str) -> Parsed {
    let text = input.trim();
    let unknown = || Parsed::Unknown { text: text.to_string() };
    let Some(first) = text.split_whitespace().next() else {
        return unknown();
    };
    let Some(kind) = keyword(first) else {
        return unknown();
    };
    let rest = text[first.len()..]
        .trim_start_matches(|c: char| c.is_whitespace() || matches!(c, ':' | ',' | '-'))
        .trim();
    if rest.is_empty() {
        return unknown();
    }
    match kind {
        Kind::Note => {
            if rest.chars().count() > MAX_NOTE_CHARS {
                return unknown();
            }
            Parsed::Note { text: rest.to_string() }
        }
        Kind::Time => match parse_set_minutes(rest) {
            Some(minutes) => Parsed::SetMinutes { minutes },
            None => unknown(),
        },
        Kind::Task => {
            let mut body = rest;
            let mut minutes = None;
            let mut day = None;
            loop {
                if minutes.is_none() {
                    if let Some((head, m)) = take_time(body) {
                        body = head;
                        minutes = Some(m);
                        continue;
                    }
                }
                if day.is_none() {
                    if let Some((head, d)) = take_day(body, today) {
                        body = head;
                        day = Some(d);
                        continue;
                    }
                }
                break;
            }
            let (title, project) = split_project(strip_tail(body));
            let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
            match clean_title(&title) {
                Some(title) => Parsed::Task { title, project, minutes, day },
                None => unknown(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TODAY: &str = "2026-10-31";

    fn task(title: &str, project: Option<&str>, minutes: Option<u32>, day: Option<&str>) -> Parsed {
        Parsed::Task {
            title: title.to_string(),
            project: project.map(String::from),
            minutes,
            day: day.map(String::from),
        }
    }

    fn unknown(text: &str) -> Parsed {
        Parsed::Unknown { text: text.to_string() }
    }

    #[test]
    fn spec_table() {
        let cases: Vec<(&str, Parsed)> = vec![
            ("tarefa revisar PR #focusbrew, tempo 40", task("revisar PR", Some("focusbrew"), Some(40), None)),
            ("Tarefa: revisar o PR.", task("revisar o PR", None, None, None)),
            ("Tarefa, revisar o PR", task("revisar o PR", None, None, None)),
            ("task fix login amanhã", task("fix login", None, None, Some("2026-11-01"))),
            ("nota ligar pro cliente na segunda", Parsed::Note { text: "ligar pro cliente na segunda".into() }),
            ("tempo 40", Parsed::SetMinutes { minutes: 40 }),
            ("Tempo 1 hora", Parsed::SetMinutes { minutes: 60 }),
            ("tempo 4", Parsed::SetMinutes { minutes: 4 }),
            ("", unknown("")),
            ("   ", unknown("")),
            ("tarefa", unknown("tarefa")),
            ("bom dia", unknown("bom dia")),
        ];
        for (input, expected) in cases {
            assert_eq!(parse_capture(input, TODAY), expected, "input: {input:?}");
        }
    }

    #[test]
    fn note_limit_is_20000_characters() {
        let ok = format!("nota {}", "a".repeat(20_000));
        assert!(matches!(parse_capture(&ok, TODAY), Parsed::Note { .. }));
        let too_long = format!("nota {}", "a".repeat(20_001));
        assert!(matches!(parse_capture(&too_long, TODAY), Parsed::Unknown { .. }));
    }

    #[test]
    fn capitals_and_extra_spaces() {
        assert_eq!(parse_capture("TAREFA fazer X", TODAY), task("fazer X", None, None, None));
        assert_eq!(parse_capture("tarefa  fazer   X", TODAY), task("fazer X", None, None, None));
        assert_eq!(parse_capture("TEMPO 25", TODAY), Parsed::SetMinutes { minutes: 25 });
    }

    #[test]
    fn hash_number_is_not_a_project() {
        assert_eq!(parse_capture("tarefa fazer X #12", TODAY), task("fazer X #12", None, None, None));
    }

    #[test]
    fn tempo_without_number_is_unknown() {
        assert_eq!(parse_capture("tempo", TODAY), unknown("tempo"));
        assert_eq!(parse_capture("tempo muito", TODAY), unknown("tempo muito"));
    }

    #[test]
    fn minutes_are_returned_as_is_for_the_caller_to_clamp() {
        assert_eq!(parse_capture("tempo 0", TODAY), Parsed::SetMinutes { minutes: 0 });
        assert_eq!(parse_capture("tempo 999", TODAY), Parsed::SetMinutes { minutes: 999 });
        assert_eq!(parse_capture("tarefa x tempo 999", TODAY), task("x", None, Some(999), None));
    }

    #[test]
    fn trailing_exclamation_and_question() {
        assert_eq!(parse_capture("Tarefa: revisar o PR!", TODAY), task("revisar o PR", None, None, None));
        assert_eq!(parse_capture("tarefa revisar o PR?", TODAY), task("revisar o PR", None, None, None));
        assert_eq!(parse_capture("Tempo 40!", TODAY), Parsed::SetMinutes { minutes: 40 });
    }

    #[test]
    fn units_and_days() {
        assert_eq!(parse_capture("tarefa estudar 30 minutos", TODAY), task("estudar", None, Some(30), None));
        assert_eq!(parse_capture("tarefa estudar 2 horas", TODAY), task("estudar", None, Some(120), None));
        assert_eq!(parse_capture("tarefa estudar 45 min hoje", TODAY), task("estudar", None, Some(45), Some(TODAY)));
        assert_eq!(parse_capture("tarefa estudar amanha", TODAY), task("estudar", None, None, Some("2026-11-01")));
        assert_eq!(parse_capture("tarefa estudar 2026-12-25", TODAY), task("estudar", None, None, Some("2026-12-25")));
        assert_eq!(parse_capture("tarefa estudar 2026-13-45", TODAY), task("estudar 2026-13-45", None, None, None));
        assert_eq!(parse_capture("atividade X #virex amanhã tempo 20", TODAY), task("X", Some("virex"), Some(20), Some("2026-11-01")));
    }

    #[test]
    fn tomorrow_rolls_over_month_end() {
        assert_eq!(parse_capture("tarefa x amanhã", "2026-12-31"), task("x", None, None, Some("2027-01-01")));
    }

    #[test]
    fn only_keyword_and_modifiers_is_unknown() {
        assert!(matches!(parse_capture("tarefa tempo 40", TODAY), Parsed::Unknown { .. }));
        assert!(matches!(parse_capture("tarefa amanhã", TODAY), Parsed::Unknown { .. }));
        assert!(matches!(parse_capture("tarefa:", TODAY), Parsed::Unknown { .. }));
        assert!(matches!(parse_capture("nota", TODAY), Parsed::Unknown { .. }));
    }

    #[test]
    fn long_title_is_cut_by_clean_title() {
        let input = format!("tarefa {}", "a".repeat(300));
        match parse_capture(&input, TODAY) {
            Parsed::Task { title, .. } => assert_eq!(title.chars().count(), 200),
            other => panic!("unexpected: {other:?}"),
        }
    }
}
