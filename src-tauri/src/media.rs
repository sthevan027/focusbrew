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

#[cfg(windows)]
mod smtc {
    use super::{clamp_position, to_data_url, MediaStatus, MediaView};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as SessionManager,
        GlobalSystemMediaTransportControlsSessionMediaProperties as MediaProperties,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
    };
    use windows::Storage::Streams::DataReader;

    fn to_status(status: PlaybackStatus) -> Option<MediaStatus> {
        match status {
            PlaybackStatus::Playing => Some(MediaStatus::Playing),
            PlaybackStatus::Paused => Some(MediaStatus::Paused),
            _ => None, // Stopped/Changing/Closed: tratado como "sem mídia" por quem chama
        }
    }

    // Blocking on purpose: the WinRT objects aren't `Send`, so they can't live
    // across an `.await` in a task Tauri may move between threads. Callers run
    // these on `spawn_blocking`, which takes nothing across threads but the result.
    fn session() -> Option<Session> {
        let manager = SessionManager::RequestAsync().ok()?.join().ok()?;
        manager.GetCurrentSession().ok()
    }

    fn read_cover(props: &MediaProperties) -> Option<Vec<u8>> {
        let thumb = props.Thumbnail().ok()?;
        let stream = thumb.OpenReadAsync().ok()?.join().ok()?;
        let size = stream.Size().ok()? as u32;
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        reader.LoadAsync(size).ok()?.join().ok()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf).ok()?;
        Some(buf)
    }

    /// A mídia tocando agora, ou `None` sem nenhuma sessão ativa (nada tocando,
    /// ou o Windows não acha nenhum app com controle de mídia registrado).
    pub fn current() -> Option<MediaView> {
        let session = session()?;
        let status = to_status(session.GetPlaybackInfo().ok()?.PlaybackStatus().ok()?)?;
        let props = session.TryGetMediaPropertiesAsync().ok()?.join().ok()?;
        let title = props.Title().ok()?.to_string();
        let artist = props.Artist().map(|a| a.to_string()).unwrap_or_default();
        let cover = read_cover(&props);

        let timeline = session.GetTimelineProperties().ok()?;
        let position_secs = timeline.Position().ok().map(|t| (t.Duration / 10_000_000) as u32).unwrap_or(0);
        let duration_secs = timeline.EndTime().ok().map(|t| (t.Duration / 10_000_000) as u32).unwrap_or(0);

        Some(MediaView {
            title,
            artist,
            cover_data_url: to_data_url(cover.as_deref()),
            position_secs: clamp_position(position_secs, duration_secs),
            duration_secs,
            status,
        })
    }

    pub fn play() -> Result<(), String> {
        let s = session().ok_or("sem sessão de mídia ativa")?;
        s.TryPlayAsync().map_err(|e| e.to_string())?.join().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn pause() -> Result<(), String> {
        let s = session().ok_or("sem sessão de mídia ativa")?;
        s.TryPauseAsync().map_err(|e| e.to_string())?.join().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn next() -> Result<(), String> {
        let s = session().ok_or("sem sessão de mídia ativa")?;
        s.TrySkipNextAsync().map_err(|e| e.to_string())?.join().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn previous() -> Result<(), String> {
        let s = session().ok_or("sem sessão de mídia ativa")?;
        s.TrySkipPreviousAsync().map_err(|e| e.to_string())?.join().map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(not(windows))]
mod smtc {
    use super::MediaView;

    pub fn current() -> Option<MediaView> {
        None
    }

    pub fn play() -> Result<(), String> {
        Err("controle de mídia só existe no Windows".into())
    }

    pub fn pause() -> Result<(), String> {
        Err("controle de mídia só existe no Windows".into())
    }

    pub fn next() -> Result<(), String> {
        Err("controle de mídia só existe no Windows".into())
    }

    pub fn previous() -> Result<(), String> {
        Err("controle de mídia só existe no Windows".into())
    }
}

pub use smtc::{current, next, pause, play, previous};

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
