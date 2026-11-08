# provider-profile-isolation — design

이 문서의 방향은 PoC(§8)가 통과한다는 가정 위에 있다. Q1–Q6은 사용자가 결정했다(§10). P2에서 실패한 provider가 있을 때의 처리만 PoC 결과에 따라 T2에서 사용자에게 묻는다(§8 P2).

## 1. 영향 받는 구성 요소

- **app main (Electron + TS)**
  - 대화 run 프로세스를 띄우는 세 곳: Codex app-server(`conversation/runners.ts`의 `spawn(..., "app-server")`), Claude Code(`runners.ts`의 SDK `spawnClaudeCodeProcess`), ACP 서버(`conversation/acpRunner.ts`의 `spawn`).
  - 대화 lease가 run 환경을 만드는 곳: `agentAuth/manager.ts` `acquire`/`launch`, `agentAuth/environment.ts` `providerEnv`.
  - Antigravity 서버를 띄우는 그 밖의 곳: `manager.ts` `acpExec`(로그인, 상태 확인, 로그아웃). §3.2의 경로에 따라 바뀐다.
  - 새 파일 하나: fence 정책을 만드는 순수 모듈(이름은 `/tdd`에서 정한다. 예: `agentAuth/fence.ts`).
- **CLI (Go)**: 바뀌지 않는다. agent가 실행하는 `doan`은 `DOAN_RUNTIME`의 `runtime.json`을 읽고 tmpdir의 socket에 연결한다(`app/src/main/runtime.ts`). fence는 이 둘을 막지 않는다.
- **skills**: 바뀌지 않는다. profile의 doan `SKILL.md` stub은 Doan이 프로세스를 띄우기 전에 쓴다.
- **형식**: 바뀌지 않는다(§5).
- **renderer**: 바뀌지 않는다. 새 화면, 문구, 실패 코드가 없다(결정 Q5). 예외: §3.2의 Q6 (a) 분기로 가면 Settings > Agents에 Antigravity를 막은 이유가 생긴다.

## 2. 지금 구조 (코드에서 읽은 사실)

- profile은 `<userData>/agent-auth/profiles/<profile>/`(0700)이고 모두 같은 uid가 소유한다. Claude는 `CLAUDE_CONFIG_DIR`, Codex는 `CODEX_HOME`, Cursor·Antigravity·Copilot은 `HOME`을 profile로 받는다. Antigravity는 `GEMINI_HOME=<profile>/.gemini`도 받는다(`environment.ts`).
- vault provider(Cursor, Antigravity, Copilot)는 프로세스를 띄우기 전에 자격 증명 작업 사본을 profile에 평문으로 쓰고, 그 profile을 잡은 마지막 프로세스가 끝나면 지운다(ARCHITECTURE §7 'Storage' 'Working copies').
- Doan 자신의 대화 기록은 `<userData>/conversations/`에 모든 provider 것이 함께 있다.
- run 프로세스의 cwd는 프로젝트다. ACP 서버도 `spawn`의 `cwd`와 `session/new`의 `cwd`가 모두 `input.cwd`다(`acpRunner.ts`).
- Antigravity의 tool facts(`agentAuth/facts.ts` `toolFacts`)는 프로세스를 띄우지 않는다. BACKLOG가 "tool-fact check"라고 적은 것은 `acpExec`의 상태 확인으로 보인다(추정).
- 로그아웃의 `stop_required`는 main이 거절로 돌려주고, renderer가 확인 대화상자를 연다(`agentAuthView.ts` `replyEffect`). 종료(`index.ts` `before-quit` → `agentAuth.quit()`)는 진행 중인 로그아웃만 기다린다. 대화상자에 걸린 로그아웃은 main이 모른다.
- macOS에 `/usr/bin/sandbox-exec`가 있다(이 Mac, Darwin 25.6에서 `ls`로 확인). 동작과 제약은 확인하지 않았다(P2).

## 3. 설계

### 3.1 profile 경계: 대화 run을 Doan의 Seatbelt 정책 안에서 띄운다

- Doan 연결 대화의 run 프로세스(§1의 세 곳)를 `/usr/bin/sandbox-exec`로 감싸 띄운다. 정책은 "기본 허용, Doan userData만 막고 그 안의 필요한 경로만 다시 연다"이다. agent의 shell과 파일 도구는 run 프로세스의 자식이므로 같은 정책을 받는다.
- 정책 모양(규칙 평가 순서의 의미는 P2에서 확인한다):
  - 기본: 모두 허용.
  - `<userData>` 아래 읽기·쓰기 금지.
  - 다시 허용:
    - 이 run의 profile 디렉터리: 읽기·쓰기.
    - `<userData>/runtime.json`: 읽기(`doan` CLI가 `DOAN_RUNTIME`으로 읽는다).
    - `<userData>/attachments/`: 읽기(붙여넣은 이미지; ARCHITECTURE §7 'Agent conversation runtime and IPC').
    - `<userData>/agent-auth/browser-hook`: 읽기·실행(Claude, Antigravity).
    - `<userData>/agent-runtimes/antigravity-acp/`: 읽기·실행(Antigravity만).
  - Antigravity만 추가 금지(§3.2, §3.3의 결과에 따라).
- 경로는 정책 문장에 이어 붙이지 않고 `sandbox-exec -D NAME=<path>` 매개변수로 넘긴다. 그래야 경로에 따옴표나 괄호가 있어도 정책이 깨지지 않는다. 경로는 main이 `realpath`로 푼 값을 쓴다(Seatbelt가 `/var`와 `/private/var`처럼 푼 경로로 비교하는지 P2에서 확인).
- 정책은 run마다 같은 입력에서 같은 문장이 나오는 순수 함수가 만든다. 매개변수에 NUL이나 줄바꿈이 있거나 절대 경로가 아니면 run을 시작하지 않는다.
- **fail closed**: `sandbox-exec`가 없거나 실행에 실패하면 run은 기존 시작 실패 경로로 끝난다. 새 실패 코드와 문구는 만들지 않는다(결정 Q5).
- **적용 범위**: Doan 연결 대화 run만이다. 로그인, 상태 확인, 로그아웃, 모델 목록, 사용량 fresh read, MCP connector 명령, Codex identity lookup에는 붙이지 않는다(결정 Q2). 예외: Antigravity가 §3.2에서 fence로 실제 상태 쓰기를 막는 경로를 고르면, Antigravity 서버를 띄우는 모든 곳에 fence를 붙인다.
- **provider 자체 sandbox와의 관계**: Codex는 Ask first와 Accept edits에서 명령을 자기 sandbox로 실행하고, Claude Code도 사람이 설정하면 자기 sandbox를 쓴다. 바깥에 Doan의 정책이 있을 때 안쪽 sandbox가 동작하는지는 모른다(P2의 핵심 질문). 동작하지 않는 provider가 있으면 §8 P2의 대안으로 간다.

### 3.2 Antigravity가 실제 상태를 바꾸지 않게 한다

P1의 결과에 따라 아래 중 하나를 고른다. 순서는 선호 순이다.

1. **설정으로 옮긴다.** pinned 서버(1.3.0)나 language server가 받는 환경 변수·인수 중 `antigravity-cli` 디렉터리와 자격 증명 저장소를 profile 안으로 옮기는 것이 있으면, `providers.ts`의 Antigravity `env`나 `environment.ts`에 더한다. `AGY_ACP_FORCE_FILE_STORAGE`처럼 문서화되지 않은 변수라면 ARCHITECTURE §7 'Antigravity server'의 기존 예외 목록에 더한다.
2. **fence로 막는다.** 옮길 방법이 없으면 Antigravity 프로세스의 정책에 `<real HOME>/.gemini/antigravity-cli/` 쓰기 금지를 더한다. Keychain 항목을 바꾼 것이 language server라면 Keychain 접근도 막는다(Seatbelt에서 막을 단위는 P1에서 정한다). 이때 Antigravity 서버를 띄우는 모든 곳(로그인·상태 확인·로그아웃·대화)에 fence를 붙인다. 막았을 때 로그인, 대화, 로그아웃이 그대로 되는 것이 조건이다.
3. **둘 다 안 되면** P1 결과에 따라 나눈다(결정 Q6).
   - 사람의 `agy` 로그인을 바꾸면: Antigravity의 로그인과 새 대화를 막고 Settings > Agents에 이유를 보인다. 새 문구가 생기므로 `/design-draft`와 Doan의 `clarify` preset이 필요하다(tasks T2a).
   - 로그·설정 파일 쓰기뿐이면: ARCHITECTURE §7 'Known limits'에 적고 Antigravity를 그대로 둔다.
   - 고르지 않은 것: 어느 경우든 문서화만 하기. "never changes external credentials" 결정과 충돌한다.

### 3.3 Antigravity가 자기 profile 안에서 일한 것

- P3로 원인을 분류한다.
  - (i) agent가 `HOME`이 profile이라 `~/.gemini/antigravity-cli/skills`를 자기 skill 경로로 보고 그곳에서 일했다.
  - (ii) 서버가 도구 실행에 `session/new`의 `cwd`를 쓰지 않는다.
- (i)이면: 다른 provider로 넘어가지 않으므로 경계 문제는 아니다. 그래도 Antigravity의 정책에 자기 profile의 skill 경로(`<GEMINI_HOME>/config/skills`, `<GEMINI_HOME>/antigravity-cli/skills`) 쓰기 금지를 더한다(결정 Q3). stub은 Doan이 프로세스를 띄우기 전에 쓰므로 서버가 쓸 필요가 없다(P3에서 확인). 그러면 agent가 Doan의 stub을 바꾸거나 skill을 더해 다음 대화에 영향을 주는 일도 막힌다. P3에서 서버가 그 경로에 써야 한다고 밝혀지면 그 경로는 열어 두고 T2에서 보고한다.
- (ii)이면: 서버 동작이므로 Doan이 고칠 수 없다. 사실을 ARCHITECTURE §7 'Known limits'에 적고, Ask first에서 permission card가 `Cwd`를 보여 주는지는 BACKLOG에 남긴다.

### 3.4 `stop_required` 뒤 종료

- 결정(Q4): **동작을 바꾸지 않는다.** 답하지 않은 확인 대화상자는 로그아웃을 확인하지 않은 것이다. 종료는 그것을 취소로 다루고, 다음 실행에서 연결이 그대로 보이므로 사람이 다시 로그아웃할 수 있다. 어긋나는 상태(연결은 없는데 자격 증명이 남음)는 생기지 않는다.
- 고아 Keychain 항목은 userData를 지울 때 생기며 `stop_required`와 관계없다. ARCHITECTURE §7 'Known limits'에 "Claude Code·Codex 연결의 Keychain 항목은 profile 경로로 열쇠가 정해지고 userData를 지워도 남는다. 지우려면 먼저 로그아웃한다"를 적는다.
- 고르지 않은 것: 종료 때 로그아웃을 끝내기(사람이 확인하지 않은 로그아웃을 실행한다), 보류를 기록해 다음 실행에서 묻기(새 상태와 문구가 생긴다).

## 4. 순수 함수로 뺄 것 (`/tdd` 대상)

- `fencePolicy(provider, extra)` → 정책 문장(SBPL). 같은 입력이면 같은 문장이다. 경로는 들어가지 않고 매개변수 이름만 들어간다.
  - 테스트: 다섯 provider의 정책 스냅숏. Antigravity에만 `agent-runtimes` 실행 허용과 §3.2·§3.3의 추가 금지가 있다. browser-hook 허용은 Claude와 Antigravity에만 있다.
- `fenceArgs({ userData, profileDir, realHome, ... })` → `sandbox-exec` 인수 목록 또는 거절 코드.
  - 테스트: 상대 경로, NUL, 줄바꿈 → 거절. profile이 userData 밖 → 거절. staging profile(`codex-<id>`)도 자기 디렉터리만 연다. 다른 provider의 profile 경로는 어떤 매개변수에도 나오지 않는다.
- `fencedCommand(command, args, fence)` → `{ command: "/usr/bin/sandbox-exec", args: [...] }`. 세 spawn 지점이 같은 함수를 쓴다.
  - 테스트: 원래 인수 순서가 보존된다. fence 없음(legacy external)이면 그대로 돌려준다.
- (P1 경로 1이면) Antigravity 환경 변수 추가는 `providerEnv`의 기존 테스트(`environment.test.ts`)에 사례를 더한다. 새 변수는 `RESERVED`에 넣어 extra로 덮을 수 없게 한다.

## 5. 형식 변경

없다. JSON Schema, `runtime.json`, app socket 메시지, CLI 응답, 대화 index와 event 형식이 그대로다. 실패 코드도 기존 시작 실패를 쓴다(결정 Q5).

## 6. Conventions 영향

없다. ARCHITECTURE §1과 `doan check` 규칙을 바꾸지 않는다.

## 7. 결정 영향

- **ARCHITECTURE §7 "The app does not sandbox the agent or promise that repository settings/hooks cannot execute code."** 이번 fence는 Doan userData의 경로만 막으므로 이 문장을 좁혀 고친다. 예: "Doan fences only its own userData from Doan-connection runs; it does not otherwise sandbox the agent…". 사용자가 승인했다(결정 Q1). 고치는 것은 T7 승격 때다.
- **PRODUCT §3 'Resume and permissions'** "Ask first applies the user's own permission and sandbox settings": P2가 provider 자체 sandbox가 Doan의 정책 안에서도 동작함을 보여야 유지된다. 동작하지 않으면 이 문장과 충돌하므로 §8 P2의 대안으로 간다.
- **ARCHITECTURE §7 'Agent authentication' "it never reads, copies or changes those external credentials"**: §3.2가 이 결정을 지키려는 작업이다. 지킬 방법이 없으면 결정 Q6에 따라 사람의 `agy` 로그인을 바꾸는 경우 Antigravity를 막는다.
- **ARCHITECTURE §7 'Antigravity server'(승인된 예외)**: 경로 1이 문서화되지 않은 변수를 더하면 이 예외 목록이 늘어난다.
- serving scope, sandbox iframe, GitHub token 예외, git 명령 제한은 건드리지 않는다.

## 8. PoC 의존

모든 PoC는 `.scratch/provider-profile-isolation/`에서 하고, 실제 상태는 `app/runtime/real-state.ts` fingerprint로 전후를 비교한다. 실제 로그인이 필요한 PoC는 사용자가 브라우저에서 승인하고, 끝난 뒤 로그아웃하고 profile을 지운다. 실제 Keychain 항목은 속성(서비스, 계정, 수정 시각)만 읽고 비밀 값은 읽지 않는다.

- **P1. Antigravity의 실제 상태 쓰기 (§3.2)**
  - 질문: 실제 `~/.gemini/antigravity-cli/`에 쓰는 프로세스와 Keychain 항목 `gemini | antigravity`를 바꾸는 프로세스는 무엇인가(ACP 서버인가, language server인가). home을 어떻게 찾는가(`HOME`, `GEMINI_HOME`, 아니면 사용자 DB). 경로와 자격 증명 저장소를 옮기는 변수나 인수가 있는가.
  - 방법: 먼저 pinned 1.3.0 archive를 풀어 소스를 읽는다(실행 없음, POSTMORTEM 2026-11-07이 `resolve_skills_paths`를 찾은 방법). 다음으로 격리 HOME(Keychains 링크 없음)에서 상태 확인만 돌리고 fingerprint를 비교한다. 마지막으로 사용자 승인 아래 실제 로그인과 한 턴을 돌린다.
  - 통과: 경로 1이 실제 상태 쓰기를 0으로 만든다. 실패: 경로 2를 P2와 함께 시험한다. 둘 다 실패: 결정 Q6에 따라 나눈다. 그래서 P1은 사람의 `agy` 로그인이 바뀌는지도 확인한다(Keychain 항목 속성과 `agy`의 로그인 상태를 전후로 본다. 비밀 값은 읽지 않는다).
- **P2. Seatbelt fence의 실현 가능성 (§3.1)**
  - 질문:
    - (a) `sandbox-exec`가 이 macOS에서 동작하는가. `-D` 매개변수와 "기본 허용 + 금지 + 다시 허용"의 규칙 순서가 의도대로 평가되는가.
    - (b) 다섯 provider가 정책 안에서 로그인 유지, 새 대화, resume, permission 요청, Stop을 그대로 하는가.
    - (c) Codex의 자체 sandbox(Ask first, Accept edits)와 사람이 켠 Claude Code sandbox가 정책 안에서 동작하는가(중첩).
    - (d) agent의 `cat <다른 profile 파일>`과 파일 읽기 도구가 실패하는가. Full access에서도 실패하는가.
    - (e) `doan work update`·`doan handoff`, 첨부 이미지, MCP connectors, turn-end 사용량 읽기가 되는가.
  - 대안(provider별로 실패하면):
    - (가) 그 provider만 provider 자체 설정으로 막는다. 예: Claude의 profile `settings.json`에 `permissions.deny` 읽기 규칙. 다만 shell 명령은 막지 못할 수 있다.
    - (나) 그 provider만 한계로 문서화한다.
    - (다) 그 provider의 자체 sandbox를 끄고 Doan 정책만 쓴다. PRODUCT §3 'Resume and permissions'를 바꾸므로 결정이 필요하다.
  - **확인 필요**: 어느 대안으로 갈지는 실패한 provider와 원인을 보고 T2에서 사용자에게 묻는다. 그때 추천을 하나 붙인다.
- **P3. Antigravity의 profile 안 작업 (§3.3)**
  - 질문: 2026-11-05의 쓰기와 `ls`가 (i)인가 (ii)인가. Doan이 쓴 stub 말고 서버가 skill 경로에 쓰는 것이 있는가.
  - 방법: P1의 archive 읽기에서 system prompt와 skill 경로 안내를 찾는다. 실제 턴에서 ACP frame(permission 요청의 `TargetFile`·`Cwd`)을 기록한다. 실제 턴은 P1의 로그인을 다시 쓴다.

## 9. POSTMORTEM에서 가져온 함정

- **2026-11-07 — Antigravity conversations ran without the doan skill stub**: "the stub path was confirmed once by a live check … and recorded only as a code comment", 그리고 "a missing skill does not fail". → fence가 stub이나 skill 경로를 막으면 실패 없이 skill 없이 돈다. P2(b)와 runtime-test에서 실제 턴에 `doan`이 skill 목록에 있는지 묻는다.
- **2026-10-30 — Packaged-app probes failed for reasons of their own: keychain, signature identity and focus**: "an isolated `HOME` has no `~/Library/Keychains`, so `codex` (keyring store) and Electron `safeStorage` find no default keychain." 그리고 실제 로그인 probe는 "link `<temp HOME>/Library/Keychains` to the real folder (approved real-state change; delete the provider's keyring item … afterwards and verify)". → P1·P2의 실제 로그인은 이 절차를 따른다. 링크한 동안의 Antigravity 실행이 바로 BACKLOG의 Keychain 변경을 만든 조건이므로, P1은 Keychain 항목 수정 시각을 전후로 기록한다.
- **2026-11-01 — A failed Antigravity sign-in left no evidence of why**: "Never log a provider's message text, even filtered", 그리고 서버가 "deletes `acp_token.json` itself". → fence 거절로 실패한 시작은 Doan의 분류만 로그에 남긴다. 토큰이 사라지면 Doan의 scrub를 의심하기 전에 서버 소스를 읽는다.
- **2026-10-30 — A model list read made sign-out ask to stop conversations**: "a lease says its use … A new kind of lease … must pick its use." → fence는 lease 종류(`run`)로 붙일지 정한다. 새 lease 종류를 만들지 않는다.

## 10. 결정 요약

| # | 질문 | 결정 | 위치 |
|---|---|---|---|
| Q1 | 보호 범위 | Doan 연결 대화 agent로부터 Doan userData만 막는다. 승격 때 ARCHITECTURE §7 "does not sandbox the agent"를 좁힌다 | spec '보호 범위', design §7 |
| Q2 | fence를 붙일 프로세스 | 대화 run만. P1이 §3.2 경로 2면 Antigravity 서버를 띄우는 모든 곳 | spec Non-goals, design §3.1 |
| Q3 | Antigravity 자기 skill 경로 쓰기 | P3가 agent 동작((i))이면 막는다 | design §3.3 |
| Q4 | `stop_required` 뒤 종료 | 동작 그대로, 한계를 문서화 | spec 완료 조건 6, design §3.4 |
| Q5 | fence를 세울 수 없을 때 | fail closed, 기존 시작 실패, 새 문구 없음 | spec 완료 조건 4, design §3.1 |
| Q6 | Antigravity 실제 상태 쓰기를 막을 방법이 없을 때 | P1 결과로 나눈다: 사람의 `agy` 로그인을 바꾸면 Antigravity의 로그인과 새 대화를 막고, 로그·설정 파일 쓰기뿐이면 'Known limits'에 적는다 | spec 완료 조건 1, design §3.2 |

남은 확인 필요: P2에서 실패한 provider의 처리(§8 P2의 (가)·(나)·(다)). T2에서 묻는다.
