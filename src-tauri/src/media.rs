//! Mídia tocando em qualquer app do Windows (SMTC) — capa/progresso/controles
//! no widget. A leitura real da sessão do Windows (Task 2) produz os bytes
//! crus que este arquivo transforma num `MediaView` seguro de publicar.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaStatus {
    Playing,
    Paused,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaView {
    pub title: String,
    pub artist: String,
    pub cover_data_url: Option<String>,
    pub position_secs: u32,
    pub duration_secs: u32,
    pub status: MediaStatus,
}

/// Assume JPEG — é o formato mais comum devolvido pelo SMTC pras capas de
/// álbum; um formato diferente ainda decodifica no `<img>` pela maioria dos
/// navegadores/engines, então não vale a complexidade de detectar o tipo real.
pub fn to_data_url(cover: Option<&[u8]>) -> Option<String> {
    let bytes = cover?;
    if bytes.is_empty() {
        return None;
    }
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    Some(format!("data:image/jpeg;base64,{encoded}"))
}

/// Protege a barra de progresso: nunca passa da duração, e uma duração
/// zerada (alguns players não reportam timeline) nunca produz uma posição
/// maior que zero.
pub fn clamp_position(position_secs: u32, duration_secs: u32) -> u32 {
    if duration_secs == 0 {
        return 0;
    }
    position_secs.min(duration_secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_cover_bytes_means_no_data_url() {
        assert_eq!(to_data_url(None), None);
    }

    #[test]
    fn cover_bytes_become_a_base64_data_url() {
        let url = to_data_url(Some(&[0xFF, 0xD8, 0xFF])).unwrap();
        assert!(url.starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn position_never_exceeds_duration() {
        assert_eq!(clamp_position(999, 180), 180);
    }

    #[test]
    fn a_zero_duration_still_clamps_to_zero_instead_of_dividing_by_it() {
        assert_eq!(clamp_position(50, 0), 0);
    }

    #[test]
    fn position_within_duration_is_untouched() {
        assert_eq!(clamp_position(42, 180), 42);
    }
}
