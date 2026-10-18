# Prompt para Implementação — Activity Tracking & Time Reports

**Contexto:**
Você vai implementar a feature Activity Tracking no projeto focusbrew (D:\Projetos\focusbrew) seguindo o plano detalhado em `docs/superpowers/plans/2026-10-17-activity-tracking-implementation.md`.

**Instrução Principal:**
Implemente o plano **tarefa por tarefa**, na ordem exata. Para cada tarefa:
1. Leia o brief da tarefa (está no arquivo do plano)
2. Siga os steps em ordem: escreva testes falhando → rode para confirmar → implemente → rode novamente (deve passar) → commit
3. Antes de passar pra próxima tarefa, rode `cargo test` pra confirmar tudo passa
4. Faça commit exatamente como descrito no passo "Commit" da tarefa

**Tarefas (8 no total):**

1. **Task 1: Windows Service Skeleton & WinAPI Bindings**
   - Cria: `src-tauri-service/Cargo.toml`, `src/detector.rs`, `src/models.rs`, `src/main.rs`
   - Testes: verificam `detect_active_app()` retorna app_name, idle status, timestamp corretos
   - Implementa: GetForegroundWindow (a cada 1 seg), GetLastInputInfo (10 min threshold)

2. **Task 2: SQLite Schema & Storage Layer**
   - Cria: `src-tauri-service/src/storage.rs`, `tests/test_storage.rs`
   - Testes: init schema, write_activity, query_activities (agrupa por app), cleanup_old_records
   - Implementa: struct Storage, métodos CRUD, limpeza de dados com 90 dias default

3. **Task 3: HTTP API Server & Endpoints**
   - Cria: `src-tauri-service/src/api.rs`, `tests/test_api.rs`
   - Modifica: `src/main.rs` (inicia servidor HTTP)
   - Endpoints: GET /api/activities, GET/POST /api/config, GET /api/health
   - Testes: validam respostas JSON corretas

4. **Task 4: Tauri HTTP Client & Commands**
   - Cria: `src-tauri/src/activity_tracking/mod.rs`, `client.rs`, `models.rs`
   - Modifica: `src-tauri/src/commands.rs`, `main.rs`
   - Tauri commands: `get_activity_report(from, to)`, `get_idle_threshold()`, `update_idle_threshold(minutes)`

5. **Task 5: Activity Report UI Component**
   - Cria: `src/components/ActivityReport.tsx`, `src/pages/ActivityPage.tsx`
   - Modifica: `src/App.tsx` (adiciona aba Activity)
   - UI: período selector (Today/Week/Month/Custom), bar chart + tabela de apps, summary

6. **Task 6: Settings Integration**
   - Modifica: `src/components/Settings.tsx`
   - UI: slider idle threshold (1-60 min), dropdown retention (30/90/180 dias)

7. **Task 7: Windows Service Registration & Installer**
   - Cria: `src-tauri-service/build.rs`, `src-tauri-service/install-service.ps1`
   - Script PowerShell pra registrar serviço como Windows Service (auto-start)

8. **Task 8: Integration Tests & Verification**
   - Cria: `src-tauri-service/tests/integration_tests.rs`
   - Teste end-to-end: service coleta → armazena → API retorna

**Banco de Dados (SQLite):**
```sql
CREATE TABLE activities (
  id INTEGER PRIMARY KEY,
  app_name TEXT NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  is_idle INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

**Constraints Globais:**
- Apenas Windows 10+ (usa WinAPI)
- Linguagem: Rust (Tauri + service)
- Porta HTTP: 8765 (localhost)
- Idle threshold default: 10 minutos
- Retenção default: 90 dias
- Branch: `dev` (já criado)

**Spec & Design:**
- Design: `docs/superpowers/specs/2026-10-17-activity-tracking-design.md`
- Plan: `docs/superpowers/plans/2026-10-17-activity-tracking-implementation.md`

**Saída Esperada:**
- Todos os testes passando (`cargo test` no final)
- Commits limpos, um por tarefa (como descrito)
- Branch `dev` com histórico completo
- UI funcional (período selector, gráfico, tabela)
- Serviço Windows rodando 24/7 coletando dados

**Parar Se:**
- Algum teste não passar e você não conseguir debugar (descreve o erro, parar aí)
- Dependência não compilar (descreve qual, parar aí)
- Algo contradizer a spec (levanta o conflito, parar aí)

Caso contrário, execute tudo sem pausar — você foi aprovado pra fazer as decisões necessárias.

---

**Repo:**
- Local: `D:\Projetos\focusbrew`
- Branch atual: `dev`
- Git ready: sim (worktree clean)

**Go!**
