# Focusbrew: Port para Linux

**Status:** 📋 Planejamento  
**Prioridade:** 🔵 Média  
**Autor:** Sthevan Santos  
**Data:** Nov 2026

---

## 1. Objetivo

Portar focusbrew para Linux (Ubuntu, Fedora, Debian) para que funcione no notebook do autor em ambiente Linux, mantendo **100% da funcionalidade** exceto Activity Tracking.

---

## 2. Escopo

### ✅ Incluído

- **Widget:** barra/painel nas bordas (topo, esquerda, direita)
- **Tarefas:** criar, editar, reordenar, play/pausa, concluir
- **Painel:** hoje/próximos dias, Activity grid, resumo
- **Notas rápidas:** editor com desenho, histórico
- **GitHub:** conectar, listar PRs/issues, criar tarefas
- **Google Agenda:** sincronizar com tarefas de hoje
- **Atalhos globais:** Ctrl+Shift+Space, Ctrl+Shift+Alt+Space, Ctrl+Alt+N
- **Autostart:** iniciar com o Linux (via `~/.config/autostart/`)
- **Notificações:** avisos do sistema (via Tauri plugin)
- **Controles de mídia (MPRIS):** play/pausa/próxima/anterior via D-Bus
- **Build:** AppImage ou .deb para distribuição  

### ❌ Fora do Escopo

- **Activity Tracking:** não será implementado (requer reescrita do serviço)

---

## 3. Análise Técnica

### 3.1 Código Windows-Only (atual)

```
src-tauri/src/
├── autostart.rs       (70 linhas, ~60 Windows-only)
├── media.rs           (189 linhas, ~90 Windows SMTC)
├── widget.rs          (633 linhas, ~15 Windows API calls)
└── github.rs          (551 linhas, ~4 Windows calls)

src-tauri-service/    (822 linhas, TOTALMENTE Windows)
└── ❌ NÃO SERÁ PORTADO
```

### 3.2 Dependências a Mudar

| Recurso | Windows (atual) | Linux (novo) | Crate/Tool |
|---------|---|---|---|
| **Autostart** | Registry `Run` key | `~/.config/autostart/*.desktop` | Gerar arquivo |
| **Mídia** | SMTC (WinRT) | MPRIS via D-Bus | `dbus` + `mpris` |
| **Cursor global** | `GetCursorPos()` | Tauri `cursor_position()` | Já existente |
| **Window bounds** | `SetWindowPos()` | Tauri `set_size/set_position()` | Já existente |
| **Credenciais** | Credential Manager | Secret Service | `keyring` crate (já usa) |
| **Notificações** | Windows Notifications | D-Bus (via Tauri) | Plugin notification |
| **Atalhos globais** | Windows API | X11/Wayland (via Tauri) | Plugin global-shortcut |

### 3.3 Plataformas-Alvo

- **Ubuntu** 22.04+ (LTS, primária)
- **Fedora** 40+
- **Debian** 12+ (stretch goal)

---

## 4. Plano de Trabalho

### Fase 1: Setup & Investigação (2-3 dias)

- [ ] Clonar repo, fazer build no Linux
- [ ] Testar Tauri em Linux (widgets, eventos, D-Bus)
- [ ] Pesquisar MPRIS, D-Bus, formato `.desktop`
- [ ] Configurar CI/CD básico (GitHub Actions para Linux)

### Fase 2: Refactor Windows-Only → Conditional (2-3 dias)

- [ ] **autostart.rs:** adicionar `#[cfg(not(windows))]` com geração de `.desktop`
- [ ] **media.rs:** preparar stub MPRIS, manter Windows SMTC
- [ ] **widget.rs:** confirmar que fallbacks já existem
- [ ] **github.rs:** confirmar `keyring` suporta Linux

### Fase 3: Implementação MPRIS (3-4 dias)

- [ ] Implementar MPRIS `current()` via D-Bus
- [ ] Implementar MPRIS `play()`, `pause()`, `next()`, `previous()`
- [ ] Escutar mudanças de player (PropertiesChanged, Seeked)
- [ ] Mostrar capa do álbum
- [ ] Teste com Spotify, VLC, Rhythmbox
- [ ] Tratamento de erros (player não disponível, D-Bus indisponível)

### Fase 4: Testes & Empacotamento (2 dias)

- [ ] Build AppImage
- [ ] Teste widget em múltiplos monitors
- [ ] Teste autostart funciona
- [ ] Documentação: como instalar no Linux

---

## 5. Dependências Técnicas

### Build Requirements (novo)

```bash
# Ubuntu/Debian
sudo apt install libssl-dev libglib2.0-dev libdbus-1-dev libdbus-glib-1-dev

# Fedora
sudo dnf install openssl-devel glib2-devel dbus-devel
```

### Runtime

- **Tauri 2.x** (já usado)
- **D-Bus daemon** (padrão no Linux)
- **Secret Service** para credenciais (padrão GNOME/KDE)
- **systemd** ou equivalente (para `.desktop` autostart)

### Novos Crates Rust (opcionais)

```toml
# media.rs (opcional, only if we add MPRIS)
mpris = "0.9"  # ou dbus direto
dbus = "0.9"   # se realmente precisar

# Ou: manter como stub que retorna None no Linux
```

---

## 6. Critérios de Sucesso

### MVP (Mínimo Viável)

- ✅ Widget abre e fecha no topo da tela
- ✅ Pode criar/pausar/concluir tarefas
- ✅ GitHub conecta e mostra PRs/issues
- ✅ Google Agenda sincroniza
- ✅ Atalhos globais funcionam (Ctrl+Shift+Space, etc)
- ✅ Notas rápidas abrem com Ctrl+Alt+N
- ✅ Notificações aparecem no fim do bloco
- ✅ Autostart funciona (inicia ao logar)

### Nice to Have

- 🟠 AppImage automático via CI
- 🟠 Snap package
- 🟠 Suporte a múltiplos players MPRIS simultâneos

### Não é Sucesso

- ❌ Activity Tracking funcionando (fora do escopo)
- ❌ Precisa de admin/sudo para instalar

---

## 7. Riscos & Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---|---|---|
| Widget não cola na borda no Wayland | 🟠 Média | 🔴 Alto | Testar ASAP, considerar fallback |
| Atalhos globais conflitam com WM | 🟠 Média | 🟡 Médio | Permitir rebind no settings |
| D-Bus/MPRIS complexo de debugar | 🟠 Média | 🟡 Médio | Usar crate `dbus` com exemplos, debug verbose |
| Player não responde a MPRIS | 🟡 Baixa | 🟡 Médio | Fallback: mostrar None, log de erro |
| Credenciais não funcionam em headless | 🟡 Baixa | 🟡 Médio | Fallback para token em arquivo |

---

## 8. Timeline

```
├─ Semana 1: Setup + investigação + autostart.rs
├─ Semana 1-2: Refactor media.rs + testes widget
├─ Semana 2: MPRIS (se não complexo) ou deixar como None
└─ Semana 2-3: Build, empacotamento, docs
```

**Estimado:** 6-8 dias úteis (com MPRIS completo)

---

## 9. Próximos Passos Imediatos

1. **Clonar & testar build no Linux**
   ```bash
    cd focusbrew
    rustup target add x86_64-unknown-linux-gnu
    cargo build --target x86_64-unknown-linux-gnu
   ```
2. **Investigar Tauri no Linux**
   - Confirmar que `always_on_top`, `transparent`, `ignore_cursor_events` funcionam
   - Testar em Wayland + X11
3. **Pesquisar MPRIS/D-Bus**
   - Revisar crates `dbus` e `mpris`
   - Decidir: implementar ou deixar como `None` no Linux
4. **Começar com autostart.rs**
   - Mais simples, dá confiança

---

## 10. Detalhes de Implementação: MPRIS

### O que é MPRIS?

**Media Player Remote Interfacing Specification** — padrão D-Bus para comunicar com players de mídia (Spotify, VLC, Rhythmbox, etc).

### Arquitetura no Linux

```
focusbrew (app)
    ↓
D-Bus daemon
    ↓
/org/mpris/MediaPlayer2/{player}
    (Spotify, VLC, etc)
```

### Métodos MPRIS a implementar

```rust
// /org/mpris/MediaPlayer2/Player interface

current() -> MediaView           // Lê título, artista, capa, posição
play()  -> Result                // Comando play
pause() -> Result                // Comando pause  
next()  -> Result                // Próxima faixa
previous() -> Result             // Faixa anterior

// Listeners
PropertiesChanged                // Detecta mudanças (play/pause, posição)
Seeked                          // Player avançou na música
```

### Crates recomendados

```toml
[target.'cfg(target_os = "linux")'.dependencies]
dbus = "0.9"                    # D-Bus direto (mais controle)
# OU
mpris = "0.9"                   # Wrapper MPRIS (mais fácil)
```

### Fluxo de código

**src-tauri/src/media.rs:**

```rust
#[cfg(target_os = "linux")]
mod mpris {
    use dbus::blocking::Connection;
    
    pub fn current() -> Option<MediaView> {
        // 1. Conectar ao D-Bus
        // 2. Encontrar player ativo (/org/mpris/MediaPlayer2/*)
        // 3. Ler propriedades (Metadata, PlaybackStatus, Position)
        // 4. Converter em MediaView
    }
    
    pub fn play() -> Result<(), String> { /* ... */ }
    pub fn pause() -> Result<(), String> { /* ... */ }
    // ...
}
```

---

## 11. Documentação & Referências

- [Tauri: Linux Prerequisites](https://tauri.app/start/prerequisites/)
- [MPRIS Specification](https://specifications.freedesktop.org/mpris-spec/)
- [D-Bus Tutorial](https://dbus.freedesktop.org/doc/dbus-tutorial.html)
- [XDG Autostart](https://specifications.freedesktop.org/autostart-spec/)
- [dbus-rs docs](https://docs.rs/dbus/latest/dbus/)
- [mpris-rs docs](https://docs.rs/mpris/latest/mpris/)

---

**Próxima Review:** Após Fase 1 (investigação)
