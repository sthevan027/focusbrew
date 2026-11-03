# focusbrew — Captura por voz e entrada externa (Wispr Flow como primeiro cliente)

**Data:** 2026-10-31 · **Estado:** rascunho de design, sem código. **Branch:** a definir no plano (hoje o repo está em `dev`). Nada deste documento foi implementado.

Legenda: **[Sthevan]** = decidido por ele nas perguntas de 31/10. **[Eu]** = escolha minha, ele não decidiu, pode trocar. **[Fato]** = verificado no código ou em fonte oficial.

## 1. Objetivo

**[Sthevan]** Ligar o Wispr Flow ao Focus Brew para:
1. tarefas combinadas em reuniões (gravadas pelo Wispr) virarem atividades do Focus Brew;
2. criar e ajustar tarefas por voz (tempo, dia, `#projeto`);
3. salvar trechos importantes (algo que acabou de ditar, uma frase de reunião, texto copiado) nas notas.

Tem de ser fluido, sem bugs e **sem atrapalhar quem usa o app sem o Wispr**. O app é público: pensar em qualquer usuário, não só nele. O teste real será só com o Wispr, mas o código é genérico (**[Sthevan]**).

**Sucesso (os quatro valem, **[Sthevan]**):**
- S1. Da fala ao item criado em menos de 5 s pela caixa de captura.
- S2. Puxar a mesma reunião duas vezes não duplica nada. Nenhuma tarefa/nota se perde se o app fechar no meio. Este é o critério mais importante (**[Eu]**, derivado da Q5: perda é o pior erro, depois erro, depois duplicata).
- S3. Com a integração desligada o app se comporta como hoje (os 240 `#[test]` de `src-tauri` seguem passando, nenhum código novo roda).
- S4. Fila visível: nada entra em silêncio.

## 2. Fora de escopo (**[Sthevan]**, mantido)

Capturar áudio ao vivo · ler a tela · ler os arquivos locais do Wispr (`flow.sqlite`, `meetings/*.ndjson`) · escrever algo de volta no Wispr · a voz concluir ou apagar tarefas · busca automática de reuniões feita pelo próprio app (fica para uma fase posterior, ver §9).

## 3. Fatos que condicionam o desenho

- **[Fato]** O Wispr Flow só digita na janela em foco. O Command Mode (desligado por padrão) edita texto selecionado, rascunha e faz busca; não há como acionar um app externo por frase falada. Logo, "voz → Focus Brew" precisa de um lugar onde o ditado possa ser digitado: a caixa de captura.
- **[Fato]** O MCP oficial do Wispr é remoto, **somente leitura**, com OAuth e exige Notetaker com Cloud Sync ligado (bloqueado em contas HIPAA; contas Enterprise precisam de admin). Não há campo estruturado de action items: elas saem da transcrição. Os nomes das ferramentas não estão na documentação oficial (lista conhecida: fonte de terceiros).
- **[Fato]** No Focus Brew hoje não existe porta de entrada para tarefa/nota: a segunda instância só mostra a janela (`lib.rs:347`) e a API em `127.0.0.1:8765` é do serviço de atividade, sem autenticação, sem rotas de tarefa/nota.
- **[Fato]** O estado vive em memória (`Shared(Mutex<AppState>)`, `NotesShared`); o app não vigia arquivos; `tasks::save` usa `fs::write` não atômico com erros ignorados; `notes.rs` já faz tmp+rename e quarentena. Conclusão: **o app tem de ser o único escritor**; escritor externo direto em `tasks.json`/`notes.json` perde dados.
- **[Fato]** `add_task(title, day)` não recebe duração (usa `default_minutes`); `set_task_minutes(id, minutes)` existe; `save_note(Note)` aceita id escolhido pelo chamador (texto até 20.000 caracteres, 1.000 notas). `google_sync::decide` é uma função pura que serve de modelo para dedupe por id externo.

## 4. Arquitetura

```
 Wispr (ditado)         Claude (conector Wispr, lê reuniões)
      │ digita                  │ extrai "o que é meu"
      ▼                         ▼
 ┌──────────────┐     ┌──────────────────────────────┐
 │ Caixa de     │     │ Skill (curl) → porta local    │──token──┐
 │ captura      │     │  ou arquivo na pasta de       │         │
 │ (atalho)     │     │  entrega (app fechado)        │         │
 └──────┬───────┘     └───────────────┬───────────────┘         │
        │ confirmado (Enter)          │ nunca grava direto      │
        │                             ▼                         ▼
        │                    ┌─────────────────┐       ┌────────────────┐
        │                    │ Caixa de        │◄──────│ Ingestão       │
        │                    │ sugestões       │       │ (valida, dedupe│
        │                    │ (inbox.json)    │       │  external_ref) │
        │                    └────────┬────────┘       └────────────────┘
        │                             │ aceitar (clique)
        ▼                             ▼
   ┌────────────────────────────────────────┐
   │ Caminho único de gravação já existente │
   │ apply() → add_task / set_task_minutes  │
   │ NotesStore.upsert → save_note          │
   └────────────────────────────────────────┘
```

**Regra única (Q31, [Sthevan]):** tudo que vem de fora (porta ou pasta de entrega) cai primeiro na caixa de sugestões. **Só a caixa de captura grava direto**, porque a pessoa dita, vê a pré-visualização e confirma.

### 4.1 Caixa de captura
- Janela pequena aberta por atalho global (configurável; padrão a definir sem conflito com os atalhos atuais, ver §10). Cabe a ela receber o ditado do Wispr como se fosse teclado. Abre já preenchida com o conteúdo da área de transferência quando a pessoa copiou algo antes (Q29: "copiar + atalho"; o app não lê a tela).
- **Interpretador sem IA**, função pura em Rust (`parse_capture`), testável sem janela. Palavra-chave inicial, com sinônimos em português e inglês: `tarefa`/`task`/`atividade` → tarefa; `nota`/`note` → nota; `tempo`/`time` + número → altera minutos. Extrai opcionalmente dia ("hoje", "amanhã", data) e `#projeto`.
- **Pré-visualização antes de gravar**; Enter confirma, Esc cancela. Se não entender, **não grava nada**: mostra o texto e oferece os botões "Tarefa" e "Nota" (Q25).
- "tempo 40": aplica ao timer ativo; sem timer ativo, à última tarefa criada; se houver empate, mostra lista curta para escolher (Q17).
- Nota por voz = **nota nova**, com a origem anotada ("ditado, 31/10 12:40") (Q19). Texto acima de 20.000 caracteres é recusado com aviso.

### 4.2 Caixa de sugestões e janela de reuniões
- Armazenamento **separado**: `inbox.json` com escrita atômica (tmp + rename, como `notes.rs`) e quarentena em caso de arquivo corrompido (**[Sthevan]** Q14: arquivo separado).
- Cada sugestão: `id`, `kind` (`task`|`note`), `title`/`text`, `minutes?`, `day?`, `project?`, `external_ref {source,id}`, `origin {label, date, ref}`, `created_at`, `expires_at`. Aceitar → chama o caminho de gravação existente; descartar → grava a chave no livro de descartes.
- **Janela/aba "Reuniões"** no painel: lista as reuniões que chegaram (título, data, origem) com as sugestões de cada uma e o estado (pendente, aceita, descartada, vencida) (Q2 → Q28, [Sthevan] aceitou a recomendação). Mostra só o que o Claude enviou; nenhuma transcrição é guardada (Q6).
- Valores padrão de tarefa vinda de reunião (**[Sthevan]** Q15): dia = hoje; duração = padrão do app se não foi dita; sem `#projeto` automático; `source = wispr`; id da reunião na observação da tarefa. Sincroniza com o Google Agenda como as manuais (Q16).

### 4.3 Porta local e pasta de entrega
- **Porta** (**[Sthevan]** Q10/Q12): servidor dentro do processo do app, só em `127.0.0.1`, **porta fixa e configurável**, **desligada por padrão**. Token gerado ao ativar, guardado no `keyring` (serviço `focusbrew`), mostrado em Configurações → Integrações para copiar; botão de regenerar. **[Eu]** Porta padrão 8766 (a 8765 é do serviço de atividade). Rotas v1: `POST /v1/inbox` (lista de itens), `GET /v1/health`. Header `Authorization: Bearer`, comparação em tempo constante, checagem de `Host`, sem CORS, corpo máximo de 64 KB, limite de pedidos por minuto, itens validados com os mesmos limites do app (título 200, nota 20.000).
- **Pasta de entrega** (**[Sthevan]** Q20: fila; **[Sthevan]** Q30 aceitou a opção (a)): quando o app está fechado, quem envia grava **um arquivo JSON por pedido** em uma pasta dentro dos dados do app (**[Eu]** `inbox-drop\` dentro da pasta **local** de dados do app, `%LOCALAPPDATA%\sthevandev\focusbrew\data\`; o `data_dir()` atual fica em Roaming, então o código ganha `local_data_dir()`). Na abertura (e enquanto a integração estiver ligada) o app lê, valida, ingere na caixa de sugestões e move para `processed/` ou `rejected/`. O arquivo não tem token; por isso nada dali grava direto, tudo cai na caixa de sugestões, e a ingestão aplica os mesmos limites e esquema.
- **Fila visível (S4):** contador de pendentes na caixa de sugestões; **[Eu]** sugestões vencem em 7 dias, com aviso no 5º; nunca somem em silêncio.

### 4.4 Identificador externo e duplicatas
- Novo campo genérico `external_ref {source, id}` em `Task` e nas sugestões (**[Sthevan]** Q13). Para reuniões, `id` = id da reunião + resumo (hash) do texto do item.
- **[Eu] Chave estável contra reformulação.** O hash do texto sozinho quebraria S2, porque o Claude pode reescrever o mesmo item numa nova puxada. Por isso: (1) a skill normaliza o título do item (minúsculas, sem acentos, sem pontuação, primeiros 60 caracteres) e usa `id = <id da reunião>:<título normalizado>`; (2) `decide_ingest` também compara por semelhança (sobreposição de palavras ≥ 0,8) com as chaves já conhecidas **da mesma reunião**; (3) o livro guarda as reuniões já processadas, e puxar uma reunião de novo não reextrai nada a menos que a pessoa peça "reprocessar" na aba Reuniões.
- Dedupe em quatro lugares: sugestões pendentes, tarefas existentes, **livro de descartes** e tarefas aceitas e depois **apagadas** (**[Eu]**: sem isso, a tarefa que você apagou voltaria na próxima busca da mesma reunião; apagar conta como descartar). Tarefa concluída ou editada continua em `tasks`, e o dedupe a enxerga lá. Se já existe, a chamada vira "nada a fazer", sem erro.
- Padrão de implementação: uma função pura `decide_ingest(item, estado) → Criar | Atualizar | Ignorar`, no estilo de `google_sync::decide`.

### 4.5 Lado do Claude
- **[Eu] Superfície:** a skill roda no **Claude Code, no mesmo PC** (tem shell, alcança `127.0.0.1` e a pasta de entrega, e este ambiente já tem o conector do Wispr). Claude.ai/Desktop sem shell **não** é suportado na v1. **Token:** a skill lê a variável de ambiente `FOCUSBREW_TOKEN` ou, se ela não existir, um arquivo `integration-token` na pasta local de dados do app (`%LOCALAPPDATA%\sthevandev\focusbrew\data\`) (cópia do token mostrada em Configurações, com ACL restrita ao usuário); sem token, a skill para e avisa, não grava na pasta. **Escolha de caminho:** primeiro `GET /v1/health` na porta; se responder, `POST /v1/inbox`; se der "conexão recusada" (app fechado **ou** integração desligada), grava um arquivo na pasta de entrega e diz isso à pessoa.
- Primeira versão (**[Sthevan]** Q11): uma **skill que chama a porta com `curl`** (e grava na pasta de entrega quando o app está fechado). Ela usa o conector do Wispr para buscar a reunião, separa o que é do Sthevan e envia. Quem separa é o Claude, só quando ele pede (**[Sthevan]** Q9/Q28); o Focus Brew não guarda chave de IA.
- **[Eu]** A skill é entregue no repo como exemplo (`tools/`); instalar na máquina dele só sob pedido.
- Evolução possível (não v1): servidor MCP local com ferramentas `criar_tarefa`, `mudar_tempo`, `adicionar_nota`.

## 5. Dados e pré-requisito de robustez

**Pré-requisito (PR separado e primeiro, **[Sthevan]** Q21/Q22):**
- Gravação atômica (tmp + rename) de `tasks.json`, `activity.json` e `settings.json`, hoje `fs::write` com `let _ =`.
- Carga que não devolve lista vazia em silêncio: arquivo inválido vai para quarentena, como `notes.rs`.
- **Logs no backend Rust** (hoje não há nenhum): **[Eu]** arquivo rotativo em `data_dir/logs`, nível configurável, registrando ids, contagens e erros, **nunca** o texto de tarefas, notas ou reuniões.
- Os 12 `let _ =` que engolem erro de gravação passam a registrar log.

## 6. Modos de falha

| Falha | Comportamento |
|---|---|
| Interpretador não entende | Não grava; mostra texto e botões Tarefa/Nota |
| Token errado/ausente | 401 e log; nada entra |
| Porta já ocupada | A integração fica desligada com mensagem em Configurações, o app segue normal |
| App fechado | Pedido vai para a pasta de entrega e entra na abertura |
| Arquivo da pasta inválido ou grande demais | Vai para `rejected/` com motivo no log |
| `inbox.json` corrompido | **[Eu]** O arquivo vai para quarentena (`inbox.corrupt-<data>.json`) e o app carrega a geração anterior (`inbox.prev.json`, mantida a cada gravação), com aviso visível. Configurações → Integrações tem "Restaurar da quarentena", que reingere os itens válidos passando pelo dedupe. Só "recomeça vazio" se não houver geração anterior, e o aviso diz isso |
| Arquivos na pasta com a integração desligada | **[Eu]** O app não lê a pasta nem roda nada novo (S3). Em Configurações → Integrações aparece "N pedidos aguardando; ligue a integração", e a skill já avisou na hora que gravou na pasta. Arquivos com mais de 7 dias são movidos para `rejected/` (motivo: vencido) no próximo uso da integração |
| Sugestão vencida | Marcada como vencida, aviso antes; não é apagada em silêncio |
| Mesma reunião puxada duas vezes | `external_ref` evita duplicata |
| Crash no meio da gravação | Gravação atômica; no pior caso mantém a versão anterior |
| Integração desligada | Nenhum servidor, nenhuma leitura da pasta, nenhum atalho registrado |

## 7. Segurança e privacidade

Escuta só em loopback; token obrigatório; desligada por padrão; corpo limitado; nenhum conteúdo pessoal nos logs. Transcrições de reunião nunca são copiadas para o disco do Focus Brew: só título da tarefa, origem e id da reunião (**[Sthevan]** Q6). A pasta de entrega não autentica, por isso só alimenta a caixa de sugestões.

## 8. Entrega em fases (cada uma é uma branch/PR; os critérios S1–S4 são os testes de aceite)

- **F0 — Robustez e logs.** Escrita atômica, quarentena, logging. Aceite: simular corte no meio da gravação não perde dados; testes atuais passam.
- **F1 — Caixa de captura.** `parse_capture` (testes por tabela), janela, atalho, integração com `add_task`/`set_task_minutes`/`save_note`. Aceite S1, S3.
- **F2 — Caixa de sugestões, porta e pasta de entrega.** `inbox.json`, `external_ref`, ingestão com dedupe, servidor local com token, interruptor em Configurações → Integrações, contador de pendentes. Aceite S2, S4.
- **F3 — Janela de reuniões e skill do Claude.** Aba "Reuniões", skill de exemplo, teste ponta a ponta com uma reunião real do Wispr. Antes: confirmar com chamada real os nomes das ferramentas do MCP do Wispr.

Partes independentes para trabalho paralelo por agentes dentro de uma fase: `parse_capture` (pura), `decide_ingest` (pura), armazenamento atômico (E/S), servidor local, telas.

## 9. Fase posterior (não faz parte das fases acima)

O Focus Brew buscar reuniões sozinho, como cliente do MCP do Wispr. **[Fato]** Tecnicamente possível (login com registro automático de cliente e PKCE), mas o redirecionamento local não está testado, os termos de serviço proíbem acesso fora de "interfaces publicamente suportadas" e não está claro se um app de terceiros se enquadra, e separar "o que é meu" exigiria chave de IA no app ou uma regra por nome. Só considerar depois de testar o login e de perguntar ao suporte do Wispr.

## 10. Deixado para quem for construir

Atalho global padrão (sem conflito com os atuais) · forma exata do esquema JSON · gramática fina do interpretador (números por extenso, "1 hora") · visual da caixa de captura e da aba Reuniões · texto das mensagens de erro · formato do arquivo de log e rotação.

## 11. Pendências externas

Confirmar nomes das ferramentas do MCP do Wispr por chamada real · perguntar ao suporte do Wispr sobre uso por app de terceiros (só para a fase posterior) · conferir se o Notetaker do Sthevan tem Cloud Sync ligado.

## 12. Complementos da revisão final (31/10)

Itens que o rascunho tinha deixado de fora. Todos são **[Eu]** e podem ser trocados.

- **Compatibilidade de dados.** `external_ref` entra em `Task` com `#[serde(default)]`, para o `tasks.json` de quem já usa o app continuar abrindo. Todo arquivo novo (`inbox.json`, livro de descartes) tem campo `version`. Configurações novas (integração ligada, porta, atalho, preenchimento pela área de transferência) têm padrão e não exigem migração.
- **Novo valor de `source`.** Hoje `source` é `manual | github | google_calendar`. Acrescentar `wispr` mexe nos `match` do Rust (incluindo `google_sync`, onde tarefas do GitHub dão `Noop`), nos tipos do frontend e nos testes. Como o código é genérico (Q26), o valor deve se chamar `external` e a origem concreta ("wispr") fica em `external_ref.source`. Isso corrige a menção a `source = wispr` nas seções 4.2 e 8.
- **Área de transferência é opcional.** Preencher a caixa de captura com o que foi copiado pode expor uma senha ou um dado privado. Fica **desligado por padrão**, com um interruptor em Configurações → Integrações; ligado, a caixa mostra o conteúdo antes de qualquer gravação.
- **Porta só cria `task` e `note` na v1.** Alterar o tempo de uma tarefa existente é feito só pela caixa de captura (confirmada por você). Pela porta, não.
- **Histórico de reuniões.** A aba Reuniões precisa lembrar reuniões depois de as sugestões serem aceitas. **[Eu]** Guarda título, data, origem e estado das sugestões por 90 dias e depois apaga; nunca guarda a transcrição.
- **Fuso horário.** Os horários do Wispr chegam em UTC e o "hoje" é o dia local. A skill converte para o fuso local antes de enviar, e a tarefa de reunião entra no dia local da data atual (Q15).
- **Ativar e desativar sem reiniciar.** Ligar ou desligar a integração registra ou remove o atalho global e sobe ou derruba a porta na hora. Se o atalho já estiver ocupado por outro programa ou a porta estiver em uso, a tela diz isso e a integração fica desligada, sem afetar o resto do app.
- **Documentação.** O README ganha uma seção curta: o que a integração faz, o que fica desligado por padrão, o que é guardado e como instalar a skill de exemplo. Nova versão do app só se você quiser publicar (decisão sua, fora das fases).
