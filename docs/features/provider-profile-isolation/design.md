# provider-profile-isolation — design

Q1–Q6과 A–D는 사용자가 결정했다(§10). PoC(§8) 결과를 본 뒤의 결정(P0 실패 방향, Claude·Codex의 막는 방법)은 orch.md '결정 기록'에 있고, 이 문서는 그 결정대로 고쳐 적었다.

## 1. 영향 받는 구성 요소

- **app main (Electron + TS)**
  - fence를 다는 곳: `conversation/prepare.ts`가 `use === "run"`일 때만 `Prepared.fence`(`conversation/service.ts`의 `Prepared`에 새 선택 필드)를 채운다. 모델 목록(`use === "listing"`)과 legacy external에는 없다.
  - fence를 쓰는 세 spawn 지점: Codex app-server(`conversation/runners.ts`의 `spawn(..., "app-server")`), Claude Code(`runners.ts`의 SDK `spawnClaudeCodeProcess`), ACP 서버(`conversation/acpRunner.ts`의 `spawn`). `Prepared.fence`가 있을 때만 막는 방법을 고른다(§3.1 표). Claude는 sandbox가 켜진 턴에 SDK `settings`를, Codex는 Full access가 아닌 server에 `-c` profile 인수와 턴의 `permissions`를 쓴다.
  - Codex 모드 전환 때 app-server를 다시 띄우는 곳: `conversation/service.ts` `submit`의 재사용 판단(`reusing`).
  - 대화 lease가 run 환경을 만드는 곳: `agentAuth/manager.ts` `acquire`/`launch`, `agentAuth/environment.ts` `providerEnv`.
  - Antigravity 서버를 띄우는 그 밖의 곳(`manager.ts` `acpExec`)은 바뀌지 않는다(§3.2 경로 1).
  - 새 파일 하나: 막는 방법을 만드는 순수 모듈(이름은 `/tdd`에서 정한다. 예: `agentAuth/fence.ts`). 바깥 fence 정책과 인수, Claude flag 설정, Codex profile 인수, Claude sandbox 판정, 모드별 방법 고르기가 여기 있다.
- **CLI (Go)**: 바뀌지 않는다. agent가 실행하는 `doan`은 `DOAN_RUNTIME`의 `runtime.json`을 읽고 tmpdir의 socket에 연결한다(`app/src/main/runtime.ts`). fence는 이 둘을 막지 않는다. 다만 fence 안의 `doan check`는 `<userData>/sessions.jsonl`(`conversation/io.ts`가 읽는 파일)에 쓰지 못한다(결정 B, §3.1).
- **skills**: 바뀌지 않는다. profile의 doan `SKILL.md` stub은 Doan이 프로세스를 띄우기 전에 쓴다.
- **형식**: 바뀌지 않는다(§5).
- **renderer**: 바뀌지 않는다. 새 화면, 문구, 실패 코드가 없다(결정 Q5).

## 2. 지금 구조 (코드에서 읽은 사실)

- profile은 `<userData>/agent-auth/profiles/<profile>/`(0700)이고 모두 같은 uid가 소유한다. Claude는 `CLAUDE_CONFIG_DIR`, Codex는 `CODEX_HOME`, Cursor·Antigravity·Copilot은 `HOME`을 profile로 받는다. Antigravity는 `GEMINI_HOME=<profile>/.gemini`도 받는다(`environment.ts`).
- vault provider(Cursor, Antigravity, Copilot)는 프로세스를 띄우기 전에 자격 증명 작업 사본을 profile에 평문으로 쓰고, 그 profile을 잡은 마지막 프로세스가 끝나면 지운다(ARCHITECTURE §7 'Storage' 'Working copies').
- Doan 자신의 대화 기록은 `<userData>/conversations/`에 모든 provider 것이 함께 있다.
- run 프로세스의 cwd는 프로젝트다. ACP 서버도 `spawn`의 `cwd`와 `session/new`의 `cwd`가 모두 `input.cwd`다(`acpRunner.ts`).
- Claude와 ACP run은 턴마다 새 프로세스를 띄운다. Codex는 app-server 하나를 턴 사이에 유지한다(ARCHITECTURE §7 'Agent conversation runtime and IPC').
- `prepare.ts`의 `AccountPrepare`는 `use?: "run" | "listing"`을 받는다. `Prepared`(`service.ts`)에는 아직 fence 필드가 없다.
- Antigravity의 tool facts(`agentAuth/facts.ts` `toolFacts`)는 프로세스를 띄우지 않는다. BACKLOG가 "tool-fact check"라고 적은 것은 `acpExec`의 상태 확인으로 보인다(추정).
- 로그아웃의 `stop_required`는 main이 거절로 돌려주고, renderer가 확인 대화상자를 연다(`agentAuthView.ts` `replyEffect`). 종료(`index.ts` `before-quit` → `agentAuth.quit()`)는 진행 중인 로그아웃만 기다린다. 대화상자에 걸린 로그아웃은 main이 모른다.
- `app/runtime/real-state.ts`는 `~/.gemini/antigravity-cli`를 디렉터리 자신의 `lstat`(크기, 수정 시각, inode, mode)으로만 본다. 그 안의 파일 변경은 놓칠 수 있다. 그래서 이 feature의 PoC와 확인은 재귀 목록 스크립트를 따로 쓴다(§8).
- macOS에 `/usr/bin/sandbox-exec`가 있다(이 Mac, Darwin 25.6에서 `ls`로 확인). man page는 이것을 DEPRECATED로 적는다(Apple DTS forum 845973도 같다). Codex도 같은 방식과 `-D` 매개변수를 쓴다(developers.openai.com/codex/concepts/sandboxing). 동작과 제약은 확인하지 않았다(P0, P2).

## 3. 설계

### 3.1 profile 경계: provider마다 막는 방법을 고른다

P0에서 이미 Seatbelt 안에 있는 프로세스는 규칙이 있는 두 번째 정책을 적용하지 못했다. 그래서 provider 자체 sandbox를 쓰는 run(사람이 켠 Claude Code sandbox, Codex의 Ask first·Accept edits·Plan)은 바깥 fence 안에서 모든 명령이 실패한다. 결정(orch.md '결정 기록'): Cursor·Antigravity·Copilot은 바깥 fence, Claude는 턴마다 sandbox 상태로, Codex는 권한 모드로 나눈다. 어느 쪽이든 막는 경로와 다시 여는 경로는 같다.

- **막는 경로**: `<userData>` 아래 읽기·쓰기.
- **다시 여는 경로**:
  - 이 run의 profile 디렉터리: 읽기·쓰기.
  - `<userData>/runtime.json`: 읽기만(`doan` CLI가 `DOAN_RUNTIME`으로 읽는다).
  - 첨부: Claude와 ACP run은 이번 턴의 붙여넣은 이미지 디렉터리(`<userData>/attachments/<id>/`, 이미지마다 하나)만 읽기. Codex run은 `<userData>/attachments/` 전체를 읽기. Codex app-server는 여러 턴에 걸쳐 살고 정책은 띄울 때 정해지기 때문이다(결정 A).
  - `<userData>/agent-auth/browser-hook`: 읽기(Claude, Antigravity).
  - `<userData>/agent-runtimes/antigravity-acp/`: 읽기(Antigravity만). 서버는 이곳에 쓰지 않는다(§8 P2 (g)).
  - Node `realpathSync`가 profile을 풀 수 있도록 `<userData>`, `agent-auth`, `profiles` 세 디렉터리 자신의 `file-read-metadata`(바깥 fence만, §8 P2 (a)).
- Antigravity만 추가 금지: 자기 profile의 skill 경로(`<GEMINI_HOME>/config/skills`, `<GEMINI_HOME>/antigravity-cli/skills`) 쓰기(§3.3, 결정 Q3).
- **다는 곳**: `prepare.ts`가 `use === "run"`일 때만 `Prepared.fence`(userData, profile, 이번 턴의 첨부 디렉터리, 모두 `realpath`로 푼 값)를 채운다. 모델 목록(`use === "listing"`)과 legacy external에는 없고, 그때는 지금과 똑같이 띄운다. 그래서 기존 테스트는 그대로 통과해야 한다. runner가 `Prepared.fence`와 이번 run의 권한 모드로 방법을 고른다(아래 표).

| provider | 조건 | 방법 |
|---|---|---|
| Cursor, Antigravity, Copilot | 모든 권한 모드 | 바깥 fence(`sandbox-exec`로 ACP 서버를 띄운다) |
| Claude | 이번 턴의 Claude sandbox가 꺼짐 | 바깥 fence(`spawnClaudeCodeProcess`를 감싼다) |
| Claude | 이번 턴의 Claude sandbox가 켜짐 | fence 없음. SDK `settings`(flag tier)에 Doan의 설정을 더한다 |
| Codex | Ask first, Accept edits, Plan | fence 없음. app-server를 Doan의 Codex permission profile로 띄우고 턴마다 그 profile을 고른다 |
| Codex | Full access | 바깥 fence(app-server를 감싼다) |

**바깥 fence**

- `/usr/bin/sandbox-exec -p <정책> -D NAME=<path>… <원래 명령> <원래 인수>`로 띄운다. 정책 문장은 §8 P2의 통과 문장이다. 정책은 프로세스와 그 자식에 모두 걸린다. agent의 shell 명령과 파일 도구도 그 안에 있다.
- 정책 문장은 `-p`(문자열)로 넘긴다. 정책 파일을 쓰지 않으므로 파일 쓰기 실패가 없다. 경로는 `-D` 매개변수로 넘긴다. 그래야 경로에 따옴표나 괄호가 있어도 정책이 깨지지 않는다.
- 첨부 매개변수: 붙여넣은 이미지가 없으면 `ATTACHMENTS`는 이 run의 profile이다(이미 읽기·쓰기로 열린 경로라 새로 여는 것이 없다). 하나면 그 디렉터리다. 둘 이상이면 첫째는 `ATTACHMENTS`, 나머지는 `ATTACHMENTS_2`, `ATTACHMENTS_3`…이고, 정책 끝에 `(allow file-read* (subpath (param "ATTACHMENTS_<n>")))` 줄을 하나씩 더한다. 그래서 붙여넣은 이미지가 0개나 1개인 정책은 §8 P2 문장과 바이트까지 같다. Codex의 `ATTACHMENTS`는 `<userData>/attachments`이고 줄을 더하지 않는다.
- pid, process group, 시작 시각이 그대로라 Stop과 종료 정리가 바뀌지 않는다(§8 P2 (h)).

**Claude: 턴마다 sandbox 상태로 고른다**

- 턴을 띄우기 전에 이번 run의 `sandbox.enabled`를 읽는다. Claude는 턴마다 새 프로세스이므로 판단도 턴마다 한다.
- 읽는 방법: Doan이 SDK `resolveSettings`(alpha)와 같은 출처를 같은 우선순위로 직접 읽는다. 출처는 profile의 `settings.json`(user), 프로젝트의 `.claude/settings.json`(project)과 `.claude/settings.local.json`(local), 그리고 `/Library/Application Support/ClaudeCode/managed-settings.json`과 그 옆 `managed-settings.d/*.json`(managed, 파일 이름 순서로 뒤의 것이 이긴다)이다. 우선순위는 managed > local > project > user다. MDM plist와 서버가 내려 준 managed 설정은 읽지 않는다. SDK 함수를 main에서 부르지 않는 이유: user 출처를 `process.env.CLAUDE_CONFIG_DIR`로만 찾는데(0.3.312 소스), main의 `process.env`는 legacy external 준비와 다른 spawn이 함께 읽는 값이라 바꿔 둘 수 없다.
- 꺼짐 → 바깥 fence. 켜짐 → SDK `settings`(flag tier, `--settings`)에 아래를 더한다. 기존 `claudeFastSettings`의 `fastMode`와 합친다.
  - `permissions.deny`: 턴 시작 때 userData를 나열해 만든 `Read(…)`·`Edit(…)` 규칙. 허용 경로(자기 profile, `runtime.json`, 이번 턴의 첨부 디렉터리, browser-hook)와 그 조상(`<userData>`, `agent-auth`, `profiles`, `attachments`)을 뺀 항목만 적는다. 곧 조상 디렉터리마다 허용 경로로 가는 길이 아닌 형제 항목이다(다른 profile 디렉터리, `conversations/`, `agent-auth`의 vault와 metadata, 다른 첨부 id, 그 밖의 userData 파일). 디렉터리는 `//<path>/**`, 파일은 `//<path>`로 적는다. `permissions.deny`는 `allow`를 이기므로 userData 전체를 한 줄로 막으면 Read 도구가 자기 profile과 이번 턴의 붙여넣은 이미지도 읽지 못한다(spec 완료 조건 3). Claude는 턴마다 새 프로세스라 턴마다 다시 나열한다.
  - `sandbox.filesystem`: `denyRead`·`denyWrite`=`<userData>`, `allowRead`=profile·`runtime.json`·이번 턴의 첨부 디렉터리(Claude 바깥 fence와 같은 목록)·browser-hook, `allowWrite`=profile.
  - `sandbox.allowUnsandboxedCommands: false`. Full access의 `dangerouslyDisableSandbox`가 승인 없이 sandbox 밖에서 도는 틈을 막는다(§8 P2 (c)). 사람의 설정을 이 한 가지만큼 좁힌다.
- 판정이 틀리는 경우:
  - 켜짐을 꺼짐으로 읽음(예: MDM이나 서버가 내려 준 managed 설정만 sandbox를 켬): 바깥 fence 안에서 모든 Bash가 71로 실패한다. 보이는 실패이고, 결정이 받아들였다.
  - 꺼짐을 켜짐으로 읽음(예: Doan이 읽지 않는 managed 출처가 sandbox를 끔): flag의 `permissions.deny`만 남아 `perl`처럼 파일을 직접 여는 프로그램은 막지 못한다. Known limits에 적는다.
- 켜짐 쪽의 한계: 턴 도중 새로 생긴 userData 항목(예: 다른 대화가 만든 첨부, 새 staging profile)은 그 턴의 `permissions.deny`에 없어 Read·Edit 도구가 읽고 쓸 수 있다. Bash는 `sandbox.filesystem`이 OS 수준에서 그대로 막는다. Known limits에 적는다.

**Codex: 권한 모드로 고른다**

- Full access가 아닌 app-server: 바깥 fence 없이 띄우고, 인수에 `-c default_permissions="doan"`과 두 profile을 더한다.
  - `permissions.doan={extends=":read-only",filesystem=<항목>}`: Ask first와 Plan.
  - `permissions.doan-workspace={extends=":workspace",filesystem=<항목>}`: Accept edits.
  - `<항목>`: `"<userData>"="deny"`, `"<profile>"="write"`, `"<userData>/runtime.json"="read"`, `"<userData>/attachments"="read"`. 경로는 TOML 기본 문자열(JSON 문자열 표기와 같은 escape)로 넣는다.
  - 턴마다 legacy `sandboxPolicy` 대신 `permissions: "<profile id>"`(experimental API)를 보낸다. 둘을 함께 보내면 userData 전체가 막히므로 섞지 않는다(§8 P2 (c)).
  - 승인 정책은 지금처럼 ephemeral `thread/start`에서 읽은 Ask first 값(Ask first), `on-request`(Accept edits), `never`(Plan)이다.
  - `default_permissions`를 정해야 profile을 정의할 수 있다. 그래서 Ask first의 sandbox는 Codex의 기본 대신 `doan`(읽기 전용 + 항목)이다. Doan의 Codex profile은 프로젝트 신뢰를 기록하지 않으므로 지금의 Ask first도 읽기 전용이다. 같은 동작이고, profile의 `config.toml`을 사람이 손으로 고친 경우만 달라진다.
- Full access app-server: 바깥 fence로 감싸 띄우고, 턴은 지금처럼 `sandboxPolicy: dangerFullAccess`를 보낸다(§8 P2 fence 턴 B).
- **모드 전환**: 살아 있는 app-server의 방법(profile 또는 fence)과 이번 send의 방법이 다르면 그 server를 닫고 새 server를 띄워 `thread/resume`한다. 같으면 지금처럼 재사용한다. 새 server를 여는 것은 첫 send와 같은 경로다.
- 받아들인 한계(T7 Known limits):
  - 사람이 승인한 `apply_patch`는 deny 경로에도 쓴다. 승인 카드에 그 경로가 보인다(Ask first, Accept edits).
  - `permissions` profile과 `turn/start` `permissions`는 experimental API다. Codex가 바꾸면 Doan 연결 Codex run이 시작하지 못하거나 profile이 걸리지 않을 수 있다.
  - 사람이 Doan의 Codex profile `config.toml`에 legacy `sandbox_mode`를 적어도 Doan이 턴마다 `permissions`를 보내므로 deny가 걸린다. 대신 그 `sandbox_mode`는 쓰이지 않는다.

**fail closed**(결정 Q5): 아래 경우 run은 기존 시작 실패로 끝난다. 새 실패 코드와 문구는 만들지 않는다.

- 띄우기 전 거절(경로를 `realpath`로 풀 수 없음, 절대 경로가 아님, NUL이나 줄바꿈이 있음, profile이 `<userData>/agent-auth/profiles/` 바로 아래가 아님) → `unknown`.
- `sandbox-exec`가 없음(spawn `ENOENT`)이나 정책 오류로 바로 끝남(종료 코드 65, 71) → `process_exited`.
- 어느 경우도 `cli_missing`을 쓰지 않는다. provider CLI가 없는 것이 아니기 때문이다.
- `realpath`는 필수다. 풀지 않은 `/var/...`나 상대 경로 `-D`는 오류 없이 아무것도 막지 않는다(fail open, §8 P2 (a)).

**적용 범위**: Doan 연결 대화 run만이다. 로그인, 상태 확인, 로그아웃, 모델 목록, 사용량 fresh read, MCP connector 명령, Codex identity lookup에는 붙이지 않는다(결정 Q2). §3.2가 경로 1이므로 Antigravity의 `acpExec`에도 붙이지 않는다.

**받아들인 한계**(spec '보호 범위', T7 'Known limits'):

- fence 안의 `doan check`는 `<userData>/sessions.jsonl`에 session association을 더하지 못한다. 출력과 종료 코드는 그대로다(결정 B).
- 모델 목록 읽기는 fence 밖에서 저장소의 설정으로 돌므로, 저장소 hook이 그때 실행될 수 있다.
- fence는 run 안의 직접 접근만 막는다. agent가 남긴 설정(`~/.zshrc`, 저장소의 `.claude/settings.json` hook, `.mcp.json` 등)은 나중에 fence 밖의 프로세스가 실행할 수 있다.
- `sandbox-exec`가 macOS에서 없어지면 바깥 fence를 쓰는 Doan 연결 run이 시작하지 못한다.
- 위 Claude·Codex의 한계.

### 3.2 Antigravity가 실제 상태를 바꾸지 않게 한다

- 결정: **경로 1, 환경 변경 없음**(§8 P1). Doan이 지금 주는 `HOME=<profile>`, `GEMINI_HOME=<profile>/.gemini`, `AGY_ACP_FORCE_FILE_STORAGE=1`만으로 서버와 language server가 실제 `~/.gemini/antigravity-cli/`와 Keychain 항목 `gemini | antigravity`를 바꾸지 않았다. `providers.ts`와 `environment.ts`의 Antigravity 환경은 그대로다.
- BACKLOG가 적은 실제 상태 쓰기는 Orca.app이 주기적으로 실행하는 사람의 `agy`가 만든 것으로 본다(§8 P1). T7에서 BACKLOG 문장을 이 결과로 고친다.
- 경로 2(fence로 실제 home 막기)와 경로 3(결정 Q6의 막는 분기, 새 문구와 초안)은 하지 않는다. 그래서 Antigravity의 `acpExec`(로그인·상태 확인·로그아웃)에는 fence가 없고, 실제 home 매개변수도 없다.
- 남는 위험(§8 P1): 한 턴만 봤다. language server의 `go-keyring`과 `os/user.Current`가 다른 기능에서 실제 home이나 Keychain을 쓰는지는 배제하지 못했다. agent가 shell에서 절대 경로로 실제 home에 쓰는 것은 막지 않는다(spec Non-goals의 agent 전체 sandbox). T5에서 앱 + Keychains 링크 조건과 실제 HOME으로 다시 본다.

### 3.3 Antigravity가 자기 profile 안에서 일한 것

- 결정: **(i)**(§8 P3). 서버가 profile의 skill 경로를 agent의 workspace로 넘기고, agent가 skill 관련 작업을 그곳에서 했다. 서버는 `session/new`의 `cwd`를 도구 실행에 쓴다.
- 결정 Q3대로 Antigravity의 바깥 fence 정책에 자기 profile의 skill 경로(`<GEMINI_HOME>/config/skills`, `<GEMINI_HOME>/antigravity-cli/skills`) 쓰기 금지를 더한다. stub은 Doan이 프로세스를 띄우기 전에 쓰고, 서버와 harness는 그 경로에 쓰지 않는다(§8 P3). 그러면 agent가 Doan의 stub을 바꾸거나 skill을 더해 다음 대화에 영향을 주는 일도 막힌다. 실제 턴에서 stub은 읽히고 `doan`이 skill 목록에 있었다(§8 P2).
- profile 안의 `antigravity-acp/`와 `antigravity/` 쓰기는 연다(서버가 쓴다).

### 3.4 `stop_required` 뒤 종료

- 결정(Q4): **동작을 바꾸지 않는다.** 답하지 않은 확인 대화상자는 로그아웃을 확인하지 않은 것이다. 종료는 그것을 취소로 다루고, 다음 실행에서 연결이 그대로 보이므로 사람이 다시 로그아웃할 수 있다. 어긋나는 상태(연결은 없는데 자격 증명이 남음)는 생기지 않는다.
- 고아 Keychain 항목은 userData를 지울 때 생기며 `stop_required`와 관계없다. ARCHITECTURE §7 'Known limits'에 "Claude Code·Codex 연결의 Keychain 항목은 profile 경로로 열쇠가 정해지고 userData를 지워도 남는다. 지우려면 먼저 로그아웃한다"를 적는다. MCP connector token(Keychain)과 `doan Safe Storage`도 남는지 확인하고, 남으면 같은 줄에 적는다.
- 고르지 않은 것: 종료 때 로그아웃을 끝내기(사람이 확인하지 않은 로그아웃을 실행한다), 보류를 기록해 다음 실행에서 묻기(새 상태와 문구가 생긴다).

## 4. 순수 함수로 뺄 것 (`/tdd` 대상)

- `fencePolicy(provider, extraAttachments)` → 바깥 fence 정책 문장(SBPL). 경로는 들어가지 않고 매개변수 이름만 들어간다.
  - 테스트: Cursor·Antigravity·Copilot·Claude·Codex의 정책 스냅숏(붙여넣은 이미지 0–1개). 스냅숏은 §8 P2에 적은 통과 정책 문장과 바이트까지 같다. Antigravity에만 `agent-runtimes` 읽기와 skill 경로 쓰기 금지가 있다. browser-hook 허용은 Claude와 Antigravity에만 있다. 이미지 2개 이상이면 `ATTACHMENTS_<n>` 줄이 끝에 더해지고 나머지는 같다.
- `fenceArgs({ provider, paths })` → `sandbox-exec` 인수 목록(`-p <정책>`, `-D` 매개변수). `paths`는 `resolveFencePaths`의 결과다.
  - 테스트: 다른 provider의 profile 경로는 어떤 매개변수에도 나오지 않는다. Claude·ACP는 이번 턴의 첨부 디렉터리만(없으면 `ATTACHMENTS`=profile), Codex는 `<userData>/attachments`가 나온다. 따옴표·공백·괄호가 든 경로도 그대로 한 인수다.
- `resolveFencePaths({ userData, profileDir, attachments, codex })`(파일 시스템은 주입) → 푼 경로들 또는 거절.
  - 테스트: 상대 경로, NUL, 줄바꿈 → 거절. `realpath` 실패 → 거절. profile이 `<userData>/agent-auth/profiles/` 바로 아래가 아님 → 거절. staging profile(`codex-<id>`)도 자기 디렉터리만 연다. 첨부 중 `<userData>/attachments/<id>/` 아래 것만 디렉터리로 모은다(사람이 고른 로컬 파일은 userData 밖이라 열 필요가 없다).
- `fencedCommand(command, args, fenceArgs?)` → `{ command: "/usr/bin/sandbox-exec", args: [...fenceArgs, command, ...args] }`. 세 spawn 지점이 같은 함수를 쓴다.
  - 테스트: 원래 인수 순서가 보존된다. `fenceArgs`가 없으면 그대로 돌려준다.
- `claudeSandboxEnabled(sources)` → Claude sandbox 판정. 입력은 user·project·local·managed 출처의 파싱한 내용(없거나 읽을 수 없으면 비어 있음)이다.
  - 테스트: 출처마다 켬·끔·없음의 우선순위(managed > local > project > user). 읽을 수 없는 파일은 그 출처가 없는 것과 같다. `sandbox.enabled`가 boolean이 아니면 없는 것과 같다.
- `claudeDenyRules(paths, listing)` → sandbox가 켜진 턴의 `permissions.deny` 규칙. `listing`은 조상 디렉터리마다 나열한 항목(이름, 디렉터리 여부)이고 shell이 채운다.
  - 테스트: 허용 경로와 조상은 규칙에 없다. 다른 profile, staging profile, `conversations/`, vault, metadata 파일, 다른 첨부 id, 그 밖의 파일이 모두 규칙에 있다. 디렉터리는 `/**`, 파일은 경로 그대로다. 나열할 수 없는 조상이 있으면 거절한다(fail closed).
- `claudeFenceSettings(paths, deny)` → sandbox가 켜진 턴의 flag tier 설정(`permissions.deny`, `sandbox.filesystem`, `allowUnsandboxedCommands: false`). `claudeFastSettings`와 합치는 함수도 같이 둔다.
  - 테스트: 설정 모양 스냅숏(§8 P2 (c)의 C18과 같은 `sandbox` 키). `fastMode`와 합쳐도 둘 다 남는다. 다른 provider의 profile은 허용 목록에 나오지 않는다.
- `codexProfileArgs(paths)` → Full access가 아닌 app-server의 `-c` 인수(`default_permissions`, `permissions.doan`, `permissions.doan-workspace`).
  - 테스트: 인수 스냅숏. 따옴표·역슬래시가 든 경로가 TOML 문자열로 escape된다.
- `codexTurnPermission(mode, defaults, mechanism)` → 턴의 권한 인수. profile server면 `{ approvalPolicy, permissions }`이고 `sandboxPolicy`가 없다. fence server(Full access)면 `{ approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } }`. legacy external(정의된 profile 없음)은 지금의 `codexPermission`을 그대로 쓴다.
  - 테스트: 네 모드 × 두 방법. profile server의 어느 턴도 `sandboxPolicy`를 함께 보내지 않는다.
- `runMechanism(provider, mode, claudeSandbox?)` → `"fence" | "claude-settings" | "codex-profile"`, 그리고 `codexRestart(current, next)` → app-server를 다시 띄울지.
  - 테스트: ACP 세 provider는 네 모드 모두 fence. Claude는 sandbox 상태만 본다(모드와 무관). Codex는 Full access만 fence. 같은 방법이면 재사용, 다르면 다시 띄운다.
- `Prepared.fence`를 채우는 규칙(`prepare.ts`)
  - 테스트: `use === "run"`이면 있다. `use === "listing"`으로 준비하면 없다. legacy external(`createPrepare`)은 없다(기존 테스트가 그대로 통과). 경로를 풀 수 없으면 lease를 놓고 `unknown`으로 거절한다.
- fail closed의 분류
  - 테스트: `sandbox-exec` 경로를 주입해 `ENOENT` → `process_exited`. 정책 오류로 바로 끝남(65) → `process_exited`. 띄우기 전 거절 → `unknown`. 어느 경우도 `cli_missing`이 아니다.

## 5. 형식 변경

없다. JSON Schema, `runtime.json`, app socket 메시지, CLI 응답, 대화 index와 event 형식이 그대로다. `Prepared.fence`는 main 내부 타입이다. 실패 코드도 기존 것(`unknown`, `process_exited`)을 쓴다(결정 Q5).

## 6. Conventions 영향

없다. ARCHITECTURE §1과 `doan check` 규칙을 바꾸지 않는다.

## 7. 결정 영향

- **ARCHITECTURE §7 "The app does not sandbox the agent or promise that repository settings/hooks cannot execute code."** 이번 fence는 Doan userData의 경로만 막으므로 이 문장을 좁혀 고친다. 예: "Doan fences only its own userData from Doan-connection runs; it does not otherwise sandbox the agent…". 사용자가 승인했다(결정 Q1). 고치는 것은 T7 승격 때다.
- **PRODUCT §3 'Resume and permissions'**: 사용자가 승인한 약속을 더한다. "Doan 연결 대화의 agent는 어떤 권한 모드에서도(Full access 포함) 자기 profile 밖의 Doan userData를 읽거나 쓰지 못한다. 막힌 읽기는 도구 실패로 보인다."(결정 D). "Ask first applies the user's own permission and sandbox settings"는 유지한다. 사람이 켠 Claude sandbox는 그대로 동작한다(바깥 fence 대신 flag 설정). 다만 두 가지가 좁아지므로 T7에서 이 절에 적는다. Claude는 sandbox가 켜진 턴에 sandbox 밖 실행(`allowUnsandboxedCommands`)이 꺼진다. Codex의 Ask first sandbox는 Doan의 읽기 전용 profile이다(지금도 읽기 전용이다, §3.1).
- **ARCHITECTURE §7 'Permission modes'**: Codex 줄("every doan-owned turn states both", ephemeral `thread/start`로 읽는 Default, Accept edits의 `sandbox_workspace_write` 합치기)을 T7에서 §3.1의 profile 방식으로 고친다. Full access가 아닌 턴은 `permissions` profile id와 승인 정책을 보내고, Full access는 바깥 fence 안의 server에서 `dangerFullAccess`를 보낸다.
- **PRODUCT §3 'Association recording'** "silently skips what it cannot record": fence 안 `doan check`가 `sessions.jsonl`을 쓰지 못하는 것은 이 규칙 안에 있다(결정 B). 문장은 바꾸지 않는다.
- **ARCHITECTURE §7 'Agent authentication' "it never reads, copies or changes those external credentials"**: §3.2 경로 1로 지킨다(§8 P1). 문장은 바꾸지 않는다.
- **ARCHITECTURE §7 'Antigravity server'(승인된 예외)**: 새 변수가 없으므로 바뀌지 않는다.
- serving scope, sandbox iframe, GitHub token 예외, git 명령 제한은 건드리지 않는다.

## 8. PoC 의존

**공통 절차**

- 모든 PoC와 측정 스크립트는 `.scratch/provider-profile-isolation/`에 둔다. AGENTS.md 'Commands'에 없는 도구도 PoC와 측정에는 쓸 수 있다. 결과(통과/실패, 측정값, 날짜, CLI 버전)는 이 문서에 적는다.
- 앱을 띄우는 PoC는 AGENTS.md의 dev 명령 형태를 따른다. `DOAN_CLI`, `--user-data-dir=<tmp>`, 임시 `HOME`, 제어된 출력을 내는 가짜 `SHELL`을 쓰고, `CLAUDE_CONFIG_DIR`·`CODEX_HOME`은 지우거나 덮는다.
- 실제 상태 비교는 스크립트 전체를 감싼다. 둘을 쓴다. `app/runtime/real-state.ts`의 fingerprint, 그리고 `~/.gemini/antigravity-cli/`의 재귀 목록(상대 경로, 크기, 수정 시각) 스크립트다. 목록 스크립트는 파일 내용을 읽지 않는다. `real-state.ts`는 그 디렉터리의 `lstat`만 보기 때문이다(§2).
- 실제 로그인은 그때마다 사용자 승인을 받는다. 사람이 브라우저에서 승인한다.
- Keychain 정리:
  - 실행 전에 provider와 Doan Keychain 항목의 속성(서비스, 계정, 수정 시각)을 기록한다. 비밀 값은 읽지 않는다.
  - 끝나면 이번 실행이 만든 항목만 지운다. `<App> Safe Storage`도 이번 실행이 만들었으면 지운다(POSTMORTEM 2026-10-30).
  - 원래 있던 `gemini | antigravity`는 절대 지우지 않는다. 그 수정 시각이 바뀌었으면 보고한다.
  - Antigravity 실제 로그인을 승인받을 때 "사람의 `agy` 로그인이 초기화될 수 있다"고 알린다.

**P0. 중첩 Seatbelt (로그인 없음, T0 전)**

- 질문: Doan의 바깥 정책 안에서 provider의 안쪽 sandbox가 동작하는가.
- 방법:
  - `sandbox-exec -p '(version 1)(allow default)' /usr/bin/sandbox-exec -p '(version 1)(allow default)' /usr/bin/true`
  - 바깥 정책 안에서 `codex sandbox macos -- /usr/bin/true`
  - Claude Code sandbox도 같은 조건으로 확인한다(로그인 없이 되는 방법을 P0에서 찾는다).
- 통과: 셋 모두 종료 코드 0. 실패: T0 전에 사용자에게 방향을 묻는다(tasks T2의 P0 실패 분기).
- **결과: 실패**(2026-11-09, macOS 26.3.1, codex-cli 0.166.0, Claude Code 2.1.319, `@anthropic-ai/sandbox-runtime` 0.0.81). 스크립트와 출력은 `.scratch/provider-profile-isolation/p0/`(`p0.sh`, `results.txt`)에 있다. 바깥 정책은 모두 `sandbox-exec -p '(version 1)(allow default)'`이다.

  | 확인 | 바깥 정책 없음 | 바깥 정책 안 |
  |---|---|---|
  | 안쪽 `sandbox-exec`, 정책 `(allow default)` | — | 0 |
  | 안쪽 `sandbox-exec`, `(allow default)`에 `deny file-write*` 한 줄 | — | 71, `sandbox-exec: sandbox_apply: Operation not permitted` |
  | `codex sandbox -- /usr/bin/true` | 0 | 71, 같은 오류 |
  | Claude Code sandbox(`sandbox.enabled: true`, Bash 도구 한 번) | 명령이 돈다. cwd 밖 쓰기는 `Operation not permitted`로 막힌다 | Bash 도구 결과가 `Exit code 71`, `sandbox_apply: Operation not permitted`(`is_error`). 명령 자체가 돌지 않는다 |
  | Claude Code, `sandbox.enabled: false`(대조) | — | 명령이 돈다 |
  | `srt`(sandbox-runtime 0.0.81) `/usr/bin/true` | 0 | 71, 같은 오류 |

  - 이미 Seatbelt 안에 있는 프로세스는 규칙이 하나라도 있는 두 번째 정책을 적용하지 못한다. 위 명령의 첫 줄(안쪽도 `(allow default)`)이 0인 것은 안쪽 정책에 규칙이 없어서다. 그래서 그 명령만으로는 중첩 가능 여부를 알 수 없다.
  - Codex 0.166.0에는 `codex sandbox macos` 하위 명령이 없다. `macos`를 실행할 명령으로 읽어 `execvp() of 'macos' failed`(71)로 끝난다. 지금 형태는 `codex sandbox -- <command>`이다.
  - Claude Code는 로그인 없이 확인했다. 가짜 Messages API(`ANTHROPIC_BASE_URL`, `mock-anthropic.mjs`)가 Bash 도구 호출 하나를 돌려주고, `CLAUDE_CONFIG_DIR`과 `HOME`은 임시 디렉터리다(`claude-sandbox.sh`).
  - 따라서 Doan 정책 안에서는 사람이 켠 Claude Code sandbox의 명령이 실패한다. Codex가 Ask first와 Accept edits에서 자기 sandbox로 실행하는 명령도 같은 이유로 실패할 것으로 본다(추정: `codex sandbox`만 확인했고 app-server의 실제 턴은 확인하지 않았다). 방향은 T2에서 정한다.

**P1. Antigravity의 실제 상태 쓰기 (§3.2)**

- 질문: 실제 `~/.gemini/antigravity-cli/`에 쓰는 프로세스와 Keychain 항목 `gemini | antigravity`를 바꾸는 프로세스는 무엇인가(ACP 서버인가, language server인가). home을 어떻게 찾는가(`HOME`, `GEMINI_HOME`, 아니면 사용자 DB). 경로와 자격 증명 저장소를 옮기는 변수나 인수가 있는가.
- 방법: 먼저 pinned 1.3.0 archive를 풀어 소스를 읽는다(실행 없음, POSTMORTEM 2026-11-07이 `resolve_skills_paths`를 찾은 방법). 다음으로 격리 HOME(Keychains 링크 없음)에서 상태 확인만 돌리고 실제 상태를 비교한다. 마지막으로 사용자 승인 아래 실제 로그인과 한 턴을 돌린다.
- 통과: 경로 1이 실제 상태 쓰기를 0으로 만든다. 실패: 경로 2를 P2와 함께 시험한다. 둘 다 실패: 결정 Q6에 따라 나눈다. 그래서 P1은 사람의 `agy` 로그인이 바뀌는지도 확인한다(Keychain 항목 속성과 `agy`의 로그인 상태를 전후로 본다. 비밀 값은 읽지 않는다).
- **결과: 통과. 지금 설정만으로 실제 상태 쓰기가 0이었다**(2026-11-09, 서버 1.3.0, 사람의 `agy` 1.4.9). 스크립트와 evidence는 `.scratch/provider-profile-isolation/`에 있다(`acp.mjs`, `snap.mjs`, `diff.mjs`, `runs/`, `snaps/`, `watch/`).
- archive 읽기(실행 없음). `agy_acp_server.par`는 Mach-O이고, Python 소스는 `__TEXT,.par_data` 섹션의 zip(7757개 항목)에 있다.
  - Python 서버의 경로는 모두 `paths.py`의 `gemini_home()`에서 나온다. `$GEMINI_HOME`이 있으면 그 값을 쓰고, 없으면 `~/.gemini`(`$HOME` 기준 `expanduser`)를 쓴다. 토큰, 설정, 대화(`antigravity-acp/conversations`), harness의 `app_data_dir`(`antigravity-acp`)이 모두 그 아래다. `antigravity-cli/`는 skill을 읽는 경로(`antigravity-cli/skills`)로만 나오고, 소스 주석은 그곳을 "Read-only for us"라고 적는다.
  - Python 서버의 Keychain 항목은 서비스 `gemini`, 계정 `antigravity-acp`(business는 `antigravity-acp-business`)이고, 시작할 때 `__acp_probe__*` 계정으로 시험한다. `credential_store.py`는 "deliberately distinct from the Antigravity CLI's own `antigravity` account so this server never clobbers it"라고 적는다. `AGY_ACP_FORCE_FILE_STORAGE=1`이면 Keychain을 쓰지 않는다(Doan이 이미 준다).
  - language server는 `localharness_external`(Go)이다. 서버가 자기 환경(`os.environ`)을 그대로 물려 띄우고(`local_connection.py` `Popen`), `app_data_dir`과 `workspaces`를 넘긴다. 바이너리에 `GEMINI_HOME` 문자열은 없다. `zalando/go-keyring`(macOS에서는 `/usr/bin/security` 실행)과 `os/user.Current`(`getpwuid_r`)는 있다. 이 둘을 어디에 쓰는지는 정적으로 확인하지 못했다.
- 실행 결과. Doan과 같은 환경으로 서버를 띄웠다(`HOME=<profile>`, `GEMINI_HOME=<profile>/.gemini`, `AGY_ACP_FORCE_FILE_STORAGE=1`, `PYTHONUNBUFFERED=1`, `BROWSER=<hook>`, `GIT_CONFIG_GLOBAL`, `DOAN_RUNTIME`, `DOAN_APP_CONVERSATION=1`). 각 단계를 실제 상태 snapshot으로 감쌌다. snapshot은 `real-state.ts` fingerprint, 실제 `~/.gemini/antigravity-cli/` 재귀 목록, Keychain 속성(서비스, 계정, 생성·수정 시각)이다.

  | 단계 | 띄운 프로세스 | 실제 `antigravity-cli/` | Keychain |
  |---|---|---|---|
  | 상태 확인, 로그인 없음 | 서버, browser hook(`/bin/sh`) | 변화 없음 | 변화 없음 |
  | 실제 로그인(사용자가 브라우저에서 승인, 13초) | 서버, browser hook | 변화 없음 | 변화 없음 |
  | 한 턴(`pwd`, 파일 쓰기, skill 질문) | 서버, `localharness_external` | 변화 없음 | 변화 없음 |
  | 로그아웃, 그 뒤 상태 확인 | 서버, browser hook | 변화 없음 | 변화 없음 |

  - harness의 환경은 `HOME=<profile>`, `GEMINI_HOME=<profile>/.gemini`였다(`ps -E`로 두 변수만 기록). harness는 `<profile>/.gemini/antigravity/bin/webm_encoder`를 만들었다. harness도 실제 home이 아니라 `HOME`을 따른다.
  - 토큰은 `<profile>/.gemini/antigravity-acp/acp_token.json`에만 생겼고, 로그아웃이 지웠다. 로그아웃 뒤 상태 확인은 다시 로그인 링크를 요구했다.
- `gemini | antigravity`(생성 2026-05-31T23:50:19Z): 로그인 전 snapshot(07:02:08Z)부터 로그아웃 뒤 snapshot(07:03:27Z)까지 수정 시각이 06:08:32Z로 같았다. 이번 실행이 만든 Keychain 항목은 없다(시작과 끝 모두 23개, 추가·삭제 없음). 그래서 지운 항목도 없다.
- 사람의 `agy` 로그인: 전(06:47Z)과 후(07:03Z) 모두 `agy --log-file <scratch> models`가 모델 목록을 돌려줬다. 로그인은 유지됐다. 다만 후 확인의 `agy models`가 `gemini | antigravity`의 수정 시각을 07:03:54Z로 바꿨다. 사람의 `agy`는 실행될 때 스스로 이 항목을 갱신한다. 전 확인(06:47Z) 때는 바꾸지 않았다.
- BACKLOG의 관찰은 재현되지 않았다. 원인으로 보이는 다른 writer가 있다.
  - 이 Mac에서는 Orca.app(pid 1996)이 사람의 `~/.local/bin/agy`를 주기적으로 실행한다(`watch/seen.txt`: 16:09:11 KST 시작). 그 실행이 실제 `antigravity-cli/`에 `log/cli-<시각>.log`, `crashes/crash_<pid>_*.log`, `cli.log`, `cache/onboarding.json`, `conversation_summaries.db`를 썼다. BACKLOG가 적은 "logs, a crash log, `cli.log`"와 같은 종류다. 오늘 로그는 Doan의 Antigravity 실행이 없을 때도 약 10분 간격으로 생겼다.
  - 오늘 15:08:32 KST의 `gemini | antigravity` 수정 시각은 같은 초의 `log/cli-20261109_150831.log`와 맞는다. 2026-11-03 13:35:40의 변경도 사람의 `agy` 실행일 수 있다(추정: 그날의 로그 내용과 실행 주체는 확인하지 않았다).
- 조건 차이: BACKLOG의 관찰은 dev 앱의 임시 HOME에 `Library/Keychains`를 링크한 조건이었다. 이번에는 앱 대신 스크립트로 서버를 띄웠고, 링크를 만들지 않았다. 이유는 다음과 같다.
  - Antigravity 프로세스의 `HOME`은 앱의 HOME이 아니라 profile이다(`providerEnv`). 그래서 앱 HOME의 링크는 이 프로세스에 닿지 않는다.
  - 링크가 필요한 것은 Doan vault의 `safeStorage`(`doan Safe Storage`)다. 스크립트는 vault를 쓰지 않는다.
  - 남는 차이: Doan의 vault 봉인과 working copy 흐름, 앱의 수명 관리는 이번 실행에 없다. 앱 + 링크 조건은 T5에서 다시 본다.
- 추천: §3.2 경로 1. 지금 Doan이 주는 `HOME`, `GEMINI_HOME`, `AGY_ACP_FORCE_FILE_STORAGE`만으로 서버와 harness가 실제 상태를 쓰지 않았으므로 새 변수는 필요 없다. 경로 2(fence)와 경로 3(Q6)은 필요 없다고 본다.
  - 남는 위험 1: 한 턴만 봤다. harness의 `go-keyring`과 `os/user.Current`가 다른 기능(예: 다른 도구, 업데이트)에서 실제 home이나 Keychain을 쓰는지는 정적으로 배제하지 못했다.
  - 남는 위험 2: agent가 shell에서 절대 경로로 실제 home에 쓰는 것은 막지 않는다. 이것은 §3.1 fence의 범위다.
  - BACKLOG 항목의 원인은 정리할 때(T7) 이 결과로 고친다.

**P2. Seatbelt fence의 실현 가능성 (§3.1)**

- 질문:
  - (a) `-p` 정책 문자열과 `-D` 매개변수, "기본 허용 + 금지 + 다시 허용"의 규칙 순서가 의도대로 평가되는가.
  - (b) 다섯 provider가 정책 안에서 로그인 유지, 새 대화, resume, permission 요청, 질문 카드, Stop을 그대로 하는가. 실제 턴에서 `doan`이 skill 목록에 있는가.
  - (c) 다섯 provider 각각이 자기 Seatbelt를 쓰는가, 쓴다면 중첩이 되는가(Codex Ask first·Accept edits, 사람이 켠 Claude Code sandbox).
  - (d) Keychain 쓰기가 fence 안에서 되는가. 임시 keychain(`security create-keychain`)으로 확인하고 실제 login keychain에는 쓰지 않는다.
  - (e) 미끼가 막히는가(§8 '미끼'). 읽기(`cat`, 파일 읽기 도구)와 쓰기를 둘 다 시도한다. Full access에서도 막히는가.
  - (f) `doan work update`·`doan open`·`doan handoff`·`doan check`(출력과 종료 코드 그대로)·`doan ls`·`doan skill`·`doan design-skill`, 첨부 이미지, MCP connectors, turn-end 사용량 읽기가 되는가.
  - (g) Antigravity 서버가 `agent-runtimes/antigravity-acp/`에 쓰는가.
  - (h) `sandbox-exec`가 pid, process group, 시작 시각을 바꾸지 않는가. Stop과 종료 정리가 그대로 되는가.
- 각 provider의 CLI 버전을 기록한다. 현재 minimum(ARCHITECTURE §7 'Versions')에서도 확인한다.
- **미끼**: 다른 provider의 profile(staging `codex-<id>` 포함), `conversations/`, `agent-auth/`의 vault·metadata, 다른 대화의 첨부, `runtime.json`(읽기는 되고 쓰기는 실패해야 한다). 다른 provider의 실제 대화 기록은 쓰지 않는다.
- **통과 정책 문장**: 통과한 정책 문장 전체를 여기에 적는다. T3의 스냅숏이 이 문장과 비교한다.

  ```
  (version 1)
  (allow default)
  (deny file-read* file-write* (subpath (param "USERDATA")))
  (allow file-read-metadata (literal (param "USERDATA")) (literal (param "AGENT_AUTH")) (literal (param "PROFILES")))
  (allow file-read* file-write* (subpath (param "PROFILE")))
  (allow file-read* (literal (param "RUNTIME")))
  (allow file-read* (subpath (param "ATTACHMENTS")))
  ```

  - Claude와 Antigravity는 위 문장 뒤에 `(allow file-read* (literal (param "BROWSER_HOOK")))`을 더한다.
  - Antigravity는 그 뒤에 아래 세 줄을 더한다.

    ```
    (allow file-read-metadata (literal (param "AGENT_RUNTIMES")))
    (allow file-read* (subpath (param "AGENT_RUNTIME")))
    (deny file-write* (subpath (param "SKILLS_CONFIG")) (subpath (param "SKILLS_CLI")))
    ```

  - 매개변수(`-D`, 모두 `realpath`로 푼 값): `USERDATA`=`<userData>`, `AGENT_AUTH`=`<userData>/agent-auth`, `PROFILES`=`<userData>/agent-auth/profiles`, `PROFILE`=이 run의 profile, `RUNTIME`=`<userData>/runtime.json`, `ATTACHMENTS`=Claude·ACP는 이번 턴의 `<userData>/attachments/<id>`, Codex는 `<userData>/attachments`, `BROWSER_HOOK`=`<userData>/agent-auth/browser-hook`, `AGENT_RUNTIMES`=`<userData>/agent-runtimes`, `AGENT_RUNTIME`=`<userData>/agent-runtimes/antigravity-acp`, `SKILLS_CONFIG`=`<PROFILE>/.gemini/config/skills`, `SKILLS_CLI`=`<PROFILE>/.gemini/antigravity-cli/skills`.
  - 이 문장은 Cursor·Antigravity·Copilot에서 실제 턴으로 통과했다. Claude에는 자기 sandbox가 꺼진 run에서, Codex에는 Full access run에서만 쓴다(아래 '결과' 추천). 스크립트는 `.scratch/provider-profile-isolation/p2/real/fence.mjs`다.

- 대안(provider별로 실패하면):
  - (가) 그 provider만 provider 자체 설정으로 막는다. 예: Claude의 profile `settings.json`에 `permissions.deny` 읽기 규칙. 다만 shell 명령은 막지 못할 수 있다.
  - (나) 그 provider만 한계로 문서화한다.
  - (다) 그 provider의 자체 sandbox를 끄고 Doan 정책만 쓴다. PRODUCT §3 'Resume and permissions'를 바꾸므로 결정이 필요하다.
  - (가)·(나)로 끝난 provider는 막는 범위와 남는 한계를 ARCHITECTURE §7 'Known limits'에 적는다.
- **확인 필요**: 어느 대안으로 갈지는 실패한 provider와 원인을 보고 T2에서 사용자에게 묻는다. 그때 추천을 하나 붙인다.
- **결과**(2026-11-09, macOS 26.3.1). 스크립트와 evidence는 `.scratch/provider-profile-isolation/p2/`(`a/`, `claude/`, `codex/`, `real/`)에 있다.
  - 버전: Claude Code 2.1.319(minimum 2.1.284도 확인), codex-cli 0.166.0(minimum 0.158.0도 확인), cursor-agent 2026.10.22-27dcf5f(= minimum), Copilot CLI 1.0.105(ACP `agentInfo`는 1.0.107), Antigravity 서버 1.3.0. Copilot minimum 1.0.89는 확인하지 않았다.
  - 바깥 fence provider(Cursor·Antigravity·Copilot)는 통과했다. 단, Cursor는 실제 턴의 도구 호출을 보지 못했다.
  - Claude와 Codex는 자기 설정만으로는 막히지 않는 경우가 남는다. 그래서 바깥 fence와 자기 설정을 run마다 나눠 쓰는 쪽을 추천한다(아래 '추천').
- **(a) 정책 평가**(`a/a.sh`, `a/a-results.txt`, 로그인 없음):
  - 규칙은 마지막에 맞는 것이 이긴다. 금지 줄을 다시 허용 줄들 뒤로 옮기면 자기 profile, `runtime.json`, 첨부가 모두 막힌다.
  - `-D` 경로는 푼 값이어야 한다. 풀지 않은 `/var/folders/...`를 넘기면 아무것도 막지 않는다(fail open). 상대 경로 `-D`도 오류 없이 받아들여지고 아무것도 막지 않는다. 그래서 §3.1의 `realpath`와 절대 경로 검사가 필수다. 확인된 비교 경로는 `/private/var/...`이다.
  - 따옴표, 공백, 괄호가 든 userData 경로도 `-D`로 그대로 동작했다. `-p` 문자열과 `-f` 파일의 결과도 같다.
  - 조상 디렉터리 세 개(`USERDATA`, `agent-auth`, `profiles`)의 `file-read-metadata`를 열지 않으면 Node `fs.realpathSync(profile)`이 실패한다(Python `realpath`는 통과). 그래서 그 줄이 필요하다. 그 결과 `stat <userData>`는 되고, `ls <userData>`는 막힌다.
  - 바깥의 심볼릭 링크로 미끼를 가리켜도 막힌다. 다른 profile의 이름 바꾸기(`mv`)도 막힌다.
  - fail closed: 매개변수 누락이나 문법 오류는 `sandbox-exec` 종료 코드 65다. 명령이 없으면 71(`execvp() ... failed`)이다. 둘 다 띄운 직후 끝나므로 §3.1의 `process_exited`로 분류된다.
- **provider × 모드**: '미끼'는 다른 provider profile(staging `codex-stg1` 포함), `conversations/`, `agent-auth/` 목록, 다른 대화의 첨부, `runtime.json` 쓰기다. '허용'은 `runtime.json` 읽기, 이번 턴 첨부, 자기 profile 읽기·쓰기, 작업 폴더 쓰기다. Cursor·Antigravity·Copilot·Claude 실제 턴의 shell 확인은 작업 폴더의 `check.sh`(미끼로 가는 심볼릭 링크를 연다)로 했다. Copilot 모델이 작업 폴더 밖 절대 경로를 스스로 거절했기 때문이다.

  | provider | 모드 | 띄운 방식 | 미끼(shell, `perl` 포함) | 미끼(파일 도구) | 허용 | skill `doan` |
  |---|---|---|---|---|---|---|
  | Cursor | Ask first | 바깥 fence | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 |
  | Copilot | Ask first | 바깥 fence | 모두 `Operation not permitted` | `EACCES` | 모두 됨 | 있음 |
  | Copilot | Full access(`allow_all` on) | 바깥 fence | 모두 막힘 | `EACCES` | 모두 됨 | 있음 |
  | Antigravity | Ask first(`default`) | 바깥 fence | 모두 막힘 | 서버가 workspace 밖이라 거절 | 모두 됨 | 있음 |
  | Antigravity | Full access(`yolo`) | 바깥 fence | 모두 막힘 | 서버가 거절 | 모두 됨 | 있음 |
  | Claude(sandbox 꺼짐) | Ask first | 바깥 fence(실제 로그인) | 모두 막힘 | Read 도구 거절 | 모두 됨 | 있음 |
  | Codex | Accept edits에 해당(`permissions` profile, on-request) | fence 없음, Codex profile의 deny(실제 로그인) | 모두 막힘 | `view_image` 막힘 | 됨(아래 차이) | 있음 |
  | Codex | Full access(`dangerFullAccess`) | 바깥 fence, 새 app-server에서 `thread/resume`(실제 로그인) | 모두 막힘 | `view_image` 막힘 | 모두 됨 | 있음 |

  - Cursor: fence 안에서 로그인 유지, `authenticate`, `session/new`, mode 설정, Stop까지 됐다. 그러나 턴은 모델 두 개(기본, `composer-2.5`) 모두 "Upgrade your plan to continue"로 끝났고 도구 호출이 없었다. fence 없이 돌려도 같았다. 그래서 fence 실패로 세지 않았다. 미끼와 허용 경로는 확인하지 못했다.
  - 다른 모드(Accept edits·Plan)는 같은 정책과 argv이므로 ACP provider에서 따로 돌리지 않았다.
  - Antigravity: Q3의 skill 경로 쓰기 금지가 shell 쓰기를 막았다(`config/skills`, `antigravity-cli/skills` 모두 `Operation not permitted`). stub은 읽히고 `doan`이 skill 목록에 있었다. 서버의 `antigravity-acp/`, `antigravity/` 쓰기는 막히지 않았다. P1·P3의 profile 안 동작과 충돌하지 않는다.
  - Claude 실제 턴: `CLAUDE_CONFIG_DIR`이 로그인된 공유 profile이고 `apiKeySource: none`(OAuth)이었다. `--resume`도 fence 안에서 됐다.
  - Codex 실제 턴 A는 Codex 자기 sandbox(`:workspace`) 안이라 임시 keychain 만들기와 `git credential-osxkeychain get`이 실패했다(-50). Doan의 deny 항목과 관계없는 Codex workspace sandbox의 동작이다(fence 안의 Full access 턴 B에서는 둘 다 됐다).
  - 실제 상태: Antigravity 실행 전후(`real/snaps/before-agy.json` → `after-agy.json`) 변화가 없었다. 전체 창(`start` → `end`)의 `antigravity-cli/` 로그와 `gemini | antigravity` 수정 시각(17:00:04 KST)은 이번 실행 시각과 겹치지 않는다. W1이 찾은, Orca가 주기적으로 실행하는 사람의 `agy`와 같은 형태다. `~/Library/Application Support/doan/*` 변화는 실행 중인 사람의 Doan 앱이 만든 것이다(W1과 같은 noise).
- **(c) Claude 자기 설정**(`claude/claude-probe.mjs`, 가짜 Messages API, 로그인 없음, `cases/`·`out/`). 규칙은 `Read(//<userData>/**)`, `Edit(//<userData>/**)`이고, 2.1.319와 2.1.284의 결과가 같다.

  | 설정 | `cat`·`grep -r`·redirect | `perl`이 직접 여는 읽기·쓰기 | Read·Write 도구 | 자기 profile Read 도구 |
  |---|---|---|---|---|
  | `permissions.deny`(user, flag `--settings`, managed `--managed-settings` 모두 같음), sandbox 꺼짐 | 막힘 | **안 막힘** | 막힘 | 막힘(deny가 allow를 이긴다) |
  | 같은 deny + Full access(`bypassPermissions`) | 막힘 | **안 막힘** | 막힘 | 막힘 |
  | 사람이 project에서 sandbox 켬 + flag의 deny와 `sandbox.filesystem`(`denyRead`/`denyWrite`=userData, `allowRead`=profile·`runtime.json`·이번 첨부, `allowWrite`=profile) | 막힘(OS 수준) | 막힘 | 막힘 | 막힘 |
  | 위 + Full access + 명령의 `dangerouslyDisableSandbox` | — | **안 막힘**(승인 없이 sandbox 밖에서 돈다) | 막힘 | 막힘 |
  | 위 + flag `sandbox.allowUnsandboxedCommands: false` | — | 막힘 | 막힘 | 막힘 |
  | 바깥 fence + sandbox 꺼짐 | 막힘 | 막힘 | 막힘 | 됨 |
  | 바깥 fence + 사람이 sandbox 켬 | 모든 Bash가 71(`sandbox_apply`) | 71 | 막힘 | 됨 |

  - Ask first에서 sandbox 밖 실행(`dangerouslyDisableSandbox`)은 "Run outside of the sandbox" 승인을 요청한다. 사람이 승인하면 Full access와 같이 `perl` 읽기가 될 것으로 본다(추정: 승인 경로는 돌리지 않았다).
  - project의 `permissions.allow`(Read·Edit·Bash)와 `sandbox.filesystem.allowRead`/`allowWrite` userData는 Doan의 deny를 다시 열지 못했다(목록이 합쳐지고 deny가 이긴다). 사람의 profile settings의 sandbox, project의 sandbox, 사람이 project에서 sandbox를 켠 경우 모두 Doan의 flag tier sandbox 설정이 합쳐졌다.
  - Doan이 넣을 곳: flag tier(SDK `settings`, CLI `--settings`)가 맞다. agent가 고칠 수 있는 파일이 아니다. profile의 `settings.json`은 agent가 sandbox 꺼짐에서 `perl` 등으로 고칠 수 있다(위 표의 '안 막힘'). managed tier(SDK `managedSettings`)도 동작했지만, sdk.d.ts는 기계에 관리자 managed tier가 있으면 이 값을 기본으로 버린다고 적는다.
  - sandbox가 켜지는지 미리 알기: SDK `resolveSettings({ cwd, settingSources })`(0.3.312, alpha)가 profile·project·local의 `sandbox.enabled`와 그 출처를 돌려줬다(`claude/resolve.mjs`). sdk.d.ts는 이것이 "raw settings cascade, not a security decision"이고 관리자 `policyHelper`는 실행하지 않는다고 적는다. 틀리는 방향은 둘이다.
    - 꺼짐으로 읽었는데 켜짐이면: 바깥 fence 안에서 모든 Bash가 71로 실패한다. 보이는 실패다.
    - 켜짐으로 읽었는데 꺼짐이면: flag의 `permissions.deny`만 남아 `perl` 같은 프로그램은 막지 못한다.
  - Claude는 턴마다 새 프로세스이므로 이 판단은 턴마다 할 수 있다.
- **(c) Codex 자기 설정**(`codex/codex-probe.mjs`, app-server + 가짜 Responses API, 로그인 없음, `cases/`·`out/`). 0.166.0과 0.158.0의 결과가 같다.
  - app-server를 띄울 때 `-c default_permissions="doan"`과 `-c permissions.doan={extends=":workspace",filesystem={"<userData>"="deny","<profile>"="write","<userData>/runtime.json"="read","<userData>/attachments"="read"}}`를 주면 미끼가 막힌다. 막히는 것은 shell의 `cat`과 `perl` 읽기·쓰기, `view_image`, 그리고 사람이 승인한 `require_escalated` 명령까지다. `runtime.json` 읽기, 첨부, 자기 profile은 된다.
  - 턴마다 고르기: experimental API(`initialize`의 `capabilities.experimentalApi`)의 `turn/start` `permissions: "<profile id>"`가 동작했다. `sandboxPolicy`와 함께 쓸 수 없다. 읽기 전용 profile(`extends=":read-only"` + 같은 항목)도 같았다.
  - 지금 Doan이 보내는 `sandboxPolicy`(legacy)를 profile과 함께 보내면 userData 전체가 막힌다. `runtime.json`, 자기 profile, 첨부도 막히므로 `doan`이 동작하지 않는다.
  - 사람의 설정과의 관계:
    - 사람이 자기 profile을 쓰면(`default_permissions="mine"`), `-c permissions.mine.filesystem=...`으로 Doan의 항목을 더할 수 있었다. Default 턴에 사람의 profile id가 그대로 남고 deny가 걸렸다.
    - 사람이 설정이 없으면(지금 공유 profile, 기본 `:read-only`) 내장 profile에는 항목을 더할 수 없다. `-c permissions.":read-only".filesystem=...`은 "config defines `[permissions]` profiles but does not set `default_permissions`"로 시작하지 못한다. 그래서 Doan이 자기 profile을 정의하면 `default_permissions`도 정해야 한다. 사람의 Default가 Doan의 profile로 바뀐다.
    - 사람이 legacy `sandbox_mode`를 쓰면 Default 턴(덮어쓰기 없음)은 legacy 정책으로 돌고 Doan의 deny가 걸리지 않는다. 턴에 `permissions: "doan"`을 보내야 걸린다. 그러면 사람의 `sandbox_mode`와 `sandbox_workspace_write`를 Doan의 profile로 옮겨 적어야 한다.
    - 신뢰된 project의 `.codex/config.toml`이 `default_permissions`, `sandbox_mode = "danger-full-access"`, `[permissions.doan.filesystem]` userData `write`를 적어도 무시됐다.
  - 남는 틈: 사람이 승인한 `apply_patch`는 deny 경로(`conversations/`)에도 썼다. Ask first와 Accept edits에서 승인 카드에 그 경로가 보인다.
  - Full access: `dangerFullAccess`에는 Codex sandbox가 없어 Doan의 deny가 걸리지 않는다. `:root=write` + deny로 만든 profile은 명령을 막았지만, `apply_patch`가 "writing outside of the project"로 거절되어 Full access와 같지 않다.
  - 바깥 fence 안의 Codex: `sandboxPolicy` `externalSandbox`와 `dangerFullAccess`에서는 모든 명령이 돌고 fence가 막는다. `workspaceWrite`에서는 sandbox 안의 명령이 모두 71이다. 승인된 escalation 명령만 fence 아래에서 돈다.
  - requirements.toml의 `deny_read`는 `/etc/codex/requirements.toml`이나 MDM에만 있다(`CODEX_HOME`에서 읽지 않는다, 바이너리 문자열). Doan이 profile마다 둘 수 없다.
- **(d) Keychain**: fence 안에서 임시 keychain(`security create-keychain`, 항목 추가·수정·삭제)이 됐다. fence가 금지한 userData 아래에 keychain 파일을 만드는 것은 막혔다(`a/`). Copilot·Antigravity·Claude 실제 턴과 Codex fence 턴에서 agent shell의 임시 keychain과 `git credential-osxkeychain get`이 됐다. 실제 login keychain에는 쓰지 않았다. 전후 Keychain 항목 수는 46개로 같다.
- **(f) `doan`**(`real/doan-f.mjs`, 앱 대신 요청을 받는 가짜 socket): fence 안과 밖의 출력과 종료 코드가 같았다. 대상은 `doan skill`, `design-skill --json`, `ls`, `check`, `active`, `open`, `work update`다. 앱 명령은 tmpdir의 socket까지 닿았다. `doan check`는 `sessions.jsonl`에 쓰지 않았다(fence 밖에서도 conversation id가 없어 쓰지 않았으므로, 결정 B의 차이는 이 probe로 확인되지 않았다).
  - 확인하지 못했다: `doan handoff`의 실제 요청, 첨부 이미지가 든 실제 턴, MCP connector, turn-end 사용량 읽기.
- **(g) Antigravity의 `agent-runtimes/`**: fence 안(읽기만 허용)과 fence 밖 실행 모두 그 아래에 새로 생기거나 바뀐 파일이 없었다(mtime 목록). Seatbelt 거부는 unified log에 남지 않아(`(debug deny)`도 마찬가지) 막힌 쓰기 시도는 이 방법으로 볼 수 없다. 그래서 fence 밖 대조로 판단했다. 쓰기를 열 필요는 없다.
- **(h) pid와 Stop**: `sandbox-exec`는 대상을 같은 프로세스에서 실행한다. spawn한 pid의 명령이 provider 바이너리이고, pid, pgid, 시작 시각이 같다(`a/h.mjs`, `real/runs/*/result.jsonl`의 `leader`). `kill(-pgid)`는 Cursor 87 ms, Copilot 약 3.3 s, Antigravity 61 ms에 그룹을 끝냈다.
  - Copilot의 도구 명령은 자기 process group에서 돌지만 Copilot이 끝날 때 함께 끝났다.
  - Antigravity harness의 도구 명령(`sleep 120`)은 자기 process group에 있어 Stop 뒤에도 남았다. fence 없이도 같다. 그러므로 fence와 관계없는 기존 동작이다(Doan `OwnedGroup`도 `-pgid`만 보낸다). 남은 프로세스는 fence를 그대로 물려받는다. BACKLOG 후보다.
- **추천**(T2에서 사용자에게 묻는다):
  - Cursor·Antigravity·Copilot: 위 정책으로 바깥 fence. Cursor의 실제 도구 호출은 T5에서 다시 본다.
  - Claude: (가)를 run마다 고른다. Doan이 턴마다 `resolveSettings`로 sandbox를 읽는다. 꺼짐이면 바깥 fence를 쓰고, 켜짐이면 바깥 fence 없이 flag tier에 `permissions.deny`와 `sandbox.filesystem`을 넣는다. 사람의 sandbox가 그대로 동작하므로 PRODUCT §3이 유지된다. 남는 틈은 켜짐 + sandbox 밖 실행(Full access는 승인 없이, Ask first는 사람 승인 뒤)이다. 막으려면 flag에 `allowUnsandboxedCommands: false`를 넣어야 하는데, 이것은 사람의 설정을 좁히므로 결정이 필요하다.
  - Codex: Full access가 아닌 모드는 (가) Codex permission profile, Full access는 바깥 fence로 나눈다. Full access와 다른 모드 사이를 오갈 때는 app-server를 다시 띄우고 `thread/resume`한다(fence 턴 B로 확인). 이때 바뀌는 것은 다음과 같다.
    - Doan의 turn 권한을 legacy `sandboxPolicy`에서 `permissions` profile id(experimental API)로 바꾼다.
    - 사람의 Default가 legacy 설정이나 내장 profile이면 Doan profile로 옮겨 적는다.
    - 남는 틈(승인된 `apply_patch`)은 'Known limits'에 적는다.
  - 둘 다 받아들이지 않으면 남는 길은 (다)다. Claude와 Codex 모두 자기 sandbox를 끄고 바깥 fence만 쓴다. Codex는 `externalSandbox`로 통과를 확인했다.

**P3. Antigravity의 profile 안 작업 (§3.3)**

- 질문: 2026-11-05의 쓰기와 `ls`가 (i)인가 (ii)인가. Doan이 쓴 stub 말고 서버가 skill 경로에 쓰는 것이 있는가.
- 방법: P1의 archive 읽기에서 system prompt와 skill 경로 안내를 찾는다. 실제 턴에서 ACP frame(permission 요청의 `TargetFile`·`Cwd`)을 기록한다. 실제 턴은 P1의 로그인을 다시 쓴다.
- **결과: (i)로 본다**(2026-11-09, 서버 1.3.0). frame은 `.scratch/provider-profile-isolation/runs/real/frames.jsonl`에 있다.
- archive 읽기(`server.py`):
  - 세션을 만들 때 서버는 harness에 `"workspaces": [cwd] + skills_dirs`를 넘긴다. `skills_dirs`는 `resolve_skills_paths(cwd)`, 곧 `<GEMINI_HOME>/config/skills`, `<cwd>/.gemini/skills`, `<GEMINI_HOME>/antigravity-cli/skills`, `<cwd>/.agents/skills`다.
  - 파일 접근 정책의 workspace root도 "cwd + gemini_home + skills"다. 그래서 `<GEMINI_HOME>` 전체가 permission 판단에서 "workspace 안"으로 취급된다.
  - 서버가 skill 경로에 쓰는 코드는 찾지 못했다. harness 바이너리에 `antigravity-cli/skills`라는 문자열도 없다. harness의 skill 안내 문장은 `~/.gemini/config/skills/<name>/`와 `<workspace>/.agents/skills/<name>/`를 skill 위치로 든다.
- 실제 턴(사용자 승인 로그인, 프로젝트 cwd, 모든 permission 허용):
  - `pwd`는 프로젝트를 돌려줬다. `probe-p3.txt`는 프로젝트에 생겼다(`TargetFile`이 프로젝트 경로). 두 명령(`pwd`, `ls`)의 `Cwd`가 모두 프로젝트였다. 서버는 `session/new`의 `cwd`를 도구 실행에 쓴다. (ii)가 아니다.
  - skill을 묻자 agent는 `ls -la <profile>/.gemini/config/skills <profile>/.gemini/antigravity-cli/skills`를 실행했다. 서버가 workspace로 넘긴 두 profile 경로를 그대로 본 것이다. agent는 `doan` 하나를 `<profile>/.gemini/config/skills/doan`에서 읽었다고 답했다. 새 user skill을 둘 곳으로는 `<profile>/.gemini/config/skills`를 들었다.
  - 2026-11-05의 쓰기와 `ls`도 같은 구조로 설명된다. 서버가 profile의 skill 경로를 agent의 workspace로 주고, agent가 skill 관련 작업을 그곳에서 했다. 그때의 프롬프트는 확인하지 않았다.
- 서버와 harness가 skill 경로에 쓴 것: 없음. 턴이 끝난 뒤 profile에는 Doan의 stub(`config/skills/doan/SKILL.md`), `antigravity-acp/`(설정, 대화, `brain/`), `antigravity/bin/webm_encoder`만 있었다. `antigravity-cli/` 디렉터리는 생기지 않았다.
- 추천: (i). 결정 Q3대로 Antigravity 정책에 `<GEMINI_HOME>/config/skills`와 `<GEMINI_HOME>/antigravity-cli/skills`의 쓰기 금지를 더해도 서버 동작과 충돌하지 않는다(이번 한 턴 기준). fence는 profile 안의 `antigravity-acp/`와 `antigravity/`에 쓰기를 열어야 한다.

## 9. POSTMORTEM에서 가져온 함정

- **2026-11-07 — Antigravity conversations ran without the doan skill stub**: "the stub path was confirmed once by a live check … and recorded only as a code comment", 그리고 "a missing skill does not fail". → fence가 stub이나 skill 경로를 막으면 실패 없이 skill 없이 돈다. P2(b)와 runtime-test에서 다섯 provider 모두 실제 턴에 `doan`이 skill 목록에 있는지 묻는다.
- **2026-10-30 — Packaged-app probes failed for reasons of their own: keychain, signature identity and focus**: "an isolated `HOME` has no `~/Library/Keychains`, so `codex` (keyring store) and Electron `safeStorage` find no default keychain." 그리고 실제 로그인 probe는 "link `<temp HOME>/Library/Keychains` to the real folder (approved real-state change; delete the provider's keyring item and `<App> Safe Storage` afterwards and verify)". → P1·P2의 실제 로그인은 이 절차를 따른다. 다만 원래 있던 항목은 지우지 않는다(§8 공통 절차). 링크한 동안의 Antigravity 실행이 바로 BACKLOG의 Keychain 변경을 만든 조건이므로, P1은 Keychain 항목 수정 시각을 전후로 기록한다.
- **2026-11-01 — A failed Antigravity sign-in left no evidence of why**: "Never log a provider's message text, even filtered", 그리고 서버가 "deletes `acp_token.json` itself". → fence 거절로 실패한 시작은 Doan의 분류만 로그에 남긴다. 토큰이 사라지면 Doan의 scrub를 의심하기 전에 서버 소스를 읽는다.
- **2026-10-30 — A model list read made sign-out ask to stop conversations**: "a lease says its use … A new kind of lease … must pick its use." → fence는 기존 `use`(`run`)로 정한다(`Prepared.fence`). 새 lease 종류를 만들지 않는다.

## 10. 결정 요약

| # | 질문 | 결정 | 위치 |
|---|---|---|---|
| Q1 | 보호 범위 | Doan 연결 대화 agent로부터 Doan userData만 막는다. 승격 때 ARCHITECTURE §7 "does not sandbox the agent"를 좁힌다 | spec '보호 범위', design §7 |
| Q2 | fence를 붙일 프로세스 | 대화 run만(`Prepared.fence`, `use === "run"`). §3.2가 경로 1이라 Antigravity의 `acpExec`에도 붙이지 않는다 | spec Non-goals, design §3.1 |
| Q3 | Antigravity 자기 skill 경로 쓰기 | P3가 (i)이므로 막는다 | design §3.3 |
| Q4 | `stop_required` 뒤 종료 | 동작 그대로, 한계를 문서화 | spec 완료 조건 6, design §3.4 |
| Q5 | fence를 세울 수 없을 때 | fail closed, 기존 시작 실패(`unknown`, `process_exited`), 새 문구 없음 | spec 완료 조건 4, design §3.1 |
| Q6 | Antigravity 실제 상태 쓰기를 막을 방법이 없을 때 | P1이 경로 1로 통과해 이 분기는 쓰지 않는다 | spec 완료 조건 1, design §3.2 |
| A | 첨부 | Claude·ACP는 이번 턴의 첨부만, Codex는 첨부 전체. Codex 쪽은 한계로 적는다 | spec '보호 범위', design §3.1 |
| B | fence 안 `doan check`의 `sessions.jsonl` | 쓰지 못하는 것을 받아들인다. 출력과 종료 코드는 그대로 | spec 완료 조건 3·Non-goals, design §3.1 |
| C | 실제 HOME에서의 Antigravity 확인 | T5에서 실제 HOME으로 돌리고 재귀 목록을 비교한다(체인 파일에서 미리 승인) | spec 완료 조건 1, tasks T5 |
| D | PRODUCT 승격 | §3 'Resume and permissions'에 "어떤 권한 모드에서도 자기 profile 밖의 userData를 읽거나 쓰지 못한다"를 적는다 | design §7, tasks T7 |

| P0 | 중첩 Seatbelt 실패 | Cursor·Antigravity·Copilot은 바깥 fence, Claude·Codex는 자기 설정을 먼저 본다. PRODUCT §3의 Ask first 문장은 지킨다 | orch.md '결정 기록', design §3.1 |
| P1 | Antigravity 실제 상태 | 경로 1, 환경 변경 없음 | design §3.2 |
| P3 | Antigravity profile 안 작업 | (i), skill 경로 쓰기 금지 | design §3.3 |
| Claude | Claude의 막는 방법 | 턴마다 sandbox 상태를 읽어, 꺼지면 바깥 fence, 켜지면 flag tier 설정(`permissions.deny`, `sandbox.filesystem`, `allowUnsandboxedCommands: false`). 판정을 틀려 켜진 것을 꺼짐으로 보면 Bash가 보이는 실패로 끝난다 | orch.md '결정 기록', design §3.1 |
| Codex | Codex의 막는 방법 | Full access가 아니면 Doan의 Codex permission profile(`deny` 항목, `default_permissions`)을 턴마다 고르고, Full access면 바깥 fence 안의 app-server. 둘 사이를 오가면 app-server를 다시 띄우고 `thread/resume`한다. 승인된 `apply_patch`의 틈과 experimental API 의존은 Known limits | orch.md '결정 기록', design §3.1 |

구현 세부(conductor 승인): Claude sandbox는 SDK 함수 대신 같은 출처를 같은 우선순위로 직접 읽어 판정한다. sandbox가 켜진 Claude 턴의 `permissions.deny`는 턴 시작 때 나열한 형제 항목만 적는다. 첨부 매개변수는 붙여넣은 이미지 수에 따른다. Codex Ask first·Plan은 `doan`(읽기 전용), Accept edits는 `doan-workspace` profile이고, `:workspace`가 `sandbox_workspace_write`의 네트워크와 쓰기 경로를 따르는지는 T5에서 본다(§3.1).
