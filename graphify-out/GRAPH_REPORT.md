# Graph Report - focusbrew  (2026-10-26)

## Corpus Check
- 254 files · ~210,230 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 15 file(s) not represented in the graph (top: (none) 4, .css 4, .lock 3)

## Summary
- 2190 nodes · 4801 edges · 107 communities (91 shown, 16 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 94 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Tela de configuracoes (UI)
- Painel e widget (UI)
- Relogio e icones da UI
- Dias e resumo (UI)
- Painel de atividade (UI)
- Formas e geometria das notas
- Helpers de shell (UI)
- Editor de notas (desenho)
- Dia e planejamento (UI)
- Metadados das notas (UI)
- Desfazer e refazer das notas
- Painel GitHub (UI)
- Barra de progresso (UI)
- Changelog e releases do site
- Grade de atividade (UI)
- Geracao do latest.json
- Reordenar tarefas (UI)
- Janela de nota (frontend)
- Resumo de atividade (UI)
- Auto-fechar painel (idle)
- Specs das notas rapidas
- Cursor e janela (UI)
- Importar evento do Google (UI)
- Icones e escala (testes UI)
- Exportar nota como imagem
- Comandos Tauri de atividade e notas
- Estado e tipos compartilhados (Rust)
- Timer (Rust)
- Bandeja e alertas
- Janela do widget (Rust)
- Testes do tracker (regras de tempo)
- Gravacao de atividade (recorder)
- Comandos Tauri (acoes do app)
- Atalhos globais
- API HTTP do tracker
- Alertas do tracker (Rust)
- Log de atividade (Rust)
- Cliente da API de atividade e midia
- Storage SQLite do tracker
- Limites e testes de notas
- Monitores e zona do mouse
- Integracao GitHub (dados)
- AppConfig (Rust)
- Carregamento de notas (Rust)
- Decisoes de sync Google
- Google Agenda (API)
- Testes de limites das notas
- Gate de erros do coletor
- Cliente Google Calendar (delete)
- Deteccao de app ativo (testes)
- OAuth Google (client secret)
- Tarefas (modelo e testes)
- Criar evento Google
- PKCE do Google OAuth
- Conflito local x remoto (sync)
- Manifesto do app (Cargo)
- Manifesto do tracker (Cargo)
- Dependencias do app (npm)
- Dependencias da landing
- Armazenamento de notas e config
- Testes de config (arquivo)
- Dependencias do video hero
- Config do Tauri
- Janela de notas (Rust)
- Autostart do Windows
- tsconfig raiz
- tsconfig do site
- Testes de integracao HTTP
- Inicializacao do app (Rust)
- Testes do recorder
- Sync com Google Tasks
- Deteccao de processo ativo (Win32)
- Testes da API HTTP
- Testes de config
- Escrita atomica do notes.json
- tsconfig do hero
- Caminho do banco e porta
- Imagens das notas (hash)
- Log em arquivo
- Datas locais (activity)
- Estilo do notch (widget)
- Pull de tarefas remotas
- Config de bundle Windows
- tsconfig do node
- Config de assinatura
- Limites da janela (Rust)
- Permissoes do Tauri
- Aplicar posicao da janela
- Testes de log
- Atualizacao automatica (UI)
- Posicao do widget (specs)
- Specs do daily notch
- Plano do tracker de atividade
- Plano do player de musica
- Notas do auto-update (v0.4.1)
- Planos do backend de estado
- Regra de remocao no Google

## God Nodes (most connected - your core abstractions)
1. `tracker()` - 40 edges
2. `NoteEditor()` - 33 edges
3. `Shared` - 31 edges
4. `Widget()` - 26 edges
5. `Tracker` - 25 edges
6. `TaskRow()` - 23 edges
7. `Hero()` - 22 edges
8. `Panel()` - 22 edges
9. `apply()` - 21 edges
10. `Notas rapidas Implementation Plan` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Autosave never loses the last stroke nor saves an empty note` --rationale_for--> `useNoteDoc()`  [INFERRED]
  docs/superpowers/plans/2026-10-08-notas-rapidas.md → src/note/useNoteDoc.ts
- `Shortcuts cannot collide with each other` --rationale_for--> `find_action()`  [EXTRACTED]
  docs/superpowers/plans/2026-10-08-notas-rapidas.md → src-tauri/src/shortcuts.rs
- `Undo history limited to 100 steps` --references--> `commit()`  [EXTRACTED]
  docs/superpowers/plans/2026-10-08-notas-rapidas.md → src/lib/noteHistory.ts
- `Drawing logic is pure and unit tested` --rationale_for--> `commit()`  [EXTRACTED]
  docs/superpowers/plans/2026-10-08-notas-rapidas.md → src/lib/noteHistory.ts
- `AppConfig.shortcut_note` --references--> `NotePlacement`  [EXTRACTED]
  docs/superpowers/plans/2026-10-08-notas-rapidas.md → src-tauri/src/config.rs

## Import Cycles
- 1-file cycle: `src-tauri/src/media.rs -> src-tauri/src/media.rs`
- 1-file cycle: `src-tauri/src/autostart.rs -> src-tauri/src/autostart.rs`
- 2-file cycle: `src-tauri/src/config.rs -> src-tauri/src/tracker/tasks.rs -> src-tauri/src/config.rs`

## Hyperedges (group relationships)
- **Pipeline de imagens em disco** — src_tauri_src_notes_image_file_name, src_tauri_src_notes_fnv1a, src_tauri_src_notes_store_image_in, src_tauri_src_notes_read_image_in, src_tauri_src_notes_prune_images_in, src_tauri_src_notes_valid_image_name [EXTRACTED 1.00]
- **Pipeline de edicao da nota** — src_note_noteeditor_noteeditor, src_note_usenotedoc_usenotedoc, src_note_notesvg_notesvg, src_note_notehistory_notehistory, src_note_imageimport_prepareimage, src_note_exportimage_copynoteasimage, src_lib_tauri_savenote [EXTRACTED 1.00]
- **Notas rapidas: folha, atalho, abertura, armazenamento e imagens** — docs_superpowers_specs_2026_10_08_notas_rapidas_design_quick_note, docs_superpowers_specs_2026_10_08_notas_rapidas_design_shortcut_ctrl_alt_n, docs_superpowers_specs_2026_10_08_notas_rapidas_design_placement_overlay_window, docs_superpowers_specs_2026_10_08_notas_rapidas_design_storage_json, docs_superpowers_specs_2026_10_08_notas_rapidas_design_image_handling [EXTRACTED 1.00]
- **Tres atalhos globais e a nota** — src_tauri_src_shortcuts_action, src_tauri_src_shortcuts_find_action, src_tauri_src_commands_set_shortcut, src_tauri_src_lib_note_action, src_tauri_src_config_appconfig_shortcut_note [EXTRACTED 1.00]
- **Activity tracking pipeline from detector to Tauri report** — docs_superpowers_plans_2026_10_17_activity_tracking_implementation_detect_active_app, docs_superpowers_plans_2026_10_17_activity_tracking_implementation_storage, docs_superpowers_plans_2026_10_17_activity_tracking_implementation_get_activities_handler, docs_superpowers_plans_2026_10_17_activity_tracking_implementation_activity_client, docs_superpowers_plans_2026_10_17_activity_tracking_implementation_activity_report_tsx [INFERRED 0.75]
- **Google Calendar sync cycle** — docs_superpowers_plans_2026_10_12_google_agenda_refresh_google_now, docs_superpowers_plans_2026_10_12_google_agenda_decide, docs_superpowers_plans_2026_10_12_google_agenda_create_event, docs_superpowers_plans_2026_10_12_google_agenda_patch_event_title, docs_superpowers_plans_2026_10_12_google_agenda_fetch_day_events, docs_superpowers_plans_2026_10_12_google_agenda_parse_events_response [INFERRED 0.75]
- **Update status check and display** — docs_superpowers_plans_2026_10_09_auto_update_use_update_status, docs_superpowers_plans_2026_10_09_auto_update_update_status_reducer, docs_superpowers_plans_2026_10_09_auto_update_initial_update_state, docs_superpowers_plans_2026_10_09_auto_update_update_row_tsx, docs_superpowers_plans_2026_10_09_auto_update_status_hint, docs_superpowers_plans_2026_10_09_auto_update_format_checked_at [INFERRED 0.75]
- **Pure tracker modules: timer, tasks, activity and Tracker** — docs_superpowers_plans_2026_10_05_daily_notch_task_1, docs_superpowers_plans_2026_10_05_daily_notch_task_2, docs_superpowers_plans_2026_10_05_daily_notch_task_3, docs_superpowers_plans_2026_10_05_daily_notch_task_4 [INFERRED 0.85]
- **Time anomaly guards in the timer (sleep, clock skew, midnight, deadline)** — docs_superpowers_plans_2026_10_05_daily_notch_sleep_gap, docs_superpowers_plans_2026_10_05_daily_notch_clock_backwards, docs_superpowers_plans_2026_10_05_daily_notch_midnight_day_key, docs_superpowers_plans_2026_10_05_daily_notch_deadline_timer [INFERRED 0.85]
- **Pipeline de release: updater, latest.json, API de releases e nome do instalador** — docs_superpowers_specs_2026_10_09_auto_update_design_updater_plugin, docs_superpowers_specs_2026_10_09_auto_update_design_latest_json_endpoint, docs_superpowers_specs_2026_10_12_landing_page_design_download_button_api, docs_superpowers_specs_2026_10_12_landing_page_design_release_asset_naming, docs_superpowers_specs_2026_10_12_landing_page_design_smartscreen_honesty [INFERRED 0.85]
- **Cascata de formas do widget (barra, caixa, painel, abas)** — docs_superpowers_specs_2026_10_08_widget_bordas_design_pickshape_cascade, docs_superpowers_specs_2026_10_12_media_player_design_pickshape_media, docs_superpowers_specs_2026_10_12_media_player_design_tabs_ctrl_scroll, docs_superpowers_specs_2026_10_08_widget_bordas_design_asymmetric_transition, readme_widget_states [INFERRED 0.85]

## Communities (107 total, 16 thin omitted)

### Community 0 - "Tela de configuracoes (UI)"
Cohesion: 0.06
Nodes (53): Section, KeyCombo, AppConfig, Props, RowProps, SectionProps, Props, UpdateAction (+45 more)

### Community 1 - "Painel e widget (UI)"
Cohesion: 0.08
Nodes (61): Step, Tok, GhRowProps, RowProps, bump(), Caption(), Chip(), clicks() (+53 more)

### Community 17 - "Relogio e icones da UI"
Cohesion: 0.16
Nodes (30): MediaView, IconProps, clockParts(), formatClock(), remainingSecs(), editTask(), mediaNext(), mediaPause() (+22 more)

### Community 18 - "Dias e resumo (UI)"
Cohesion: 0.10
Nodes (22): DayTasks, notchLayout, daySummary, SummaryRow, CalendarEventView, GithubEvent, GithubTokenSource, MediaStatus (+14 more)

### Community 25 - "Painel de atividade (UI)"
Cohesion: 0.14
Nodes (24): SortKey, ActivityApp, ActivityConfig, ActivityReportData, CustomRange, Period, Mode, Props (+16 more)

### Community 26 - "Formas e geometria das notas"
Cohesion: 0.18
Nodes (21): NoteObject, Point, Rect, ShapeKind, Handle, Layer, Props, arrowHead() (+13 more)

### Community 27 - "Helpers de shell (UI)"
Cohesion: 0.11
Nodes (23): PanelPhase, Shape, ShapeContext, Size, SideCountStyle, TimerStatus, WidgetEdge, Box (+15 more)

### Community 28 - "Editor de notas (desenho)"
Cohesion: 0.14
Nodes (22): Gesture, Mode, Tool, constrainShape(), objectBounds(), resizeRect(), topObjectAt(), scaleToMax() (+14 more)

### Community 32 - "Dia e planejamento (UI)"
Cohesion: 0.16
Nodes (19): PanelTab, carriedFrom(), dayOfMs(), key(), pad(), parse(), plannedByDay(), tabsFor() (+11 more)

### Community 33 - "Metadados das notas (UI)"
Cohesion: 0.21
Nodes (18): Note, canAddObject(), canAddPoint(), filterNotes(), fitInto(), fold(), formatNoteDate(), noteTitle() (+10 more)

### Community 35 - "Desfazer e refazer das notas"
Cohesion: 0.21
Nodes (18): History, canRedo(), canUndo(), commit(), createHistory(), redo(), undo(), newNote() (+10 more)

### Community 44 - "Painel GitHub (UI)"
Cohesion: 0.26
Nodes (15): GithubItem, GithubPanel(), GithubRow(), dayLabel(), shortDate(), linkedTask(), clearGithubToken(), connectGithubWithGh() (+7 more)

### Community 45 - "Barra de progresso (UI)"
Cohesion: 0.19
Nodes (15): UShape, TimerView, Props, Props, shape(), clamp01(), dims(), progressFraction() (+7 more)

### Community 5 - "Changelog e releases do site"
Cohesion: 0.09
Nodes (38): Row, RawAsset, RawRelease, ReleaseInfo, StorageLike, ReleasesState, App(), Changelog() (+30 more)

### Community 50 - "Grade de atividade (UI)"
Cohesion: 0.28
Nodes (15): DayCell, level, buildGrid(), dateKey(), formatDuration(), mondayOf(), pad(), streak() (+7 more)

### Community 58 - "Geracao do latest.json"
Cohesion: 0.17
Nodes (11): LatestJson, LatestJsonInput, buildLatestJson(), releaseTag(), input, clean, dir, json (+3 more)

### Community 59 - "Reordenar tarefas (UI)"
Cohesion: 0.30
Nodes (11): Drag, titleWithoutProject(), clampDelta(), dropIndex(), jumpDistance(), moveItem(), rowShift(), addTask() (+3 more)

### Community 66 - "Janela de nota (frontend)"
Cohesion: 0.24
Nodes (10): NoteRequest, closeNoteWindow(), currentWindowLabel(), getState(), onOpenNote(), onStateChanged(), windowKind(), initialRequest() (+2 more)

### Community 81 - "Resumo de atividade (UI)"
Cohesion: 0.25
Nodes (8): StateSnapshot, Props, Props, Props, BoxTab, Props, Props, Props

### Community 85 - "Auto-fechar painel (idle)"
Cohesion: 0.43
Nodes (4): Motion, ShapeKind, shouldAutoClose(), useIdleClose()

### Community 19 - "Specs das notas rapidas"
Cohesion: 0.11
Nodes (28): pickShape(), turned(), saveNote(), NotePlacement, SHEET, read_note_image(), Overlay, Window (+20 more)

### Community 46 - "Cursor e janela (UI)"
Cohesion: 0.22
Nodes (15): onCursorOutside(), onTogglePanel(), openNote(), setNoteOverlayOpen(), setWidgetExpanded(), touchesEdge(), afterNoteClose(), hoverStep() (+7 more)

### Community 54 - "Importar evento do Google (UI)"
Cohesion: 0.21
Nodes (12): GoogleCalendarPanel(), isImported(), syncedAtLabel(), googleConnect(), googleDisconnect(), googleImportEvent(), googleListDayEvents(), AgendaTab() (+4 more)

### Community 61 - "Icones e escala (testes UI)"
Cohesion: 0.15
Nodes (6): scaleFactor(), onNoteFlash(), { windowListen, globalListen }, SECTION_ICONS, names, box

### Community 68 - "Exportar nota como imagem"
Cohesion: 0.27
Nodes (6): wrapText(), copyNoteAsImage(), drawLayer(), NoteSvg(), html(), NOTE_ICONS

### Community 12 - "Comandos Tauri de atividade e notas"
Cohesion: 0.06
Nodes (18): ActivityReportDto, ImagePayload, NotesShared, ACTIVITY_PORT, close_note_window(), delete_note(), get_activity_report(), google_access_token() (+10 more)

### Community 13 - "Estado e tipos compartilhados (Rust)"
Cohesion: 0.12
Nodes (22): TokenSource, AppState, StateSnapshot, Gh, Manual, a_failed_calendar_keeps_the_last_heatmap(), a_failed_search_keeps_the_last_list_and_shows_the_error(), a_finished_refresh_fills_the_lists() (+14 more)

### Community 14 - "Timer (Rust)"
Cohesion: 0.10
Nodes (25): Timer, TimerStatus, TimerView, a_clock_that_goes_backwards_never_reports_more_than_planned(), a_paused_or_idle_timer_never_expires(), elapsed_counts_whole_seconds(), expiry_includes_the_deadline_itself(), MIN (+17 more)

### Community 15 - "Bandeja e alertas"
Cohesion: 0.11
Nodes (23): Alert, BeforeEnd, GoalReached, IdleReminder, alert_text(), check_alerts(), decode_icon(), GITHUB_REFRESH_EVERY (+15 more)

### Community 16 - "Janela do widget (Rust)"
Cohesion: 0.07
Nodes (21): MonitorChoice, OutsideWatch, coming_back_inside_starts_over(), contains(), create(), cursor_position(), EXPANDED, FALLBACK_MONITOR_HEIGHT (+13 more)

### Community 2 - "Testes do tracker (regras de tempo)"
Cohesion: 0.09
Nodes (48): Finished, Tracker, a_done_or_unknown_task_cannot_be_started(), a_gap_of_exactly_the_limit_still_counts_as_time(), a_long_gap_means_the_computer_slept_and_does_not_count(), a_paused_timer_does_not_finish_on_tick(), a_session_keeps_the_title_and_project_of_that_moment(), a_task_moves_to_a_real_day_only() (+40 more)

### Community 21 - "Gravacao de atividade (recorder)"
Cohesion: 0.18
Nodes (17): ActivityRecord, Recorder, Segment, DEFAULT_MAX_GAP_SECS, record_of(), base(), record(), test_cleanup_old_records_deletes_expired() (+9 more)

### Community 22 - "Comandos Tauri (acoes do app)"
Cohesion: 0.23
Nodes (26): Shared, add_task(), apply(), clear_github_token(), connect_github_with_gh(), edit_task(), get_state(), google_connect() (+18 more)

### Community 23 - "Atalhos globais"
Cohesion: 0.14
Nodes (17): Action, note_action(), action_for(), Note, Panel, Toggle, active(), ACTIVE (+9 more)

### Community 29 - "API HTTP do tracker"
Cohesion: 0.20
Nodes (10): ActivitiesQuery, AppState, ConfigUpdate, Config, config_json(), get_activities(), get_config(), get_health() (+2 more)

### Community 36 - "Alertas do tracker (Rust)"
Cohesion: 0.20
Nodes (18): Alerts, Moment, a_block_shorter_than_the_heads_up_is_not_warned(), a_forgotten_paused_block_also_gets_a_reminder(), cfg(), idle(), MIN, no_reminder_outside_working_hours_or_without_tasks() (+10 more)

### Community 38 - "Log de atividade (Rust)"
Cohesion: 0.16
Nodes (15): ActivityLog, Session, a_0_2_file_has_no_sessions_and_keeps_its_totals(), a_saved_log_reads_back_the_same(), KEEP_DAYS, load(), log_path(), parse() (+7 more)

### Community 4 - "Cliente da API de atividade e midia"
Cohesion: 0.05
Nodes (26): ActivityClient, ActivitiesResponse, ActivityReport, ConfigResponse, ConfigUpdate, MediaStatus, MediaView, closed_port() (+18 more)

### Community 40 - "Storage SQLite do tracker"
Cohesion: 0.15
Nodes (3): Storage, fmt_ts(), OVERLAP_SECS

### Community 48 - "Limites e testes de notas"
Cohesion: 0.16
Nodes (15): Note, NotesFile, a_corrupt_file_moved_aside_starts_empty_but_never_prunes_images(), a_note_without_id_is_refused_and_the_note_limit_is_enforced(), an_empty_note_is_not_kept_and_removes_a_saved_one(), bad_values_are_cleaned_not_trusted(), clean_coord(), clean_size() (+7 more)

### Community 51 - "Monitores e zona do mouse"
Cohesion: 0.24
Nodes (16): Layout, MonitorArea, a_monitor_with_a_negative_origin_keeps_the_widget_on_it(), a_scaled_monitor_gets_physical_sizes_on_every_edge(), area(), each_edge_places_the_window_somewhere_different(), hot_zone(), panel_zone() (+8 more)

### Community 6 - "Integracao GitHub (dados)"
Cohesion: 0.06
Nodes (40): ContributionCalendar, ContributionDay, ContributionsCollection, ContributionsData, ContributionsResponse, ContributionsUser, ContributionWeek, GithubEvent (+32 more)

### Community 63 - "AppConfig (Rust)"
Cohesion: 0.14
Nodes (14): AppConfig, NotchStyle, SideCountStyle, WidgetEdge, config_path(), load(), Minimal, Standard (+6 more)

### Community 67 - "Carregamento de notas (Rust)"
Cohesion: 0.17
Nodes (9): LoadStatus, NotesStore, load(), Clean, Recovered, Unreadable, notes_path(), parse() (+1 more)

### Community 69 - "Decisoes de sync Google"
Cohesion: 0.24
Nodes (11): SyncAction, decide(), event_title_for(), in_scope(), CreateRemote, DeleteLocal, MarkLocalDone, MarkLocalOpen (+3 more)

### Community 7 - "Google Agenda (API)"
Cohesion: 0.06
Nodes (25): CalendarEvent, CreatedEvent, RawEvent, RawWhen, ACCOUNT, an_all_day_event_has_no_time_of_day_but_still_parses(), an_event_without_summary_falls_back_to_a_placeholder_title(), authorize_url() (+17 more)

### Community 71 - "Testes de limites das notas"
Cohesion: 0.18
Nodes (11): NoteObject, ShapeKind, limits_are_applied_to_text_objects_and_points(), Shape, Stroke, Arrow, Ellipse, Line (+3 more)

### Community 72 - "Gate de erros do coletor"
Cohesion: 0.31
Nodes (5): ErrorGate, CHECKPOINT_EVERY, CLEANUP_EVERY, run(), write()

### Community 75 - "Cliente Google Calendar (delete)"
Cohesion: 0.22
Nodes (9): DeleteOutcome, auth_client(), client(), delete_event(), AlreadyGone, Deleted, event_is_gone(), gone_from_response() (+1 more)

### Community 76 - "Deteccao de app ativo (testes)"
Cohesion: 0.32
Nodes (6): ActiveApp, detect_active_app(), is_idle(), test_app_name_is_exe_basename_without_path(), test_detect_active_app_returns_app_name_and_timestamp(), test_huge_idle_threshold_never_reports_idle()

### Community 86 - "OAuth Google (client secret)"
Cohesion: 0.48
Nodes (7): TokenResponse, client_secret(), exchange_code(), post_token(), refresh_access_token(), token_requests_carry_the_client_secret_google_requires_for_desktop_clients(), with_secret()

### Community 9 - "Tarefas (modelo e testes)"
Cohesion: 0.07
Nodes (32): Task, TaskSource, a_new_task_gets_the_requested_minutes_clamped(), a_new_task_is_planned_for_the_given_day(), an_old_file_has_no_day_and_gets_today_when_filled_in(), an_old_tasks_file_loads_with_the_new_fields_filled_in(), clean_title(), DEFAULT_MINUTES (+24 more)

### Community 90 - "Criar evento Google"
Cohesion: 0.33
Nodes (5): EventsResponse, create_event(), event_body(), event_body_uses_rfc3339_with_the_right_shape(), parse_created_event_id()

### Community 92 - "PKCE do Google OAuth"
Cohesion: 0.60
Nodes (5): PkcePair, base64url(), challenge_from_verifier(), generate_pkce(), pkce_challenge_is_the_sha256_of_the_verifier_base64url()

### Community 97 - "Conflito local x remoto (sync)"
Cohesion: 0.50
Nodes (4): Winner, newer_wins(), Local, Remote

### Community 11 - "Dependencias do app (npm)"
Cohesion: 0.04
Nodes (44): author, dependencies, react, react-dom, @tauri-apps/api, @tauri-apps/plugin-opener, @tauri-apps/plugin-process, @tauri-apps/plugin-updater (+36 more)

### Community 24 - "Dependencias da landing"
Cohesion: 0.07
Nodes (27): dependencies, react, react-dom, devDependencies, @types/react, @types/react-dom, typescript, vite (+19 more)

### Community 30 - "Armazenamento de notas e config"
Cohesion: 0.11
Nodes (18): data_dir(), normalize_hex(), an_image_is_stored_by_content_and_the_same_bytes_share_one_file(), clean_color(), COORD_MAX, COORD_MIN, images_dir(), MAX_IMAGE_BYTES (+10 more)

### Community 31 - "Testes de config (arquivo)"
Cohesion: 0.11
Nodes (16): a_0_1_settings_file_keeps_its_values_and_gets_the_new_defaults(), a_file_without_widget_edge_opens_on_the_top_and_keeps_the_rest(), a_partial_file_fills_the_rest_with_defaults(), AUTOCLOSE_CHOICES, BEFORE_END_CHOICES, DEFAULT_ACCENT, DEFAULT_SHORTCUT_NOTE, DEFAULT_SHORTCUT_PANEL (+8 more)

### Community 34 - "Dependencias do video hero"
Cohesion: 0.09
Nodes (21): dependencies, react, react-dom, remotion, @remotion/cli, devDependencies, @types/react, typescript (+13 more)

### Community 37 - "Config do Tauri"
Cohesion: 0.09
Nodes (22): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+14 more)

### Community 42 - "Janela de notas (Rust)"
Cohesion: 0.16
Nodes (8): center_on_cursor_monitor(), close_window(), focus_and_flash(), is_open(), NOTE_SIZE, open(), OVERLAY_OPEN, window_visible()

### Community 43 - "Autostart do Windows"
Cohesion: 0.11
Nodes (4): command(), RUN_KEY, set(), VALUE

### Community 47 - "tsconfig raiz"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+10 more)

### Community 49 - "tsconfig do site"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 52 - "Testes de integracao HTTP"
Cohesion: 0.21
Nodes (7): build_router(), validate_host_header(), at(), collect(), collected_timeline_is_reported_with_active_and_idle_totals(), get_json(), session_crossing_midnight_is_split_by_day_and_never_double_counted()

### Community 53 - "Inicializacao do app (Rust)"
Cohesion: 0.20
Nodes (11): db_path(), db_path_in(), DEFAULT_PORT, load_config(), open_state(), port(), PORT_ENV, port_from() (+3 more)

### Community 55 - "Testes do recorder"
Cohesion: 0.26
Nodes (13): app_change_closes_previous_segment_with_its_span(), checkpoint_writes_span_so_far_and_keeps_segment_open(), checkpointed_pieces_after_the_first_are_marked_continued(), delays_under_the_threshold_are_not_gaps(), finish_flushes_open_segment_once(), gap_between_observations_closes_segment_at_last_seen_time(), gap_with_no_foreground_window_also_closes_at_last_seen(), idle_transitions_produce_idle_segments() (+5 more)

### Community 56 - "Sync com Google Tasks"
Cohesion: 0.27
Nodes (15): a_checkmark_added_remotely_after_the_local_edit_marks_the_task_done_locally(), a_github_task_is_never_pushed_to_google(), a_manual_task_with_no_remote_yet_must_be_created(), a_newer_local_title_edit_pushes_to_the_remote(), a_newer_remote_title_edit_pulls_into_the_local_task(), a_task_already_linked_with_no_matching_remote_was_deleted_on_google(), a_task_finished_before_its_event_existed_is_created_with_the_checkmark(), a_task_finished_on_google_also_takes_the_remote_title() (+7 more)

### Community 60 - "Testes da API HTTP"
Cohesion: 0.30
Nodes (10): call(), get_activities_rejects_unparseable_dates(), get_activities_returns_apps_and_idle_seconds(), get_config_returns_current_values(), get_health_reports_ok_with_uptime(), post_config_clamps_idle_threshold_to_1_through_60(), post_config_persists_and_retention_is_clamped_to_30_through_365(), RANGE (+2 more)

### Community 62 - "Testes de config"
Cohesion: 0.19
Nodes (13): a_blank_note_shortcut_falls_back_to_the_default(), a_valid_accent_is_written_in_upper_case(), alert_settings_snap_to_the_offered_choices(), an_invalid_accent_falls_back_to_the_default(), blank_shortcuts_and_monitor_fall_back(), default_minutes_are_clamped(), or_default(), the_edge_is_written_in_lower_case_and_read_back() (+5 more)

### Community 65 - "Escrita atomica do notes.json"
Cohesion: 0.22
Nodes (12): a_clean_load_may_prune_and_a_utf8_bom_is_not_corruption(), a_corrupt_file_is_kept_aside_and_the_app_starts_empty(), a_file_with_missing_fields_still_loads(), a_missing_or_empty_file_is_just_an_empty_store(), a_saved_file_reads_back_the_same_and_leaves_no_temp_file(), an_unreadable_notes_file_is_never_treated_as_empty_and_blocks_writes(), load_from(), reading_an_image_refuses_anything_that_is_not_one_of_our_names() (+4 more)

### Community 70 - "tsconfig do hero"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, module, moduleResolution, noEmit, skipLibCheck, strict, target (+2 more)

### Community 74 - "Imagens das notas (hash)"
Cohesion: 0.33
Nodes (6): fnv1a(), image_file_name(), prune_images_in(), read_image_in(), valid_image_name(), Task 4: Imagens em disco

### Community 78 - "Log em arquivo"
Cohesion: 0.29
Nodes (3): MAX_LOG_BYTES, write(), write_to()

### Community 80 - "Estilo do notch (widget)"
Cohesion: 0.25
Nodes (7): cfg(), cfg_edge(), media_alone_gets_the_box_zone_not_the_parked_bar(), the_left_edge_is_glued_to_the_screen_and_centered_in_height(), the_mouse_zone_follows_the_state(), the_parked_bar_stands_up_on_the_sides(), the_right_edge_is_glued_to_the_screen_and_centered_in_height()

### Community 82 - "Pull de tarefas remotas"
Cohesion: 0.43
Nodes (6): pull_remote(), refresh_google_now(), set_done(), update_task(), now_ms(), today_key()

### Community 83 - "Config de bundle Windows"
Cohesion: 0.25
Nodes (7): bundle, targets, windows, installMode, template, $schema, nsis

### Community 84 - "tsconfig do node"
Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 87 - "Config de assinatura"
Cohesion: 0.29
Nodes (6): bundle, windows, $schema, certificateThumbprint, digestAlgorithm, timestampUrl

### Community 88 - "Limites da janela (Rust)"
Cohesion: 0.47
Nodes (4): inside(), LAST_BOUNDS, PANEL_ZONE, ZONE

### Community 89 - "Permissoes do Tauri"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 93 - "Aplicar posicao da janela"
Cohesion: 0.40
Nodes (3): apply(), EDGES, set_bounds()

### Community 96 - "Testes de log"
Cohesion: 0.83
Nodes (3): temp_log(), write_to_appends_timestamped_lines(), write_to_starts_over_when_the_file_is_too_large()

### Community 10 - "Atualizacao automatica (UI)"
Cohesion: 0.05
Nodes (28): App.tsx calls useUpdateStatus, formatCheckedAt HH:MM helper, GeneralSection places the update row, initialUpdateState, statusHint line under Atualizacoes, UpdateRow component, updateStatusReducer pure reducer, useUpdateStatus hook (+20 more)

### Community 20 - "Posicao do widget (specs)"
Cohesion: 0.07
Nodes (23): AppConfig.widget_edge field and default, widget::apply() window placement, dims() helper, hot_zone() mouse zone, MonitorArea struct, motionBetween() grow or shrink, NotchSection Position selector, physical_bounds() per-edge placement (+15 more)

### Community 3 - "Specs do daily notch"
Cohesion: 0.05
Nodes (56): Grade Activity de 28 dias por tempo de foco, Linha de progresso em U (e modo RGB), Modelo de tarefa (tasks.json) e AppConfig, Timer com autoridade no backend (Idle, Running, Paused), Widget colado no topo do monitor principal, Vincular tarefa a um dia (planejamento futuro), Resumo do dia (tempo por tarefa, concluidas, GitHub, projetos), GitHub no dia (PRs e issues viram tarefa, eventos no resumo) (+48 more)

### Community 39 - "Plano do tracker de atividade"
Cohesion: 0.12
Nodes (15): ActiveApp struct, ActivityClient (Tauri HTTP client), ActivityReport.tsx component, build_router() HTTP routes, cleanup_old_records(), detect_active_app(), GET /api/activities handler, get_activity_report Tauri command (+7 more)

### Community 41 - "Plano do player de musica"
Cohesion: 0.11
Nodes (16): clamp_position() progress guard, current() SMTC session read, media_play, media_pause, media_next, media_previous Tauri commands, media.rs module, MediaBox.tsx compact media box, MediaStatus enum, MediaTab.tsx expanded Music tab, MediaView struct (+8 more)

### Community 77 - "Notas do auto-update (v0.4.1)"
Cohesion: 0.25
Nodes (6): capabilities default.json updater and process permissions, latest.json GitHub Releases endpoint, lib.rs updater and process plugin registration, tauri.conf.json updater plugin config (pubkey and endpoints), Release process: signed bundle plus latest.json uploaded to GitHub release, Auto-update Implementation Plan

### Community 8 - "Planos do backend de estado"
Cohesion: 0.07
Nodes (38): Per-day focus seconds log (focus_secs_by_day), Backend cut: state, commands and lib rewritten around the tracker, Clock going backwards never reports more than planned, New AppConfig fields (notch style, accent, scale, default minutes), Verification in the real Windows app (window, mouse, hotkey, 5-minute block), Front-end pure helpers (progress.ts, activity.ts, reorder.ts, scale.ts) with vitest, GitHub login, PR/issue import and 5-minute refresh kept unchanged, Panel opens 250 ms after hover and closes 400 ms after leaving (+30 more)

## Ambiguous Edges - Review These
- `Leitura do app em primeiro plano a cada 1 s (GetForegroundWindow)` → `Remocao do modo foco com varredura de processos`  [AMBIGUOUS]
  docs/superpowers/specs/2026-10-17-activity-tracking-design.md · relation: conceptually_related_to
- `Leitura do app em primeiro plano a cada 1 s (GetForegroundWindow)` → `Tempo por ferramenta fora de escopo (exigiria varrer processos)`  [AMBIGUOUS]
  docs/superpowers/specs/2026-10-17-activity-tracking-design.md · relation: conceptually_related_to
- `Armazenamento SQLite local com retencao de 90 dias` → `Modelo de tarefa (tasks.json) e AppConfig`  [AMBIGUOUS]
  docs/superpowers/specs/2026-10-17-activity-tracking-design.md · relation: conceptually_related_to
- `README do focusbrew` → `Gerenciador npm (package-lock), sem migrar pro Bun sem perguntar`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Widget window sizes per state (140x14 parked, 320x44 running, 470x230 open)` → `Verification in the real Windows app (window, mouse, hotkey, 5-minute block)`  [AMBIGUOUS]
  docs/superpowers/plans/2026-10-05-daily-notch.md · relation: conceptually_related_to

## Knowledge Gaps
- **393 isolated node(s):** `Section`, `KeyCombo`, `RowProps`, `Props`, `UpdateAction` (+388 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 669 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Tracker` connect `Testes do tracker (regras de tempo)` to `Log de atividade (Rust)`, `Timer (Rust)`?**
  _High betweenness centrality (0.000) - this node is a cross-community bridge._
- **What connects `Section`, `KeyCombo`, `RowProps` to the rest of the system?**
  _393 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tela de configuracoes (UI)` be split into smaller, more focused modules?**
  _Cohesion score 0.06377151799687011 - nodes in this community are weakly interconnected._
- **Should `Painel e widget (UI)` be split into smaller, more focused modules?**
  _Cohesion score 0.07598371777476255 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Leitura do app em primeiro plano a cada 1 s (GetForegroundWindow)` and `Remocao do modo foco com varredura de processos`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Leitura do app em primeiro plano a cada 1 s (GetForegroundWindow)` and `Tempo por ferramenta fora de escopo (exigiria varrer processos)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Armazenamento SQLite local com retencao de 90 dias` and `Modelo de tarefa (tasks.json) e AppConfig`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._