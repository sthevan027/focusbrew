# focusbrew — Sincronização com o Google Agenda

**Data:** 2026-10-12 · **Branch:** a definir no plano de implementação.

## 1. Objetivo

**Dito pelo Sthevan:** quer o FocusBrew conversando com o Google Agenda nos
dois sentidos — puxar eventos do dia como tarefas (ele escolhe quais, um a
um, não é automático por calendário) e, no outro sentido, toda tarefa criada
no FocusBrew já nascer como evento na Agenda. Concluir, editar ou excluir
uma tarefa/evento de um lado precisa refletir no outro.

**Sucesso:** o usuário conecta a conta Google uma vez (OAuth, igual à
conexão do GitHub hoje). Todo dia, ele vê os eventos da Agenda daquele dia
numa lista com checkbox e escolhe quais entram como tarefa. Toda tarefa
criada no app aparece na Agenda. Marcar como feita, editar o título/horário
ou excluir, de qualquer lado, se reflete no outro em poucos minutos sem
ação manual.

**Fica de fora desta spec:** Google Tasks (API separada, foi descartada —
ver decisão abaixo), sincronizar calendários inteiros ou múltiplos
calendários (só o calendário principal do usuário), resolver conflito fino
quando os dois lados editam a mesma coisa ao mesmo tempo (usa a regra
simples "edição mais recente vence"), notificação/lembrete do evento.

**Decisão de API:** Google Calendar (eventos com horário), não Google
Tasks. Evento não tem campo nativo de "concluído" — resolvido marcando a
tarefa feita como `"✓ " + título original` no evento (reversível: remover o
prefixo desfaz a marcação dos dois lados).

## 2. OAuth e credenciais

Fluxo OAuth 2.0 do Google com PKCE (sem client secret fixo no binário — o
app é distribuído publicamente, igual ao FocusBrew hoje):

1. App abre o navegador padrão numa URL de autorização do Google
   (`https://accounts.google.com/o/oauth2/v2/auth`), com um servidor HTTP
   local temporário (`127.0.0.1:<porta livre>`) esperando o redirect —
   mesmo padrão de app desktop OAuth que outros apps Tauri usam.
2. Escopo: `https://www.googleapis.com/auth/calendar.events` (ler e
   escrever eventos, sem acesso a outros dados do Google).
3. Troca o `code` pelo `access_token` + `refresh_token`; só o
   `refresh_token` é guardado (`keyring`, serviço `focusbrew`, conta
   `google-refresh-token`, mesmo padrão de `github.rs`); o `access_token`
   fica em memória e é renovado via `refresh_token` quando expira.
4. Projeto novo no Google Cloud Console (`focusbrew`), Calendar API
   habilitada, client ID tipo "Desktop app" — documentar no README de dev,
   junto da chave do updater.

Novo módulo `src-tauri/src/google_calendar.rs`, espelhando a forma de
`github.rs` (funções `save_refresh_token`/`load_refresh_token`/`clear_token`,
`client()`, chamadas HTTP com `reqwest`).

## 3. Puxar eventos do dia

Nova aba (ou seção dentro de Tarefas) "Agenda", visível só com a conta
conectada:

- Ao abrir a aba (ou num refresh periódico, mesmo intervalo do GitHub —
  5 min), busca `GET /calendar/v3/calendars/primary/events` filtrado por
  `timeMin`/`timeMax` do dia local corrente.
- Lista os eventos do dia com checkbox, desmarcados por padrão. Eventos já
  importados (ver mapeamento abaixo) aparecem marcados e desabilitados.
- Marcar o checkbox cria a tarefa (`Task` com `source: "google_calendar"`,
  `minutes` estimado pela duração do evento, `day` = data do evento) e
  grava o par `task_id <-> google_event_id`.
- Desmarcar um evento já importado remove a tarefa correspondente (pede
  confirmação se ela já tem tempo registrado, mesmo texto de confirmação
  usado hoje pra excluir tarefa manual).

## 4. Mandar tarefas pro Google

Toda tarefa criada manualmente no FocusBrew (`source: "manual"`) dispara,
em background, a criação de um evento (`POST /calendar/v3/calendars/primary/events`)
com título = título da tarefa, horário = horário de criação + `minutes`
planejados, no dia da tarefa. Falha de rede nessa criação não bloqueia a
tarefa (ela continua existindo local, sem `google_event_id`) — tenta de
novo no próximo ciclo de sincronização.

Tarefas vindas do GitHub (`source: "github"`) **não** criam evento — só
tarefas manuais e as puxadas da própria Agenda (que já têm evento).

## 5. Sincronizar edição, conclusão e exclusão

Cada ciclo de sincronização (poll de 5 min + ao focar a janela, igual ao
GitHub):

- **Concluir no app:** `done = true` → renomeia o evento pra
  `"✓ " + título original` via `PATCH`. Desmarcar como feita remove o
  prefixo.
- **Concluir na Agenda** (usuário renomeia o evento com o prefixo "✓ " por
  fora do app): o próximo poll detecta o prefixo e marca a tarefa como
  feita no FocusBrew; removendo o prefixo na Agenda desmarca a tarefa.
- **Editar título/horário em qualquer lado:** o lado mais recente (campo
  `updated` do evento vs. `created_at`/horário de edição local da tarefa)
  vence e sobrescreve o outro no próximo poll.
- **Excluir em qualquer lado:** evento apagado (`404` no próximo fetch) →
  tarefa correspondente é removida; tarefa apagada no app → evento
  correspondente é apagado via `DELETE`.

## 6. Dados e estado

- `Task` ganha dois campos novos: `google_event_id: String | null` e
  `source` passa a aceitar `"google_calendar"` além de `"manual"` e
  `"github"`.
- `AppConfig` ganha `google_connected: bool` (não guarda e-mail/nome —
  suficiente pra saber se tem token válido) e `google_last_sync_ms: i64`
  (pra UI mostrar "Sincronizado às HH:MM", igual ao padrão de
  "Verificado às HH:MM" do updater).
- Nenhum arquivo novo de persistência: o mapeamento vive no próprio campo
  `google_event_id` de cada `Task`, já salvo em `tasks.json`.
- `StateSnapshot` ganha `google_connected`, `google_last_sync_ms` e
  `google_error: Option<String>` (mesmo padrão de `github_error` —
  erro não trava nada, só aparece no texto de status).

## 7. Testes

- Rust: parsing da resposta de eventos do Calendar API (incluindo evento
  sem horário de término, evento de dia inteiro, resposta vazia), lógica
  de "edição mais recente vence" (função pura comparando dois timestamps),
  detecção do prefixo "✓ " pra marcar/desmarcar conclusão.
- Frontend: lista de eventos com checkbox (marcar cria tarefa, desmarcar
  com tempo registrado pede confirmação).
- Verificação manual real: conectar conta de teste, puxar evento, marcar
  tarefa feita e confirmar o "✓ " aparecendo na Agenda de verdade, editar
  no app e confirmar refletido na Agenda e vice-versa.
