# focusbrew — Auto-update

**Data:** 2026-10-09 · **Branch:** a definir no plano de implementação.

## 1. Objetivo

**Dito pelo Sthevan:** quer o focusbrew (e depois o pacer, fora de escopo aqui)
sempre atualizado pra quem usa, com uma forma de sincronizar puxando a versão
final/pronta mais recente — um botão de sincronização no próprio app, no
estilo de uma área de "Atualizações" que ele já usa em outro app (print de
referência): versão atual, "Verificado às HH:MM" e um botão de ação.

**Sucesso:** o app checa sozinho ao abrir se existe versão nova e mantém esse
status visível nas configurações sem precisar de ação nenhuma; quem quiser
forçar a checagem ou aplicar a atualização agora, clica num botão e o app
baixa, instala e reinicia sozinho.

**Fica de fora desta spec:** replicar pro pacer (próximo projeto separado,
mesma mecânica depois de validada aqui), automação via CI/GitHub Actions
(releases continuam manuais como hoje), checagem de update fora da aba de
configurações (ex: notificação do Windows, badge na bandeja).

## 2. Mecanismo

Plugin oficial `tauri-plugin-updater` (Tauri v2) + `tauri-plugin-process` (pro
relaunch depois de instalar). É um sistema de assinatura **separado** do
certificado de code-signing do Windows que já assina o instalador NSIS
(`certificateThumbprint` no `tauri.conf.json`) — o updater usa um par de
chaves próprio (minisign), gerado uma vez com `bun run tauri signer generate`.

- Chave **pública** vai em `tauri.conf.json` → `plugins.updater.pubkey`,
  versionada no repo normalmente.
- Chave **privada** fica fora do repo, numa variável de ambiente local
  (`TAURI_SIGNING_PRIVATE_KEY` + senha em `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)
  usada só na hora do build de release. Documentar isso no README de dev, não
  commitar o arquivo da chave em lugar nenhum.

## 3. Endpoint e processo de release

Endpoint fixo no `tauri.conf.json`:
```
https://github.com/sthevan027/focusbrew/releases/latest/download/latest.json
```
Como é sempre "latest", nunca muda de release pra release — zero manutenção
de URL.

Processo de release (continua manual, só ganha um passo):
1. `bun run tauri build` — com o updater configurado, o bundler já gera,
   além do instalador normal, o artefato `.nsis.zip` assinado e o
   `latest.json` (versão, notas, data, URL do artefato, assinatura).
2. Subir os arquivos de sempre na release do GitHub + o `latest.json` novo.

Nenhuma infraestrutura nova — mesmo fluxo de hoje, um arquivo a mais no
upload.

## 4. Comportamento no app

**Checagem automática (silenciosa):** ao abrir o app, dispara uma checagem
em background contra o endpoint. Sucesso ou falha, atualiza o horário de
"última verificação" guardado (pra mostrar "Verificado às HH:MM" na aba de
configurações). Falha de rede nessa checagem **não mostra nada** pro usuário
— só não atualiza o status, tenta de novo na próxima abertura.

**Aba de configurações — área "Atualizações":**
- Nome + versão atual do app.
- Texto de status: "Você está na versão mais recente. Verificado às HH:MM."
  (sem atualização) ou "Versão X.Y.Z disponível. Verificado às HH:MM." (com
  atualização).
- Botão: **"Verificar agora"** (sem atualização pendente — força nova
  checagem na hora) ou **"Atualizar agora"** (atualização disponível —
  baixa, instala e reinicia o app).
- Durante o download/instalação, o botão mostra estado de carregando e fica
  desabilitado; erro nessa etapa aparece como texto curto abaixo do botão
  (não trava o app, não é modal).

## 5. Dados e estado

**Revisado após pesquisa da API do `tauri-plugin-updater`:** não passa por
Rust. A janela `main` (configurações) já carrega seu webview no boot mesmo
com `visible: false` — é assim que `show_main_window` hoje só mostra/foca
uma janela que já existe, sem recriar nada — então a checagem "ao abrir o
app" roda direto do React (`@tauri-apps/plugin-updater`), sem precisar de
estado nem comando Rust novos. Estado (última checagem, versão disponível,
checando/instalando, erro) vive só em memória do React, perdido ao fechar o
app — não precisa persistir em disco entre sessões, já que a checagem roda
de novo a cada abertura.

## 6. Testes

Mesmo padrão dos planos anteriores: testes unitários Rust pro parsing da
resposta do updater e pro estado (checagem recente vs nunca checado, versão
nova vs já atualizado), e verificação manual real do instalador — empacotar
uma versão N, instalar, empacotar N+1 com o update configurado, confirmar que
"Verificar agora" encontra e "Atualizar agora" baixa/instala/reinicia sem
travar (mesmo nível do Task 12 do plano do daily-notch).
