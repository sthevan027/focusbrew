# Política de versões

> Written for: o Sthevan e quem for publicar uma release do FocusBrew. Vale para o repo `sthevan027/focusbrew`. Modelo: a política de versões do Pacer (`sthevan027/pacer`, `docs/politica-de-versoes.md`).

## Esquema

Versão no formato **SemVer**, com sufixo de pré-release antes da final:

| Tipo | Exemplo | Quando usar |
|---|---|---|
| Alpha | `0.5.0-alpha.1` | Build interno, pode quebrar. Só pra testar a ideia ou um fluxo novo |
| Beta | `0.5.0-beta.1` | Funcionalidades completas, aberto a testers. Correções entram como `beta.2`, `beta.3`… |
| RC | `0.5.0-rc.1` | Candidata a final. Só correção de bug, sem feature nova |
| Final | `0.5.0` | Versão pública. É a única que o updater oferece e fica como *Latest* |

- **MAJOR.MINOR.PATCH:** `MAJOR` quebra compatibilidade, `MINOR` é funcionalidade nova, `PATCH` é correção.
- **Tag Git:** `v` + versão. Ex.: `v0.5.0-beta.1`.
- **Ordem:** `0.5.0-alpha.1` < `0.5.0-beta.1` < `0.5.0-rc.1` < `0.5.0`.

## Onde a versão mora

A versão precisa ser igual em **três arquivos**, mais o lockfile que o build atualiza:

1. `package.json` → `version`
2. `src-tauri/tauri.conf.json` → `version` (define o nome do instalador)
3. `src-tauri/Cargo.toml` → `version`
4. `src-tauri/Cargo.lock` → entrada `focusbrew` (o `cargo` regenera ao compilar; commitar junto)

O instalador sai como `focusbrew_<versão>_x64-setup.exe`. O updater procura `latest.json` em `releases/latest`, então o nome e o `latest.json` precisam bater com o que o Tauri gera.

## Regras de publicação no GitHub

- **Pré-release** (alpha, beta, rc): criar com **Set as a pre-release** e **sem** marcar como *Latest*.
- **Final:** criar com **Set as the latest release**.
- **Nunca** publicar release em rascunho (*draft*) para o updater enxergar.

## Quem vê o quê

| Canal | Onde aparece | Como o usuário recebe |
|---|---|---|
| Final | GitHub como *Latest* e `latest.json` | O updater do app oferece a atualização |
| Beta / RC / alpha | Só na lista de pré-releases do GitHub | Baixa o instalador manualmente |

Como o endpoint do updater é `releases/latest`, o GitHub nunca entrega pré-release para o updater. Quem está na 0.4.1 não recebe o beta sozinho.

## Credenciais que não podem ir para release pública

- **`FOCUSBREW_GOOGLE_CLIENT_SECRET`**: é lida em tempo de compilação. Um instalador compilado com ela **contém a chave** (confirmável com `grep` no `.exe`). Por isso **nenhuma release pública é compilada com o secret**. Sem ele, o botão "Conectar com o Google" mostra *"FOCUSBREW_GOOGLE_CLIENT_SECRET não estava definido no build"*. Antes da release final com Agenda, a integração precisa de uma forma de conexão que não exponha a chave no instalador.
- **`TAURI_SIGNING_PRIVATE_KEY`**: chave do updater. Sem ela o `tauri build` gera o instalador mas termina com erro na assinatura, e não há `latest.json`. Para pré-release isso é aceitável porque não há `latest.json` público; para a final é obrigatório.

## Passo a passo para publicar

1. **Branch** de release, ex.: `release/0.5.0-beta.1`.
2. **Bump** da versão nos arquivos acima. Commit: `chore(release): 0.5.0-beta.1`.
3. **Build:** `bun run tauri build` com as credenciais que o build exige. Para beta pública, **sem** `FOCUSBREW_GOOGLE_CLIENT_SECRET`. O instalador sai em `src-tauri/target/release/bundle/nsis/`.
4. **Conferir** que o instalador não contém credenciais: `grep -c "GOCSPX-"` no `.exe` deve dar `0`.
5. **Testar** o instalador numa máquina limpa ou instalando por cima da versão anterior.
6. **Tag** no commit de release: `git tag v0.5.0-beta.1` e `git push origin v0.5.0-beta.1`.
7. **Criar a release** com o instalador anexado:
   ```bash
   gh release create v0.5.0-beta.1 \
     "src-tauri/target/release/bundle/nsis/focusbrew_0.5.0-beta.1_x64-setup.exe" \
     --prerelease --title "FocusBrew 0.5.0-beta.1: <resumo>" --notes-file NOTAS.md
   ```
8. **Promover a final** (quando o beta estiver estável): repetir com a versão sem sufixo, usando `--latest` em vez de `--prerelease`, e gerar o `latest.json` assinado para o updater.

## Histórico

- `v0.1.0` a `v0.4.1`: finais, sem pré-release. A 0.4.1 é a última publicada antes do Google Agenda.
- `v0.5.0-beta.1`: primeira pré-release do FocusBrew. Traz a integração com o Google Agenda, sem a credencial de build.
