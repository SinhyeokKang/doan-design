# provider-profile-isolation — tasks

순서: 로그인 없는 PoC → 로그인 PoC → 결정 확인 → 순수 함수 → shell(프로세스 띄우기) → 실제 앱 확인 → 리뷰 → 승격.

결정된 범위에는 새 화면과 문구가 없어 `/design-draft` 단계가 없다. P1이 경로 1로 통과해 결정 Q6의 막는 분기와 그 화면(T2a)은 없다.

PoC와 측정 작업(P0, T0, T1, T5의 측정)은 AGENTS.md 'Commands'에 없는 도구도 쓸 수 있다. 스크립트와 evidence는 `.scratch/provider-profile-isolation/`에 둔다. 결과(통과/실패, 측정값, 날짜, CLI 버전)는 design.md §8에 적는다. `.scratch/`는 commit되지 않기 때문이다. 실제 로그인은 그때마다 사용자 승인을 받는다.

공통 절차는 design.md §8 '공통 절차'를 따른다. 요약하면 다음과 같다.

- 앱을 띄울 때는 AGENTS.md의 dev 명령 형태를 쓴다(`DOAN_CLI`, `--user-data-dir=<tmp>`, 임시 `HOME`, 가짜 `SHELL`, `CLAUDE_CONFIG_DIR`·`CODEX_HOME`은 지우거나 덮기).
- 실제 상태 비교는 스크립트 전체를 감싼다. 비교 대상은 `app/runtime/real-state.ts` fingerprint와 `~/.gemini/antigravity-cli/`의 재귀 목록(상대 경로, 크기, 수정 시각; 내용은 읽지 않음)이다.
- Keychain은 실행 전 속성을 기록하고, 이번 실행이 만든 항목만 지운다(`<App> Safe Storage` 포함). 원래 있던 `gemini | antigravity`는 지우지 않고, 수정 시각이 바뀌면 보고한다.

## P0. 중첩 Seatbelt (로그인 없음)

- design §8 P0의 세 명령을 돌린다. 바깥 정책 안의 `sandbox-exec`, 바깥 정책 안의 `codex sandbox macos -- /usr/bin/true`, 같은 조건의 Claude Code sandbox다.
- 검증: `.scratch/provider-profile-isolation/`의 일회성 스크립트. 셋 모두 종료 코드 0이면 T0로 간다. 하나라도 실패하면 T0 전에 T2의 'P0 실패' 분기로 사용자에게 방향을 묻는다.
- 결과는 design.md §8 P0에 적는다(T0 commit에 함께 넣는다).

## T0. PoC P1·P3 — Antigravity의 실제 상태 쓰기와 profile 안 작업

- pinned 1.3.0 archive를 `.scratch/provider-profile-isolation/`에 풀어 읽는다(실행 없음). 찾을 것:
  - `antigravity-cli` 디렉터리와 Keychain 항목을 쓰는 코드와 그 프로세스(ACP 서버, language server).
  - home을 찾는 방법.
  - 경로나 저장소를 바꾸는 변수와 인수.
  - agent에게 skill 경로를 알려 주는 문장.
- 격리 HOME(Keychains 링크 없음)에서 Antigravity 상태 확인만 돌리고 실제 상태를 전후로 비교한다.
- 사용자 승인 아래 Keychains를 링크하고 실제 로그인을 한다. 승인을 받을 때 "사람의 `agy` 로그인이 초기화될 수 있다"고 알린다. 대화 한 턴을 돌리며 ACP frame을 기록하고, 로그아웃한다. Keychain 항목 `gemini | antigravity`는 속성만 전후로 기록한다.
- 사람의 `agy` 로그인이 바뀌는지도 전후로 확인한다(결정 Q6의 분기 근거).
- 끝나면 로그아웃하고 profile을 지운다. Keychain은 공통 절차대로 정리하고 실제 상태로 확인한다.
- 검증: `.scratch/provider-profile-isolation/`의 일회성 스크립트. 결과가 design.md §8 P1·P3에 있고 §3.2의 경로(1·2·3)와 §3.3의 분류((i)·(ii))가 정해진다.
- **사용자 승인 필요**(그때): 실제 로그인, 실제 Keychain을 건드리는 링크.
- **commit 경계**: `docs(feature): provider-profile-isolation PoC P0, P1 and P3 results`

## T1. PoC P2 — Seatbelt fence

- 손으로 쓴 정책(design §3.1)을 `sandbox-exec -p`와 `-D`로 넘겨 다섯 provider의 run을 띄운다. 띄우는 방법은 앱과 같은 명령과 환경이다(dev 앱을 고친 `.scratch` 사본이나 별도 스크립트).
- design §8 P2의 (a)–(h)를 확인한다.
  - provider마다 Ask first와 Full access에서 본다. Codex는 Accept edits에서도 본다.
  - 다섯 provider 모두 실제 턴에서 `doan`이 skill 목록에 있는지 묻는다(POSTMORTEM 2026-11-07).
  - Keychain 쓰기는 임시 keychain(`security create-keychain`)으로 본다.
  - 각 provider의 CLI 버전을 기록하고 현재 minimum(ARCHITECTURE §7 'Versions')에서도 확인한다.
- 미끼(design §8 P2): 다른 provider의 profile(staging `codex-<id>` 포함), `conversations/`, `agent-auth/`의 vault·metadata, 다른 대화의 첨부, `runtime.json`. 읽기(`cat`, 파일 읽기 도구)와 쓰기를 둘 다 시도한다. `runtime.json`은 읽기가 되고 쓰기가 실패해야 한다. 실제 다른 provider의 대화 기록은 쓰지 않는다.
- 통과한 정책 문장 전체를 design.md §8 P2에 적는다.
- 검증: `.scratch/provider-profile-isolation/`의 일회성 스크립트. 결과가 design.md §8 P2에 provider × 모드 표로 있다.
- **사용자 승인 필요**(그때): 다섯 provider의 실제 로그인(T0의 Antigravity profile을 다시 쓴다).
- **commit 경계**: `docs(feature): provider-profile-isolation PoC P2 results`

## T2. 결정 확인

- PoC 결과를 결정에 적용했다. §3.2는 경로 1(환경 변경 없음), §3.3은 (i)(Antigravity skill 경로 쓰기 금지)다. P0 실패 방향과 Claude·Codex의 막는 방법은 사용자가 정했다(orch.md '결정 기록').
- spec·design·tasks를 그 결정대로 고쳤다. PRODUCT·ARCHITECTURE는 T7에서 고친다.
- 검증: design.md §10에 '남은 확인 필요'가 없고 결정 행이 있다. §3.1 표에 provider별 방법이, §3.2·§3.3에 고른 경로가 있다.
- **commit 경계**: `docs(feature): provider-profile-isolation decisions`

## T3. 순수 함수

- design §4의 함수 전부: `fencePolicy`, `fenceArgs`, `resolveFencePaths`, `fencedCommand`, `claudeSandboxEnabled`, `claudeFenceSettings`, `codexProfileArgs`, `codexTurnPermission`, `runMechanism`·`codexRestart`, `Prepared.fence`를 채우는 규칙, fail closed의 분류. Antigravity 환경은 바꾸지 않는다(§3.2 경로 1).
- 테스트: design §4의 사례 전부. 정책 스냅숏은 design.md §8 P2에 적은 통과 정책 문장과 바이트까지 같아야 한다. Claude 설정과 Codex `-c` 인수는 §8 P2 (c)에서 통과한 모양과 같아야 한다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과.
- **commit 경계**: `test:` commit(테스트), 그 다음 `feat(app): fence policy for Doan-connection runs`

## T4. shell — run을 막는 방법 안에서 띄운다

- `conversation/prepare.ts`가 `use === "run"`일 때만 `Prepared.fence`를 채운다. main이 `realpath`로 푼 userData, profile, 이번 턴의 붙여넣은 이미지 디렉터리를 넣는다. 경로를 풀 수 없으면 lease를 놓고 `unknown`으로 거절한다. Codex는 `<userData>/attachments`가 없으면 만든다(0700).
- ACP 서버(`acpRunner.ts`): `Prepared.fence`가 있으면 네 모드 모두 `fencedCommand`로 띄운다.
- Claude(`runners.ts` `openClaude`): `Prepared.fence`가 있으면 띄우기 전에 sandbox 상태를 읽는다. 꺼짐이면 `spawnClaudeCodeProcess`를 `fencedCommand`로 감싸고, 켜짐이면 SDK `settings`에 `claudeFenceSettings`를 합친다.
- Codex(`runners.ts` `openCodex`): `Prepared.fence`가 있으면 Full access server는 `fencedCommand`로, 다른 모드 server는 `codexProfileArgs`를 더해 띄운다. 턴 인수는 `codexTurnPermission`이다. `service.ts` `submit`은 살아 있는 server의 방법과 이번 send의 방법이 다르면(`codexRestart`) 그 server를 닫고 새 server로 `thread/resume`한다.
- 모델 목록과 legacy external run은 그대로다.
- fail closed: 띄우기 전 거절은 `unknown`, `sandbox-exec`가 없거나 바로 끝나면 `process_exited`. `cli_missing`은 쓰지 않는다(결정 Q5).
- 링크 1이 넣은 `account_changed`·`sign_in_changed` 판정(`prepare.ts`)과 `releaseFailed`·`TransportState.running`(`service.ts`·`runners.ts`)은 그대로 둔다.
- 테스트(`runners.test.ts`, `acpRunner.test.ts`, `prepare.test.ts`, `service.test.ts`):
  - `Prepared.fence`가 있는 ACP run은 `/usr/bin/sandbox-exec`로 시작한다. 없으면(legacy external, 모델 목록) 지금과 같다.
  - Claude: sandbox 꺼짐 → 감싼 spawn, 켜짐 → 감싸지 않은 spawn과 `settings`의 Doan 설정.
  - Codex: Full access → 감싼 spawn과 `dangerFullAccess`, 다른 모드 → `-c` profile 인수와 `permissions`(턴에 `sandboxPolicy` 없음). 모드 전환 send는 server를 다시 띄우고 `thread/resume`한다.
  - fence 경로가 거절되면 프로세스를 띄우지 않고 실패한다.
- 검증: `npm --prefix app test` 통과, `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: `feat(app): run Doan-connection agents inside the userData fence`

## T5. 실제 앱 확인

- `/runtime-test`로 격리된 dev 앱에서 바뀐 동작만 짧게 확인한다.
  - 다섯 provider: 미끼 읽기·쓰기 실패, `doan work update`, `doan open`, 첨부 이미지, resume, Stop, 종료 정리, 실제 턴에서 `doan` skill이 목록에 있음.
  - Cursor: P2에서 보지 못한 도구 호출을 다시 시도한다. 그래도 "Upgrade your plan"이면 미검증으로 남긴다.
  - Claude: sandbox 꺼짐(바깥 fence)과 켜짐(flag 설정) 각각 한 턴. 켜짐에서 사람의 sandbox 명령이 돌고 미끼가 막힌다.
  - Codex: Ask first(profile)에서 자체 sandbox 명령과 `doan handoff`의 두 번 승인, Accept edits(`doan-workspace`)의 네트워크와 쓰기 경로가 지금과 같은지, Full access로 바꾼 send와 다시 돌아온 send가 같은 thread를 이어 가는지.
  - MCP connectors, Claude 다음 메시지 제안, turn-end 사용량 읽기.
  - legacy external resume 하나(fence가 붙지 않음).
  - Antigravity(격리 HOME): 로그인·연결 확인·한 턴·로그아웃 전후의 실제 상태와 Keychain 항목 속성.
  - Antigravity(실제 HOME, 결정 C): 그때 사용자 승인을 받아 실제 HOME으로 같은 일을 하고 `~/.gemini/antigravity-cli/`의 재귀 목록을 전후로 비교한다.
- T1 evidence는 T3 스냅숏의 정책 문장, argv, Claude 설정, Codex `-c` 인수가 PoC와 같을 때만 다시 쓴다.
- 검증: `/runtime-test` 보고서와 스크린샷, 실제 상태 전후 비교가 같다.
- **사용자 승인 필요**(그때): 실제 로그인, 실제 HOME 실행.
- commit 없음(evidence는 `.scratch/`, 결과는 T7의 commit 메시지에 적는다).

## T6. 리뷰와 postmortem

- `/code-review`, `/refactor`.
- `/postmortem`은 반드시 한다. Antigravity의 Keychain 변경과 profile 사이 읽기를 POSTMORTEM에 적는다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: refactor가 있으면 `refactor(app): …`, 그리고 `docs(POSTMORTEM): …`

## T7. 승격과 정리

- `docs/ARCHITECTURE.md`(영어):
  - §7 'Agent conversation runtime and IPC'의 "The app does not sandbox the agent…"를 "Doan userData만 Doan 연결 대화 run에서 막는다"로 좁혀 고친다(결정 Q1).
  - §7 'Agent authentication'의 'Profiles'에 fence를 적는다. 막는 경로, 다시 여는 경로(Codex 첨부 전체 포함), provider·모드별 방법(design §3.1 표: 바깥 fence, Claude flag 설정, Codex permission profile), Codex 모드 전환 때 app-server 재시작, 붙는 프로세스(`Prepared.fence`, `use === "run"`), fail closed와 실패 코드, Antigravity skill 경로 쓰기 금지다.
  - §7 'Permission modes'의 Codex 줄을 profile 방식으로 고친다(design §7).
  - 'Known limits'를 고친다:
    - 같은 uid의 다른 프로세스는 userData를 읽는다.
    - Codex run은 첨부 디렉터리 전체를 연다(결정 A).
    - fence 안의 `doan check`는 `sessions.jsonl`에 쓰지 못한다(결정 B).
    - 모델 목록 읽기는 fence 밖에서 저장소 설정으로 돌아, 저장소 hook이 그때 실행될 수 있다.
    - fence는 run 안의 직접 접근만 막는다. agent가 남긴 설정(`~/.zshrc`, 저장소 `.claude/settings.json` hook, `.mcp.json` 등)은 나중에 fence 밖에서 실행될 수 있다.
    - `sandbox-exec`는 DEPRECATED이고, 없어지면 바깥 fence를 쓰는 Doan 연결 run이 시작하지 못한다.
    - userData를 지워도 Claude·Codex Keychain 항목이 남는다. MCP connector token과 `doan Safe Storage`도 확인한 결과대로 같은 줄에 적는다.
    - 답하지 않은 `stop_required` 확인은 종료로 취소되고 연결이 남는다(결정 Q4).
    - Claude: Doan이 읽지 않는 managed 출처가 sandbox를 바꾸면 판정이 틀린다(켜짐을 꺼짐으로 읽으면 Bash가 71로 실패, 반대면 `permissions.deny`만 남는다). sandbox가 켜진 턴은 sandbox 밖 실행이 꺼지고, Read 도구가 자기 profile 파일과 붙여넣은 이미지를 읽지 못한다.
    - Codex: 사람이 승인한 `apply_patch`는 막힌 경로에 쓴다. permission profile은 experimental API다. Ask first의 sandbox는 Doan의 읽기 전용 profile이고, Doan의 Codex profile `config.toml`에 사람이 적은 `sandbox_mode`나 `default_permissions`는 쓰이지 않는다.
    - Antigravity: 한 턴 기준으로 실제 home과 Keychain에 쓰지 않았다(language server의 `go-keyring`·`os/user.Current` 용도는 정적으로 배제하지 못했다).
    - Antigravity harness의 도구 명령은 자기 process group에 있어 Stop 뒤에도 남는다(fence와 무관한 기존 동작, BACKLOG로 옮길 수도 있다).
- `docs/PRODUCT.md`(영어, 결정 D):
  - §3 'Resume and permissions'(또는 'Agent conversation foundation contract')에 "an agent in a Doan-connected conversation cannot read or write Doan userData outside its own profile in any permission mode, Full access included; blocked reads show as tool failures"를 적는다.
  - 'Resume and permissions'에 좁아진 두 가지를 적는다: sandbox가 켜진 Claude 턴의 sandbox 밖 실행이 꺼지고, Codex의 Ask first sandbox는 Doan의 읽기 전용 profile이다(design §7).
- `docs/DESIGN.md`: 손대지 않는다(화면 변경 없음).
- `docs/BACKLOG.md`: 네 줄을 지우고, 남은 것만 새 줄로 적는다. Antigravity 줄의 "tool-fact check" 표현은 고친다(`facts.ts`는 Antigravity에서 프로세스를 띄우지 않는다).
- `docs/DIRECTORY.md`: 새 디렉터리가 없으면 손대지 않는다.
- `docs/features/provider-profile-isolation/`를 지운다.
- 검증:
  - `grep -rn "provider-profile-isolation" docs app/src cli`가 비어 있다.
  - `grep -nE '결정 Q[1-6]|\bQ[1-6]\b|\bP[0-3]\b|\bT[0-7]a?\b' docs/ARCHITECTURE.md docs/PRODUCT.md docs/BACKLOG.md`에 이 feature의 결정·PoC·task 번호가 나오지 않는다.
- **commit 경계**: 문서마다 하나씩 — `docs(ARCHITECTURE): fence Doan-connection runs from other profiles`, `docs(PRODUCT): Doan-connected agents cannot reach other profiles`, `docs(BACKLOG): profile isolation defects settled`, 마지막에 `docs(feature): remove provider-profile-isolation`.
