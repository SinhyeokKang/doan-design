# provider-profile-isolation — design

이 문서의 방향은 PoC(§8)가 통과한다는 가정 위에 있다. Q1–Q6과 A–D는 사용자가 결정했다(§10). PoC 결과에 따라 사용자에게 다시 묻는 것은 두 가지다. P0가 실패할 때의 방향, 그리고 P2에서 실패한 provider의 처리다(§8).

## 1. 영향 받는 구성 요소

- **app main (Electron + TS)**
  - fence를 다는 곳: `conversation/prepare.ts`가 `use === "run"`일 때만 `Prepared.fence`(`conversation/service.ts`의 `Prepared`에 새 선택 필드)를 채운다. 모델 목록(`use === "listing"`)과 legacy external에는 없다.
  - fence를 쓰는 세 spawn 지점: Codex app-server(`conversation/runners.ts`의 `spawn(..., "app-server")`), Claude Code(`runners.ts`의 SDK `spawnClaudeCodeProcess`), ACP 서버(`conversation/acpRunner.ts`의 `spawn`). `Prepared.fence`가 있을 때만 감싼다.
  - 대화 lease가 run 환경을 만드는 곳: `agentAuth/manager.ts` `acquire`/`launch`, `agentAuth/environment.ts` `providerEnv`.
  - Antigravity 서버를 띄우는 그 밖의 곳: `manager.ts` `acpExec`를 부르는 세 곳(`acpSignIn`, `acpStatus`, `acpLogout`). §3.2 경로 2일 때만 바뀐다.
  - 새 파일 하나: fence 정책을 만드는 순수 모듈(이름은 `/tdd`에서 정한다. 예: `agentAuth/fence.ts`).
- **CLI (Go)**: 바뀌지 않는다. agent가 실행하는 `doan`은 `DOAN_RUNTIME`의 `runtime.json`을 읽고 tmpdir의 socket에 연결한다(`app/src/main/runtime.ts`). fence는 이 둘을 막지 않는다. 다만 fence 안의 `doan check`는 `<userData>/sessions.jsonl`(`conversation/io.ts`가 읽는 파일)에 쓰지 못한다(결정 B, §3.1).
- **skills**: 바뀌지 않는다. profile의 doan `SKILL.md` stub은 Doan이 프로세스를 띄우기 전에 쓴다.
- **형식**: 바뀌지 않는다(§5).
- **renderer**: 바뀌지 않는다. 새 화면, 문구, 실패 코드가 없다(결정 Q5). 예외: §3.2의 Q6 (a) 분기로 가면 Settings > Agents에 Antigravity를 막은 이유가 생긴다.

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

### 3.1 profile 경계: 대화 run을 Doan의 Seatbelt 정책 안에서 띄운다

- Doan 연결 대화의 run 프로세스를 `/usr/bin/sandbox-exec`로 감싸 띄운다. 정책은 "기본 허용, Doan userData만 막고 그 안의 필요한 경로만 다시 연다"이다. 정책은 run 프로세스와 그 자식에 모두 걸린다. agent의 shell 명령과 파일 도구도 그 안에 있다.
- **다는 곳**: `prepare.ts`가 `use === "run"`일 때만 `Prepared.fence`를 채운다. 세 spawn 지점은 그 필드가 있을 때만 감싼다. 필드가 없으면(모델 목록, legacy external) 지금과 똑같이 띄운다. 그래서 기존 테스트는 그대로 통과해야 한다.
- 정책 모양(규칙 평가 순서의 의미는 P2에서 확인한다):
  - 기본: 모두 허용.
  - `<userData>` 아래 읽기·쓰기 금지.
  - 다시 허용:
    - 이 run의 profile 디렉터리: 읽기·쓰기.
    - `<userData>/runtime.json`: 읽기만(`doan` CLI가 `DOAN_RUNTIME`으로 읽는다).
    - 첨부: Claude와 ACP run은 이번 턴의 `<userData>/attachments/<id>/`만 읽기. Codex run은 `<userData>/attachments/` 전체를 읽기. Codex app-server는 여러 턴에 걸쳐 살고 정책은 띄울 때 정해지기 때문이다(결정 A).
    - `<userData>/agent-auth/browser-hook`: 읽기·실행(Claude, Antigravity).
    - `<userData>/agent-runtimes/antigravity-acp/`: 읽기·실행(Antigravity만). 서버가 이곳에 쓰는지는 P2에서 확인하고, 쓰면 쓰기도 연다.
  - Antigravity만 추가 금지(§3.2 경로 2, §3.3 결정 Q3).
- 정책 문장은 `-p`(문자열)로 넘긴다. 정책 파일을 쓰지 않으므로 파일 쓰기 실패가 없다. 경로는 정책 문장에 이어 붙이지 않고 `-D NAME=<path>` 매개변수로 넘긴다. 그래야 경로에 따옴표나 괄호가 있어도 정책이 깨지지 않는다.
- 경로는 main이 `realpath`로 푼 값을 쓴다(Seatbelt가 `/var`와 `/private/var`처럼 푼 경로로 비교하는지 P2에서 확인). §3.2 경로 2의 실제 home은 `$HOME`이 아니라 사용자 DB(`getpwuid`)에서 얻는다. 격리 HOME으로 띄운 probe에서도 실제 home을 막기 위해서다.
- **fail closed**(결정 Q5): 아래 경우 run은 기존 시작 실패로 끝난다. 새 실패 코드와 문구는 만들지 않는다.
  - 띄우기 전 거절(경로를 `realpath`로 풀 수 없음, 절대 경로가 아님, NUL이나 줄바꿈이 있음) → `unknown`.
  - `sandbox-exec`가 없음(spawn `ENOENT`)이나 정책 오류로 바로 끝남 → `process_exited`.
  - 어느 경우도 `cli_missing`을 쓰지 않는다. provider CLI가 없는 것이 아니기 때문이다.
- **적용 범위**: Doan 연결 대화 run만이다. 로그인, 상태 확인, 로그아웃, 모델 목록, 사용량 fresh read, MCP connector 명령, Codex identity lookup에는 붙이지 않는다(결정 Q2). 예외: §3.2 경로 2로 가면 Antigravity 서버를 띄우는 모든 곳(`acpExec`의 세 곳 포함)에 fence를 붙인다.
- **받아들인 한계**(spec '보호 범위', T7 'Known limits'):
  - fence 안의 `doan check`는 `<userData>/sessions.jsonl`에 session association을 더하지 못한다. 출력과 종료 코드는 그대로다(결정 B).
  - 모델 목록 읽기는 fence 밖에서 저장소의 설정으로 돌므로, 저장소 hook이 그때 실행될 수 있다.
  - fence는 run 안의 직접 접근만 막는다. agent가 남긴 설정(`~/.zshrc`, 저장소의 `.claude/settings.json` hook, `.mcp.json` 등)은 나중에 fence 밖의 프로세스가 실행할 수 있다.
  - `sandbox-exec`가 macOS에서 없어지면 모든 Doan 연결 run이 시작하지 못한다.
- **provider 자체 sandbox와의 관계**: Codex는 Ask first와 Accept edits에서 명령을 자기 sandbox로 실행하고, Claude Code도 사람이 설정하면 자기 sandbox를 쓴다. 바깥에 Doan의 정책이 있을 때 안쪽 sandbox가 동작하는지는 모른다. 로그인 없이 P0에서 먼저 보고, 실제 provider로 P2에서 본다.

### 3.2 Antigravity가 실제 상태를 바꾸지 않게 한다

P1의 결과에 따라 아래 중 하나를 고른다. 순서는 선호 순이다.

1. **설정으로 옮긴다.** pinned 서버(1.3.0)나 language server가 받는 환경 변수·인수 중 `antigravity-cli` 디렉터리와 자격 증명 저장소를 profile 안으로 옮기는 것이 있으면, `providers.ts`의 Antigravity `env`나 `environment.ts`에 더한다. `AGY_ACP_FORCE_FILE_STORAGE`처럼 문서화되지 않은 변수라면 ARCHITECTURE §7 'Antigravity server'의 기존 예외 목록에 더한다.
2. **fence로 막는다.** 옮길 방법이 없으면 Antigravity 프로세스의 정책에 `<real HOME>/.gemini/antigravity-cli/` 쓰기 금지를 더한다(실제 home은 `getpwuid`). Keychain 항목을 바꾼 것이 language server라면 Keychain 접근도 막는다(Seatbelt에서 막을 단위는 P1에서 정한다). 이때 Antigravity 서버를 띄우는 모든 곳(로그인·상태 확인·로그아웃·대화)에 fence를 붙인다. 조건은 두 가지다. 막았을 때 로그인, 대화, 로그아웃이 그대로 된다. Keychain을 막아도 agent의 git credential helper가 동작한다. 후자가 안 되면 ARCHITECTURE §7 'Known limits'에 적는다.
3. **둘 다 안 되면** P1 결과에 따라 나눈다(결정 Q6).
   - 사람의 `agy` 로그인을 바꾸면: Antigravity의 로그인과 새 대화를 막고 Settings > Agents에 이유를 보인다. 상태 확인, 로그아웃, 기존 대화의 resume과 send, 첫 실행 Agent 단계, Home의 agent picker를 어떻게 할지는 T2에서 정한다. 새 문구가 생기므로 `/design-draft`와 Doan의 `clarify` preset이 필요하다(tasks T2a).
   - 로그·설정 파일 쓰기뿐이면: ARCHITECTURE §7 'Known limits'에 적고 Antigravity를 그대로 둔다.
   - 고르지 않은 것: 어느 경우든 문서화만 하기. "never changes external credentials" 결정과 충돌한다.

### 3.3 Antigravity가 자기 profile 안에서 일한 것

- P3로 원인을 분류한다.
  - (i) agent가 `HOME`이 profile이라 `~/.gemini/antigravity-cli/skills`를 자기 skill 경로로 보고 그곳에서 일했다.
  - (ii) 서버가 도구 실행에 `session/new`의 `cwd`를 쓰지 않는다.
- (i)이면: 다른 provider로 넘어가지 않으므로 경계 문제는 아니다. 그래도 Antigravity의 정책에 자기 profile의 skill 경로(`<GEMINI_HOME>/config/skills`, `<GEMINI_HOME>/antigravity-cli/skills`) 쓰기 금지를 더한다(결정 Q3). stub은 Doan이 프로세스를 띄우기 전에 쓰므로 서버가 쓸 필요가 없다(P3에서 확인). 그러면 agent가 Doan의 stub을 바꾸거나 skill을 더해 다음 대화에 영향을 주는 일도 막힌다. P3에서 서버가 그 경로에 써야 한다고 밝혀지면 그 경로는 열어 두고 T2에서 보고한다.
- (ii)이면: 서버 동작이므로 Doan이 고칠 수 없다. 사실을 ARCHITECTURE §7 'Agent authentication' 'Known limits'에 적고, Ask first에서 permission card가 `Cwd`를 보여 주는지는 BACKLOG에 남긴다.

### 3.4 `stop_required` 뒤 종료

- 결정(Q4): **동작을 바꾸지 않는다.** 답하지 않은 확인 대화상자는 로그아웃을 확인하지 않은 것이다. 종료는 그것을 취소로 다루고, 다음 실행에서 연결이 그대로 보이므로 사람이 다시 로그아웃할 수 있다. 어긋나는 상태(연결은 없는데 자격 증명이 남음)는 생기지 않는다.
- 고아 Keychain 항목은 userData를 지울 때 생기며 `stop_required`와 관계없다. ARCHITECTURE §7 'Known limits'에 "Claude Code·Codex 연결의 Keychain 항목은 profile 경로로 열쇠가 정해지고 userData를 지워도 남는다. 지우려면 먼저 로그아웃한다"를 적는다. MCP connector token(Keychain)과 `doan Safe Storage`도 남는지 확인하고, 남으면 같은 줄에 적는다.
- 고르지 않은 것: 종료 때 로그아웃을 끝내기(사람이 확인하지 않은 로그아웃을 실행한다), 보류를 기록해 다음 실행에서 묻기(새 상태와 문구가 생긴다).

## 4. 순수 함수로 뺄 것 (`/tdd` 대상)

- `fencePolicy(provider)` → 정책 문장(SBPL). 같은 provider면 같은 문장이다. 경로는 들어가지 않고 매개변수 이름만 들어간다. 실제 home 매개변수는 Antigravity가 §3.2 경로 2일 때만 쓴다.
  - 테스트: 다섯 provider의 정책 스냅숏. 스냅숏은 §8 P2에 적은 통과 정책 문장과 같아야 한다. Antigravity에만 `agent-runtimes` 실행 허용과 §3.2·§3.3의 추가 금지가 있다. browser-hook 허용은 Claude와 Antigravity에만 있다. Codex만 첨부 디렉터리 전체를 연다.
- `fenceArgs({ provider, userData, profileDir, attachments, realHome? })` → `sandbox-exec` 인수 목록(`-p <정책>`, `-D` 매개변수) 또는 거절 코드.
  - 테스트: 상대 경로, NUL, 줄바꿈 → 거절. profile이 userData 밖 → 거절. staging profile(`codex-<id>`)도 자기 디렉터리만 연다. 다른 provider의 profile 경로는 어떤 매개변수에도 나오지 않는다. Claude·ACP는 이번 턴의 첨부 id 디렉터리만, Codex는 첨부 디렉터리 전체가 매개변수로 나온다.
- `fencedCommand(command, args, fence?)` → `{ command: "/usr/bin/sandbox-exec", args: [...] }`. 세 spawn 지점이 같은 함수를 쓴다.
  - 테스트: 원래 인수 순서가 보존된다. `fence`가 없으면(legacy external, 모델 목록) 그대로 돌려준다. 네 권한 모드(Ask first, Accept edits, Plan, Full access) 모두 같은 `sandbox-exec` 인수로 시작한다.
- `Prepared.fence`를 채우는 규칙(`prepare.ts`)
  - 테스트: `use === "run"`이면 있다. `use === "listing"`으로 준비하면 없다. legacy external(`createPrepare`)은 없다(기존 테스트가 그대로 통과).
- fail closed의 분류
  - 테스트: `sandbox-exec` 경로를 주입해 `ENOENT` → `process_exited`. 정책 오류로 바로 끝남 → `process_exited`. `realpath` 실패 → 띄우지 않고 `unknown`. 어느 경우도 `cli_missing`이 아니다.
- Antigravity 분기별 테스트
  - 경로 1: Antigravity 환경 변수 추가는 `providerEnv`의 기존 테스트(`environment.test.ts`)에 사례를 더한다. 새 변수는 `RESERVED`에 넣어 extra로 덮을 수 없게 한다.
  - 경로 2: `acpExec`를 부르는 세 곳(로그인, 상태 확인, 로그아웃)이 fence로 감싸진다.
  - 경로 3의 막는 분기: 로그인과 새 대화가 거절되고, 기존 대화의 resume은 T2에서 정한 대로 처리된다.

## 5. 형식 변경

없다. JSON Schema, `runtime.json`, app socket 메시지, CLI 응답, 대화 index와 event 형식이 그대로다. `Prepared.fence`는 main 내부 타입이다. 실패 코드도 기존 것(`unknown`, `process_exited`)을 쓴다(결정 Q5).

## 6. Conventions 영향

없다. ARCHITECTURE §1과 `doan check` 규칙을 바꾸지 않는다.

## 7. 결정 영향

- **ARCHITECTURE §7 "The app does not sandbox the agent or promise that repository settings/hooks cannot execute code."** 이번 fence는 Doan userData의 경로만 막으므로 이 문장을 좁혀 고친다. 예: "Doan fences only its own userData from Doan-connection runs; it does not otherwise sandbox the agent…". 사용자가 승인했다(결정 Q1). 고치는 것은 T7 승격 때다.
- **PRODUCT §3 'Resume and permissions'**: 사용자가 승인한 약속을 더한다. "Doan 연결 대화의 agent는 어떤 권한 모드에서도(Full access 포함) 자기 profile 밖의 Doan userData를 읽거나 쓰지 못한다. 막힌 읽기는 도구 실패로 보인다."(결정 D). "Ask first applies the user's own permission and sandbox settings"는 P0·P2에서 provider 자체 sandbox가 Doan의 정책 안에서도 동작해야 유지된다. 동작하지 않으면 이 문장과 충돌하므로 §8의 대안으로 간다.
- **PRODUCT §3 'Association recording'** "silently skips what it cannot record": fence 안 `doan check`가 `sessions.jsonl`을 쓰지 못하는 것은 이 규칙 안에 있다(결정 B). 문장은 바꾸지 않는다.
- **ARCHITECTURE §7 'Agent authentication' "it never reads, copies or changes those external credentials"**: §3.2가 이 결정을 지키려는 작업이다. 지킬 방법이 없으면 결정 Q6에 따라 사람의 `agy` 로그인을 바꾸는 경우 Antigravity를 막는다. 그때는 PRODUCT §2 Users와 §5 item 0의 첫 실행 Agent 단계, Settings > Agents도 고친다.
- **ARCHITECTURE §7 'Antigravity server'(승인된 예외)**: 경로 1이 문서화되지 않은 변수를 더하면 이 예외 목록이 늘어난다.
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
  (T1에서 채운다)
  ```

- 대안(provider별로 실패하면):
  - (가) 그 provider만 provider 자체 설정으로 막는다. 예: Claude의 profile `settings.json`에 `permissions.deny` 읽기 규칙. 다만 shell 명령은 막지 못할 수 있다.
  - (나) 그 provider만 한계로 문서화한다.
  - (다) 그 provider의 자체 sandbox를 끄고 Doan 정책만 쓴다. PRODUCT §3 'Resume and permissions'를 바꾸므로 결정이 필요하다.
  - (가)·(나)로 끝난 provider는 막는 범위와 남는 한계를 ARCHITECTURE §7 'Known limits'에 적는다.
- **확인 필요**: 어느 대안으로 갈지는 실패한 provider와 원인을 보고 T2에서 사용자에게 묻는다. 그때 추천을 하나 붙인다.

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
| Q2 | fence를 붙일 프로세스 | 대화 run만(`Prepared.fence`, `use === "run"`). P1이 §3.2 경로 2면 Antigravity 서버를 띄우는 모든 곳 | spec Non-goals, design §3.1 |
| Q3 | Antigravity 자기 skill 경로 쓰기 | P3가 agent 동작((i))이면 막는다 | design §3.3 |
| Q4 | `stop_required` 뒤 종료 | 동작 그대로, 한계를 문서화 | spec 완료 조건 6, design §3.4 |
| Q5 | fence를 세울 수 없을 때 | fail closed, 기존 시작 실패(`unknown`, `process_exited`), 새 문구 없음 | spec 완료 조건 4, design §3.1 |
| Q6 | Antigravity 실제 상태 쓰기를 막을 방법이 없을 때 | P1 결과로 나눈다: 사람의 `agy` 로그인을 바꾸면 Antigravity의 로그인과 새 대화를 막고(세부는 T2), 로그·설정 파일 쓰기뿐이면 'Known limits'에 적는다 | spec 완료 조건 1, design §3.2 |
| A | 첨부 | Claude·ACP는 이번 턴의 첨부만, Codex는 첨부 전체. Codex 쪽은 한계로 적는다 | spec '보호 범위', design §3.1 |
| B | fence 안 `doan check`의 `sessions.jsonl` | 쓰지 못하는 것을 받아들인다. 출력과 종료 코드는 그대로 | spec 완료 조건 3·Non-goals, design §3.1 |
| C | 실제 HOME에서의 Antigravity 확인 | T5에서 그때 사용자 승인을 받아 실제 HOME으로 돌리고 재귀 목록을 비교한다. fence의 실제 home은 `getpwuid` | spec 완료 조건 1, tasks T5 |
| D | PRODUCT 승격 | §3 'Resume and permissions'에 "어떤 권한 모드에서도 자기 profile 밖의 userData를 읽거나 쓰지 못한다"를 적는다 | design §7, tasks T7 |

남은 확인 필요: P0가 실패할 때의 방향, P2에서 실패한 provider의 처리(§8 P2의 (가)·(나)·(다)). 둘 다 T2에서 묻는다(P0 실패는 T0 전에).
