# agent-auth orchestration

시작: 2026-10-28. 기준 문서: [spec](./spec.md), [design](./design.md), [tasks](./tasks.md), [PoC](./poc.md).
시작 커밋: `e8e80afb7583073311239d8b607bbe5bee5f68f2`.
통합 브랜치: `feat-agent-auth` (main에서 분기).

## 결정 기록

- 사용자 결정(2026-10-28): 실제 인증 검증은 마지막에 몰지 않고 플랫폼마다 바로 한다. 공급자의 로그인·실행을 붙인 배치가 그 플랫폼의 실인증 확인까지 진행한다. 브라우저 로그인처럼 사용자가 해야 하는 단계는 작업자가 conductor에게 escalation으로 요청하고, conductor가 사용자에게 전달한다. 최소 인증 PoC는 완료됐으며 추가로 필요한 실험은 사용자에게 요청한다.
- 사용자 결정(2026-10-28): 설치된 Claude Code 2.1.312에 맞춰 B2에서 지원 버전을 올린다. 대응 SDK 버전은 공식 문서·패키지로 확인해 고정하고 기존 외부 세션 경로 회귀를 검증한다. 현재 지원 계약은 Claude Code 2.1.310·SDK 0.3.310이다(ARCHITECTURE §5 'Transport and environment').
- conductor's call — 설치된 Codex는 0.163.0이고 PoC의 keyring 강제 경로는 0.164.0에서만 확인했다. B1·B2는 0.163.0에서 같은 저장 분리가 되는지 먼저 확인하고, 안 되면 버전 상향을 사용자 결정으로 올린다. 근거: design '0.163.0→새 버전은 별도 실행 회귀 검증 필요'.
- conductor's call — cursor-agent·agy·copilot은 현재 PATH에 없다. CLI 자동 설치는 비목표(spec)이므로 해당 플랫폼 검증 전에 작업자가 필요한 공식 설치를 사용자에게 요청한다.
- conductor's call — 실인증 probe는 하나의 격리 userData·HOME을 배치 사이에 유지해 플랫폼마다 로그인을 한 번만 요청한다. 외부 인증 저장소는 메타데이터 전후 대조만 한다(design '저장과 실행 환경').
- 사용자 결정(2026-10-28, R-A): 안정된 계정 ID가 없는 연결도 새 실행은 허용한다. 재개는 `account_unverifiable`로 거부하고, 표시 계정은 확인 결과로 갱신한다.
- 사용자 결정(2026-10-28, R-A): 대화 index v2 이행은 되돌릴 수 없으며 이를 수용한다. 검증은 격리한 userData로만 하고, 실제 userData로 실행하기 전에 사용자에게 다시 알린다.
- 사용자 결정(2026-10-28, B1 이후): Antigravity는 B3에서 Orca 방식으로 구현한다. Google이 호스팅하는 `agy_acp_server`를 sha로 고정해 다운로드하고, 전용 `GEMINI_HOME`과 `AGY_ACP_FORCE_FILE_STORAGE=1`로 실행한다. spec 비목표인 'CLI 자동 설치·번들링'의 예외와 문서화되지 않은 저장 스위치 사용을 사용자가 승인했다. 근거: `.scratch/agent-auth-orch/orca-antigravity.md`, B1 조사. Antigravity 로그인·보관도 이 ACP 경로로 B3가 맡는다. PRODUCT §7에 기록했다.
- 사용자 결정(2026-10-28, R-B1): Copilot 상태 확인은 요청 1회를 소비하므로 자동 폴링하지 않는다. 사용자 동작이나 첫 실행 직전에만 확인하고, lease로 실행한 첫 요청이 성공하면 그것을 검증으로 인정한다. B3가 구현한다.
- 사용자 결정(2026-10-28, R-B1): Copilot CLI 공식 OAuth 앱의 넓은 scope(`repo`, `gist`, `codespace` 등)를 수용한다. 'doan은 GitHub 토큰을 다루지 않는다' 원칙의 예외로, 이 토큰은 Copilot 에이전트 인증에만 쓴다. D3에서 ARCHITECTURE에 scope와 함께 기록한다. PRODUCT §7에 기록했다.
- 사용자 결정(2026-10-28, R-B1): 전용 HOME에서 실행하는 Cursor·Antigravity·Copilot에는 `SSH_AUTH_SOCK`과 실제 `~/.gitconfig`를 가리키는 `GIT_CONFIG_GLOBAL`만 넘긴다. `gh` 토큰은 넘기지 않는다. B3가 구현한다.
- 사용자 결정(2026-10-28, B2): 안정된 계정 ID가 없는 연결(현재 Codex)은 대화의 소유 연결(connectionId)이 현재 연결과 같고 대화를 묶은 뒤 재로그인이 없었으면 재개를 허용한다. 프로필·세션·점유 확인은 그대로 한다. 재로그인한 뒤에는 같은 계정이어도 재개를 거부한다. 문서화되지 않은 rateLimits accountId는 쓰지 않는다. A의 '계정 ID가 없으면 재개 거부' 규칙을 이렇게 완화하며, B2가 구현한다.
- 사용자 결정(2026-10-28, B2): 레포의 `.claude/settings.json`에 있는 `env.ANTHROPIC_API_KEY`나 apiKeyHelper가 doan 로그인보다 우선하는 문제를 확인했다. B2가 공식 강제 옵션을 먼저 조사한다. 없으면 settingSources를 유지하고 알려진 한계로 기록한다. project/local 설정은 빼지 않는다.
- 사용자 결정(2026-10-28, B2): legacy 외부 경로는 probe 전용 시뮬레이션 프로필(임시 CLAUDE_CONFIG_DIR·CODEX_HOME)에 별도로 로그인해 실요청까지 검증한다.
- 사용자 결정(2026-10-28, R-B3): 조직 UUID가 없는 Claude doan 연결은 실행하지 않고 재로그인을 안내한다(조직 고정 없이 실행하지 않는다).
- 사용자 결정(2026-10-28, R-B3): Antigravity 로그인 링크는 main만 다룬다. 서버가 사용자 브라우저를 직접 열지 못하게 한다.
- conductor's call — Claude Code conductor이므로 Claude 작업자만 쓴다. 모델 계열 교차는 없다.
- conductor's call — 공용 타입과 conversation 파일이 겹치므로 tasks의 기본 순서대로 직렬 진행한다. B3의 세 공급자도 사용자 구현 순서(Cursor → Antigravity → Copilot)대로 한 작업자가 직렬로 맡는다.
- conductor's call — 지휘자는 배치 코드를 수정하지 않는다. 리뷰 수정은 소유 배치로 돌린다. push와 PR은 통합 뒤 수행하며 merge하지 않는다.

## 배치와 소유권

| 배치 | task | 파일 소유권 | 선행 | 모델·effort / 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| P 인수 | P1–P3 | 없음(완료 근거) | 없음 | 지휘자 / 기존 PoC 결과 확인 | poc.md와 tasks 체크 대조 | 완료 |
| A 계약 | A1–A3 | 인증 공용 타입·순수 함수·fixture, `conversation/store.ts`와 index 이행 테스트 | P | Opus high / 상태 전이와 index v2 이행이 틀리면 대화 기록 손실 | `/tdd` red 확인, `npm --prefix app test`, typecheck, `go test ./...` | 대기 |
| B1 인증 저장 | B1 | main 인증 모듈·공급자 인증 adapter·테스트, `app/runtime/` 격리 지원 | A | Opus high / 암호화·평문 잔존 복구·시도 수명·외부 인증 격리 | 단위 테스트, `node --test 'app/runtime/*.test.ts'`, 플랫폼별 실로그인·보관·로그아웃 격리 | 대기 |
| B2 기본 실행 | B2 | `setupBroker.ts`, `conversation/{prepare,environment,runners,service,ownership}.ts`, Claude·Codex adapter·테스트, Claude SDK 버전 고정 | B1 | Opus high / 계정 소유권 재검사·버전 상향·외부 세션 회귀 | 단위 테스트, typecheck, Claude·Codex 실요청·권한·중단·재개 | 대기 |
| B3 추가 실행 | B3 | Cursor·Antigravity·Copilot adapter·테스트, conversation 실행 연결부, 필요한 의존성 manifest/lock | B2 | Opus high / 공식 프로토콜 확인과 권한·중단·재개 정규화 | protocol fixture, typecheck, 공급자마다 실요청·권한·중단·재개 | 대기 |
| B45 연결 해제·IPC | B4, B5 | main 인증·conversation 소유권, IPC·preload·공용 타입과 테스트 | B3 | Opus high / 로그아웃 경쟁과 sender 경계 | 단위 테스트, typecheck, 격리 preload 소비자 probe | 대기 |
| R 독립 리뷰 | D2의 배치 리뷰 | 보고서만 `.scratch/` | 각 배치 완료 | Opus high / 인증·경쟁 결함 탐지 | `/code-review`, handoff 대조 | 배치마다 |
| F 수정 라운드 | D2의 수정·postmortem | 해당 배치 소유 파일, 필요 시 POSTMORTEM.md | R | 원 배치와 같은 모델 / 원인 판단 | 재현→수정→관련 테스트, 재리뷰 | 필요 시 |
| D1 통합 확인 | D1 | `.scratch/` probe·근거 | B45 통합 | Opus high / 다섯 플랫폼 preload 경로·패키지 경계 | `/runtime-test`, `npm --prefix app run package` 격리 실행. 플랫폼별 확인 근거는 재사용 | 대기 |
| D2 최종 gate | D2 | 통합 커밋·orch.md | D1, R, F | 지휘자 / 통합 HEAD 근거 | `node .agents/skills/verify/scripts/verify.mjs`(eval 변경 시 `--eval`), 해당 시 `/agent-eval` | 대기 |
| D3 승격 | D3 | PRODUCT.md, ARCHITECTURE.md, DIRECTORY.md, 소비 feature 인계, 이 디렉터리 삭제 | D2 | 지휘자 / 검증 근거 승격 | 정본·코드 대조 | 대기 |

모든 체크박스 P1–P3·A1–A3·B1–B5·D1–D3을 위 표에 배정했다.

## 실행 순서와 충돌

A → B1 → B2 → B3 → B45 → D1 → D2 → D3 직렬이다. 각 배치는 `feat-agent-auth`를 base로 한 Orca child worktree에서 실행하고, 리뷰·통합 뒤 다음 배치를 시작한다. 실인증 단계는 한 번에 한 작업자만 진행한다.

플랫폼별 실인증 확인 위치:

| 플랫폼 | 로그인·보관·로그아웃 격리 | 실요청·권한·중단·재개 |
|---|---|---|
| Claude Code | B1 | B2 |
| Codex | B1 | B2 |
| Cursor | B1 | B3 |
| Antigravity | B1 | B3 |
| GitHub Copilot | B1 | B3 |

이 확인은 main 경로 probe로 한다. preload 소비자 경로와 패키지 경계는 B45 뒤 D1에서 다섯 플랫폼을 다시 확인한다. 작업자는 완료 시 커밋·명령 결과·미완료 항목을 `.scratch/handoff-<batch>.md`에 남기고 push·PR·feature 삭제를 하지 않는다.

## 진행 기록

Run: `run_d94775f7dd27`.

| 배치 | Dispatch | child worktree | 시작 증거 |
|---|---|---|---|
| A | `ctx_fd1125832411` (task `task_4509db5b9f36`) | `agent-auth-contract` (base `433147b`) | `turnStart: observed`, effective Claude opus high, liveness live |
| R-A | `ctx_b7521a360da0` (task `task_fa2ce58d23c0`) | `agent-auth-contract` 재사용(보고만) | `turnStart: observed`, effective Claude opus high |

- A: `6da6cb3`(red 테스트), `ba52d9a`(구현), `b295597`(tasks 체크). 작업자 보고: 테스트 3,415개·typecheck·`go test`·verify.mjs 통과. red 근거와 handoff는 `.scratch/agent-auth-orch/evidence-A/`에 복사했다. runtime-test는 UI·IPC 변경이 없어 하지 않았다. ARCHITECTURE의 index 설명과 DIRECTORY 갱신은 D3로 넘긴다. 작업자는 release를 완료했고 worktree는 R-A가 사용하므로 보존한다. 작업자가 사용자 확인 없이 정한 8개 항목은 R-A가 판정한다.
- R-A `ctx_b7521a360da0`: 🔴1(교체 sign-in 실패·취소 뒤 기존 연결이 verified로 남아 다른 계정으로 재개될 수 있음)·🟡1(ID 없는 계정의 표시값이 갱신되지 않음)·⚪6. index 이행·journal 순서·legacy 경로·환경 허용 목록은 문제가 없었다. 보고서는 `evidence-A/review-A.md`에 있다. R-A 작업자는 release했다.
- F-A: `ctx_0e0e22b0a9d0` (task `task_7f7f52fbaef1`). 같은 worktree에서 🔴1·🟡1·결정 7 계약·⚪3·⚪4를 수정한다. 실행 설정은 opus high이고 `turnStart: observed`를 확인했다. ⚪1·2·5·6은 B1·B2·B5 브리프로 넘긴다.
- F-A `9461d43`·`369e51f`: 지휘자가 state.ts diff를 확인했다. red 2건이 green으로 바뀌었고, 테스트 3,416개와 typecheck가 통과했다. A와 F-A를 `d41889b`·`e2d761b`·`386150e`·`34a9e08`·`fb6f244`로 통합했다. 통합 HEAD에서 verify.mjs가 PASS했다(verify-tests, runtime-support, go-test, go-vet, typecheck, app-test, build). 작업자 3명은 모두 release했다. `git cherry`에 `+` 항목이 없는 것을 확인한 뒤 Orca로 `agent-auth-contract`를 제거했고, 목록에서 빠진 것도 확인했다.
- B1: `ctx_2110a0120e31` (task `task_27f91699fedd`), child `agent-auth-storage` (base `fb6f244`). effective opus high, `turnStart: observed`. 실인증 probe 상태는 `.scratch/agent-auth-probe/` 하나를 쓴다. 로그인과 CLI 설치는 ask로 요청을 받아 사용자에게 전달한다.
- B1 완료(`de632a7`..`da1e235`, 13커밋). 작업자 보고 기준으로 테스트 3,474개, runtime 테스트 42개, typecheck, verify.mjs가 통과했다. 실인증 결과는 Claude·Codex 0.163.0·Cursor·Copilot 1.0.105가 통과했고, Antigravity는 `공식 경로 미확인`이다. 격리 HOME에서 Keychain 저장을 시도하자 macOS 대화상자가 떴고, Cancel하자 파일 저장으로 넘어가 끝까지 동작했다. probe 상태는 다섯 플랫폼 모두 로그아웃으로 끝났다. tasks의 B1 체크박스는 Antigravity 때문에 비워 둔다. B1 작업자는 사용자가 터미널에서 직접 대화했기 때문에 `user_takeover`로 retained 상태다. handoff는 `evidence-B1/`에 복사했다.
- R-B1: `ctx_72a7d748df68` (task `task_498b8884c79e`). `agent-auth-storage`에서 보고만 한다. 실행 설정은 opus high이고 `turnStart: observed`다.
- R-B1 `ctx_72a7d748df68`: 🔴1·🟡4·⚪8. 🔴1은 프로세스 생성 전에 들어온 취소·창 종료·앱 종료가 그 뒤 생성된 로그인 프로세스를 멈추지 못하는 문제다. 쓰기 잠금이 앱 전체에서 풀리지 않고, 앱 종료 뒤에도 고아 프로세스가 남는다. 🟡는 네 가지다: lease 해제와 로그아웃 경쟁으로 vault가 다시 생김, expect pty 자손이 소유 그룹을 벗어남, write-back 실패 시 갱신 토큰이 조용히 사라짐, tmp만 남았을 때 시작 복구가 vault를 비움. 보고서는 `evidence-B1/review-B1.md`에 있다. R-B1 작업자는 release했다.
- F-B1: `ctx_9f407d54dcef` (task `task_a59a1be71577`). 같은 worktree에서 🔴1, 🟡1·3·4, ⚪1·8, 간헐 실패 테스트를 맡는다. 🟡2는 B3에서 expect를 제거하면서 해소한다. ⚪6은 B4로 넘긴다. 실행 설정은 opus high이고 `turnStart: observed`다.
- F-B1 `ac144ac`: 지휘자가 manager.ts diff를 직접 확인했다. 확인한 수정은 다음과 같다. 시도별 중지 요청을 기록하고 spawn 전후에 검사한다. lease의 `runs`는 write-back이 끝난 뒤에 줄인다. write-back이 실패하면 `storage_failed`와 `verified=false`로 둔다. 복구는 본 파일이 있을 때만 흡수한다. red 13건이 green이 됐고 테스트 3,487개가 11회 통과했다. 리뷰 중 1회 실패한 테스트는 재현되지 않아 이름을 모른다.
- B1과 F-B1을 통합해 `f909ba8`까지 왔다(cherry-pick 14개). 통합 HEAD에서 verify.mjs가 PASS했다. B1 원 작업자는 user_takeover로 retained 상태여서 터미널이 남아 있다. 그래서 `agent-auth-storage` worktree도 보존한다.
- B2: `ctx_424587bcebb9` (task `task_8d482638b553`), child `agent-auth-runtime` (base `f909ba8`). effective opus high이고 `turnStart: observed`를 확인했다.
- B2 완료(`095510d`..`b3e9314`, 5커밋). 작업자 보고: 테스트 3,509개·runtime 42개·typecheck·verify.mjs 통과. 실검증은 Claude 2.1.312(SDK 0.3.312)와 Codex 0.163.0 모두 통과했다. 홈·Canvas 경로 캔버스 생성, 권한 허용·거절, 중단, 재시작 후 재개, legacy 시뮬레이션 프로필, 외부 저장소 불변을 확인했다. 실검증 중 Codex 로그인 셸이 사용자의 구버전 doan을 PATH 앞에 두는 문제를 찾아 `allow_login_shell=false`로 고쳤다. probe의 doan Claude·Codex 연결은 유지한다. 레포 `.claude/settings` 덮어쓰기는 공식 강제 옵션 조사가 아직 남았다. setupBroker는 변경하지 않았다. handoff·리뷰는 `evidence-B2/`에 있다.
- 지휘자가 ego-lite로 Codex legacy 시뮬레이션 로그인을 승인(ox501501@gmail.com, Personal)했으나 콜백 대기 프로세스가 이미 끝나 거부됐다. 이후 사용자가 로그인을 완료했다. 앞으로 로그인 승인은 지휘자가 ego-lite로 처리하고, 막힐 때만 사용자를 부른다(사용자 승인 2026-10-28).
- R-B2: `ctx_1891f438d406` (task `task_7bce7ad92ba3`). `agent-auth-runtime`에서 보고만 한다. 설정은 opus high, `turnStart: observed`.
- 지휘자가 B3 로그인을 앞당겨 했다(사용자 승인 2026-10-28). B2 probe(`agent-auth-runtime/.scratch/b2-probe`, 통합된 AuthManager 경로)로 Cursor와 Copilot에 로그인했고, 사용자가 Chrome에서 승인했다. 두 연결 모두 connected·verified 상태다(Cursor id `384452313`, Copilot `SinhyeokKang`). Antigravity는 B3에서 ACP 경로를 구현한 뒤 로그인한다.
- R-B2 `ctx_1891f438d406`: 🔴0·🟡3·⚪6. 🟡1은 B5의 오류 코드 매핑 문제로 B5 브리프에 넣는다. 🟡2는 레포 설정이 Claude 로그인을 덮어쓰는 문제로, 공식 강제 옵션 조사를 B3에 포함했다. 🟡3은 doan 실행 기록이 다른 재개를 막을 위험으로 B4·D1에서 동시 실행 probe로 확인한다. B2를 `f67b2fe`까지 통합했고 통합 HEAD에서 verify.mjs가 PASS했다. R-B2 작업자는 release했다.
- B3: `ctx_b5d25bc9d8dd` (task `task_5d7a770b5745`), child `agent-auth-providers` (base `f67b2fe`). 실행 모델은 opus high이고 `turnStart: observed`를 확인했다.
- B3 완료(`f32acf5`·`912c366`·`1efa8b8`). 작업자 보고 기준 테스트 3,534개·runtime 42개·typecheck·verify.mjs 통과. Cursor(`agent acp`), Antigravity(sha 고정 `agy_acp_server` 1.3.0, ACP 로그인·로그아웃, expect 릴레이 제거), Copilot(`copilot --acp` 1.0.105, 첫 실행으로 검증)을 공용 ACP 실행기로 연결했다. 세 플랫폼 모두 실검증을 통과했다. 홈·Canvas 캔버스 생성, 권한 허용·거절, 중단, 재시작 후 재개를 확인했다. Claude 레포 설정 덮어쓰기는 실행마다 `forceLoginOrgUUID`를 고정해 실패 처리로 막았다. 오류 코드는 현재 `unknown`이다. 남은 위험은 다음과 같다. Copilot ACP는 공개 프리뷰이다. Antigravity의 URL·sha·환경 변수는 문서화되지 않았다. Cursor 로그인 셸은 PATH 앞에 시스템 경로를 둔다. probe의 Antigravity 연결은 로그아웃 상태로 끝났다. handoff는 `evidence-B3/`에 있다.
- 작업 중 probe가 Electron 오류 대화상자를 두 번 띄웠다. 첫 번째(EPIPE)는 지휘자가 해당 probe 프로세스를 종료했다. 이후 probe 출력은 파일로 남기고 EPIPE 보호와 timeout을 둔다.
- R-B3: `ctx_babe0720d230` (task `task_05863718e6c8`). `agent-auth-providers`에서 보고만 한다. effective opus high, `turnStart: observed`.
- R-B3 `ctx_babe0720d230`: 🔴1·🟡4·⚪9. 🔴1은 BROWSER 훅이 CPython에서 실행되지 않아 서버가 기본 브라우저를 여는 문제다. 🟡는 네 가지다: 다운로드에 timeout·취소·상한 없음, Copilot이 취소된 응답도 검증으로 인정함, runConfirmed가 계정을 재확인하지 않음, Claude 조직 고정 거부가 `unknown`으로 매핑됨. 보고서는 `evidence-B3/review-B3.md`. R-B3 작업자는 release했다.
- F-B3: `ctx_0d49fe3f054a` (task `task_b276838865cb`), `agent-auth-providers`, opus high, `turnStart: observed`. 🔴1·🟡1–4·⚪1과 두 사용자 결정을 반영하고 Antigravity를 다시 로그인해 확인한다.
- F-B3 진행 중 Antigravity를 두 번 로그인했다. 지휘자가 ego-lite에서 ox501501@gmail.com으로 승인했다. 첫 로그인 뒤 로그아웃·상태 확인은 훅 마커만 남기고 disconnected로 끝났다. 두 번째 로그인은 D1용으로 연결을 유지한다. 사용자 부재 중 로그인 승인은 지휘자가 ego-lite로 처리하고, GitHub 2FA는 사용자가 GitHub 앱에서 승인한다(2026-10-28 사용자). ego-lite에서 다섯 서비스 세션이 모두 살아 있음을 확인했다.
- F-B3(`142ae37`..`a76d992`, 6커밋): 브라우저 훅을 실행 파일 스크립트로 바꿨고, 실패하면 시작을 거부한다. Antigravity 다운로드에는 정지 감지·취소·크기 상한과 `cli_install_failed`를 넣었다. Copilot은 실행이 실제로 끝난 응답만 검증으로 인정하고, 계정이 다르면 `account_mismatch`로 처리한다. 조직 UUID가 없는 Claude는 `not_logged_in`, 조직 고정에 걸린 거부는 `credential_override`다. 지휘자가 훅 diff를 확인했다. 실검증에서 로그인·로그아웃·로그아웃 뒤 상태 확인 모두 훅 마커가 찍혔고, Antigravity는 연결 상태로 남겼다. `credential_override`는 실제 Claude가 아니라 가짜 claude로만 확인했다.
- B3과 F-B3를 `184a357`까지 통합했다(cherry-pick 9개). 통합 HEAD에서 verify.mjs는 app-test에서 두 번 실패했다. 실패한 것은 이번 변경과 무관한 파일의 시간 민감 테스트이고, 실행마다 대상이 달랐다(1회차 thumbnails walk 5초·quickOpen 50ms, 2회차 watch·quickOpen). 해당 파일만 따로 돌리면 모두 통과한다. 당시 load average는 39였고 Chrome이 CPU 250%를 쓰고 있었다. 이 실패는 아직 해소되지 않았으며, D2에서 부하가 낮을 때 전체 gate를 다시 돌려 확인한다. 로그는 `verify-B3.log`, `verify-B3b.log`이다.
- B45: `ctx_a0df71e72f9a` (task `task_fab44aea87f8`), child `agent-auth-ipc` (base `184a357`). effective opus high, `turnStart: observed`.
- B45 설계 4건과 채널 이름은 지휘자 판단으로 승인했다(spec·design 범위). 내용: stop:true 흐름(Settings는 중단 후 로그아웃만 가능하고 시작·전송 권한은 없음), 로그인 링크는 소유 창에만 보내고 open-link로 main만 연다, auth metadata v1에 선택 키 `signOutFailed` 추가, 조직 UUID가 없는 Claude는 readiness reauth. 채널은 `agent-auth:read|check|sign-in|cancel|submit-code|open-link|sign-out`, 이벤트는 `changed|prompt`.
- B45 완료(`352da1f`·`dac893e`·`4f5f516`). 작업자 보고로 verify.mjs PASS(149 files/3,613 tests). 빌드한 preload를 거쳐 실검증을 통과했다: Cursor 계정 교체, 실행 중 로그아웃(중단→그룹 소멸→로그인·상태 확인 순서), 같은 계정 재개 재결합, 기록 보존, 거부된 전송은 `not_logged_in`. Claude 동시 실행은 서로 막지 않았다. Cursor 로그인 2회는 지휘자가 ego-lite로 승인했고, 끝난 시점에 다섯 공급자 모두 연결 상태다. 자체 리뷰만 했고, index.ts 연결은 typecheck·build로만 확인했다(실제 앱은 D1). handoff는 `evidence-B45/`.
- R-B45: `ctx_c16f0d19730a` (task `task_55f0b6dd242b`). `agent-auth-ipc`에서 보고만 한다. opus high, `turnStart: observed`.
- R-B45 `ctx_c16f0d19730a`: 🔴0·🟡2·⚪7. 🟡1: 도구 facts를 한 번만 읽어서, CLI가 자동 업데이트돼도 readiness가 ready로 남는다. 🟡2: `stopRuns` 이후에 spawn된 실행은 stop 요청을 받지 못해서, open이 느리면 `sign_out_failed`가 영속 기록될 수 있다. 사용자 결정 항목(멈추지 않는 실행이 있을 때 `sign_out_failed`를 영속 기록할지)은 지휘자 판단으로 현 동작을 유지한다. 근거는 design의 '로그아웃 실패 시 새 실행 차단'이다. UI에서는 이 상황을 다른 실패와 구분해서 보여 줘야 한다. 보고서는 `evidence-B45/review-B45.md`.
- F-B45: `ctx_9878c9321164` (task `task_0a2d159b7831`), `agent-auth-ipc`, opus high, `turnStart: observed`. 🟡1·🟡2와 ⚪1·3·7b를 수정한다.
- F-B45(`8ce09fd`·`f013aab`·`82afb0e`): 실행이 CLI 누락이나 버전 문제로 거부되면 그 공급자의 facts를 다시 읽는다. 공급자별 stop 세대를 두어 로그아웃 뒤에 spawn된 실행도 멈춘다. drain 마감은 `stopRuns`보다 먼저 건다. probe가 실패하면 UNPROBED로 처리한다. 채널과 sender 목록을 대조하는 테스트를 추가했다. B45와 F-B45를 `bdbc514`까지 통합했다(cherry-pick 6개). 통합 HEAD에서 verify.mjs가 PASS했다(3,621 tests, load 20). 앞서 부하로 실패했던 app-test 통과도 이 실행으로 확인했다.
- 사용자 결정(2026-10-28, D1): D1은 실제 HOME에서 실행한다. userData·DOAN_RUNTIME은 격리하고 setup 쓰기 단계는 거치지 않는다. doan이 만드는 Keychain 항목('doan Safe Storage'·'Electron Safe Storage'·doan 전용 Claude·Codex 항목)은 허용하고, 만든 항목은 목록으로 보고한다. 외부 항목은 읽기만 한다.
- D1: `ctx_3677aa70cdfe` (task `task_38c749038798`), child `agent-auth-d1` (base `bdbc514`), opus high, `turnStart: observed`.
- D1 dev Claude 로그인: ego-lite의 claude.ai 세션이 Pro/Max가 없는 ox501501@gmail.com 계정이라 Claude Code 승인이 거부됐다. claude.ai 로그아웃을 시도했지만 세션이 유지됐다. 사용자가 sinhyeok.kang@day1company.co.kr Google 계정으로 진행하라고 했으나 계정 전환을 완료하지 못했다. 작업자에게는 Claude를 미실행으로 남기고 나머지 공급자를 진행하라고 지시했다.

## 인계 (2026-10-28, 이 머신의 run은 종료)

사용자 지시로 이 머신의 지휘를 끝내고, 남은 작업은 새 머신의 새 세션이 이어받는다. 코드는 모두 `feat-agent-auth`에 통합해 push했다. `.scratch/`의 handoff·리뷰·probe 근거는 gitignore 대상이라 새 머신으로 넘어가지 않는다. 그래서 새 머신에 필요한 내용은 아래에 모두 적는다.

### 상태

| 배치 | 상태 |
|---|---|
| A, B1, B2, B3, B45 (+ 수정 라운드) | 통합 완료(`bdbc514`까지). 통합 HEAD에서 verify.mjs PASS(3,621 tests). tasks.md의 A1–A3·B1–B5 체크 완료 |
| D1 실제 앱 통합 확인 | 미완료. 이 머신에서 시작했지만 중단했다. dev 앱 Claude 로그인이 막혔다(아래). 다른 결과도 이 머신의 `.scratch`에만 남아 있어서, 새 머신에서는 처음부터 다시 한다 |
| D2 최종 리뷰·gate | 미시작 |
| D3 정본 승격·디렉터리 삭제·PR | 미시작. PR은 아직 만들지 않았다 |

### 새 머신에서 D1을 하기 전에 필요한 것

- 설치된 CLI가 정확히 이 버전이어야 한다(다르면 `runtime_unsupported`): Claude Code 2.1.312, codex-cli 0.163.0, Cursor `agent` 2026.10.22-27dcf5f, Copilot CLI 1.0.105. Antigravity는 앱이 `agy_acp_server` 1.3.0(darwin-arm64)을 sha 확인 뒤 내려받는다. 기존 `agy` CLI는 필요 없다.
- Claude는 Pro/Max 구독 계정으로 승인해야 한다. 이 머신이 막힌 이유가 이것이다: 승인용 브라우저의 claude.ai 세션이 무료 계정이었다.
- 사용자 결정에 따라 실제 HOME을 쓰고 userData·DOAN_RUNTIME은 격리한다. setup 쓰기 단계는 거치지 않는다. doan이 만드는 Keychain 항목은 허용하고, 만든 항목은 목록으로 보고한다.

### D1에서 꼭 확인할 항목 (리뷰에서 넘어온 것)

- 다섯 공급자 각각, dev 앱과 패키지 앱에서: 로그인, 암호화 보관, 재시작 후 인증 유지, 새 대화·Canvas 경로의 실제 캔버스 생성, 권한 허용·거절, 중단, 재시작 후 같은 세션 재개, 로그아웃 격리, 외부 인증 불변.
- Antigravity: 로그인·상태 확인·만료 실행에서 기본 브라우저가 열리지 않는다(훅 마커만 찍힌다).
- 앱 안에서 연속 턴(재시작 없이 다음 메시지)이 `busy` 없이 이어지는지.
- 초기화 중인 Claude 실행이 있을 때 `stop:true` 로그아웃의 drain 시간과 결과.
- Settings에서 로그인 중 Settings를 닫으면 시도가 취소된다. 주 창 hide는 시도를 유지한다. reload 뒤 cancel·open-link가 가능하다.
- facts probe(`--version`) 전후로 `~/.cursor`, `~/.copilot`, `~/.local/share/cursor-agent`가 바뀌지 않는다.
- 비ACP 로그인 CLI가 출력하는 URL 개수를 기록한다(open-link는 마지막 URL을 연다).
- 실제 만료·갱신과 동시 갱신은 관찰한 경우에만 `통과`로 적는다. 관찰하지 못하면 `미실행`이다.

### D3에서 정본으로 승격하거나 소비 feature에 넘길 사항

- 채널: `agent-auth:read|check|sign-in|cancel|submit-code|open-link|sign-out`, 이벤트: `agent-auth:changed|prompt`. 주 창과 Settings의 main frame만 쓸 수 있고, Settings에는 대화 시작·전송 권한이 없다. 시도는 소유 창에 묶이고 revision으로 병합한다.
- 복구 동작은 conversation 오류 코드가 아니라 `authStatus().readiness.action`에서 가져온다. 새 코드: `credential_override`(레포 설정의 API 키 때문에 거부), `cli_install_failed`(Antigravity 서버 설치 실패). 조직 UUID가 없는 Claude는 phase는 connected지만 readiness는 reauth_required이다.
- 대화가 멈추지 않아 로그아웃이 실패하면 `signOutFailed`로 저장되고, 재시작 뒤에도 실행을 막는다. UI 문구는 다른 실패와 구분해야 한다.
- 알려진 한계: Copilot ACP는 공개 프리뷰다. Cursor·Copilot이 자동 업데이트하면 해당 공급자 실행이 막힌다. Antigravity의 URL·sha·`GEMINI_HOME`·`AGY_ACP_FORCE_FILE_STORAGE`는 문서화되지 않았고, 지원 플랫폼은 darwin-arm64뿐이다. Cursor 로그인 셸은 시스템 PATH를 앞에 둔다. Cursor는 워크스페이스 안 편집 권한을 묻지 않는다. `GIT_CONFIG_GLOBAL`이 실제 `~/.gitconfig`를 가리킨다. Codex·Antigravity는 계정 ID가 없어서 같은 연결에서만 재개할 수 있다.
- ARCHITECTURE·PRODUCT에 반영할 것: Claude 2.1.312/SDK 0.3.312(현재 정본은 2.1.310), index v2 단방향 이행, auth metadata v1(`signOutFailed` 포함), design.md의 'ID 없는 계정 재개 거부' 문구(사용자 결정으로 바뀜), Copilot GitHub 토큰 예외의 scope 목록. PRODUCT §7에는 오늘 결정 4건이 이미 들어가 있다.

### 이 머신 D1의 부분 결과 (참고용, 다시 실행해야 함)

- dev 앱은 격리 userData와 실제 HOME으로 띄웠다. 패키지 앱은 빌드만 하고 실행하지 않았다.
- 통과한 것: 시작 스냅샷에 비밀 없음, prompt는 소유 창에만 전달됨, Settings의 cancel·open-link는 `not_owner`, 남의 시도로 보낸 submit-code는 `stale`, open-link는 main의 openExternal에 도달함, 소유 창 cancel, 종료 뒤 고아 프로세스 없음, 외부 인증 불변.
- 실행하지 못한 것: 나머지 전부. Claude는 유료 계정이 없어서 막혔고, Codex는 승인 전에 중단됐다.
- 새로 관찰한 것:
  - Codex 로그인 출력에는 URL이 두 개 있다(`localhost:1455`, `auth.openai.com`). open-link는 마지막 URL을 연다.
  - `codex --version`만 실행해도 `~/.codex/tmp/arg0-macos/`가 교체된다(Codex 자체 임시 디렉터리). facts probe도 실제 HOME에서 `--version`을 돌린다. D3에 기록한다.
- 새 D1에서 주의할 점:
  - dev와 패키지 앱이 같은 Keychain 이름(`doan Safe Storage`)을 쓴다. 한쪽이 만든 항목 때문에 다른 쪽이 Keychain 접근을 물을 수 있다. 권장: 두 실행 사이와 마지막에 doan이 만든 항목을 지운다.
  - Copilot의 `check`는 요청 1회를 쓰므로 probe에서 부르지 않는다.
  - probe 스크립트는 이 머신의 `.scratch`에만 있어서 새 머신에서 다시 작성해야 한다(Playwright `_electron`으로 `window.doan`·`window.doanSettings`를 호출하고, main의 `shell.openExternal`은 stub으로 대체).

### 이 머신에 남은 것

- 이 머신의 Keychain에 probe와 D1이 만든 doan 전용 항목이 남아 있다: `doan-auth-probe Safe Storage`, doan 전용 `Claude Code-credentials-*`, `Codex Auth`. D1 dev 앱 항목이 있으면 함께 남아 있다. 새 머신 작업에는 영향이 없다. 필요하면 이 머신에서 따로 지운다.
- 이 머신의 worker는 모두 release했고, 남은 터미널은 닫았다. Orca child worktree 6개(contract, storage, runtime, providers, ipc, d1)는 모두 제거했다. D1에서는 Keychain 항목을 만들지 않았다. probe 상태는 `.scratch/agent-auth-probe/`(gitignore)에 남아 있다.

## 새 머신 재개 (2026-10-28)

재개 커밋: `ad50b97`. 통합 브랜치는 그대로 `feat-agent-auth`이다. 이전 run `run_d94775f7dd27`은 이전 머신에 있어서, 이 머신에서는 새 run을 만든다.

### 환경

- 설치 상태: Claude Code 2.1.312, codex-cli 0.164.0(PATH의 `codex`는 Orca 런타임 링크이고 npm 전역도 0.164.0이다). 사용자 승인을 받아 지휘자가 공식 설치로 Cursor `agent` 2026.10.22-27dcf5f(`cursor.com/install`)와 Copilot CLI 1.0.105(`npm i -g @github/copilot@1.0.105`)를 설치했다. 두 버전 모두 고정값과 같다.
- 이 머신에는 이전 `.scratch` 근거가 없다. 이전 머신이 만든 probe 스크립트와 결과는 재사용하지 않는다.
- 사용자에 따르면 이 머신의 ego-lite에는 Claude 구독 계정 세션이 이미 발급돼 있다(2026-10-28). Claude 로그인 승인에는 이 세션을 쓴다.

### 결정 기록 (재개)

- 사용자 결정(2026-10-28): Codex 지원 버전을 0.163.0에서 0.164.0으로 올린다. 새 배치 C가 맡는다. 로컬 CLI를 내리지 않아도 되고, PoC의 keyring 강제 경로도 0.164.0에서 확인했다. ARCHITECTURE의 버전 계약 갱신은 D3에서 Claude 2.1.312와 함께 한다.
- 사용자 결정(2026-10-28): Cursor·Copilot CLI는 지휘자가 공식 경로로 설치한다(위 환경 참고).
- 사용자 결정(2026-10-28): 이번 세션에서 이 기능을 main에 병합하는 것까지 진행한다. orchestrate의 '병합하지 않음' 기본값은 사용자의 명시 요청으로 대체한다. 병합은 D3 승격, 최종 gate 통과, PR 생성을 마친 뒤에 한다.
- conductor's call(2026-10-28, C 질문) — Codex rollout 헤더의 `cli_version`이 0.163.0이나 0.164.0이면 세션이 있다고 본다. 범위가 아니라 명시한 두 값만 허용한다. 설치 CLI의 지원 버전은 0.164.0 하나다. 근거: 0.164.0이 0.163.0 세션을 재개해도 첫 줄 헤더는 바뀌지 않는다(C의 probe 관찰). 사용자 결정은 CLI 버전을 올리는 것이지 기존 대화를 버리는 것이 아니다.
- 사용자 결정(2026-10-28, R-C): Codex rollout 헤더 허용 목록은 누적한다. doan이 지원했던 Codex 버전은 모두 목록에 남기고, 어떤 버전으로 만든 대화를 포기하기로 따로 결정할 때만 그 버전을 뺀다. 목록에는 항상 현재 지원 버전이 들어 있어야 하며 테스트로 이를 고정한다. 'exact supported version' 계약의 예외이므로 D3에서 PRODUCT §7과 ARCHITECTURE §5에 기록한다.
- 사용자 결정(2026-10-28, D1): Claude 로그인에도 doan BROWSER 훅을 넣는다. 훅이 받은 localhost 콜백 URL을 prompt로 보내고, 이 URL은 main만 연다. CLI가 사용자 기본 브라우저를 직접 열지 않게 한다. F-D1이 구현한다.
- 사용자 결정(2026-10-28, D1): 이전 턴은 끝났는데 프로세스가 아직 종료되지 않았으면, send는 정해진 시간까지 종료를 기다린 뒤 진행한다. 실행 중인 턴이 있거나 그 시간 안에 종료되지 않을 때만 `busy`를 돌려준다. F-D1이 구현한다.
- 사용자 결정(2026-10-28, R-F-D1 B): Claude CLI가 URL을 출력했는데 10초 안에 받아들일 수 있는 훅 링크가 오지 않으면 로그인을 `sign_in_failed`로 끝낸다. 이유는 main 로그에 남긴다. F-D1b가 구현한다.
- 사용자 결정(2026-10-28, R-F-D1 C): Cursor·Copilot 로그인 CLI가 OS 기본 브라우저를 직접 여는 동작은 알려진 한계로 두고 병합한다. 소비 UI는 브라우저가 열릴 수 있다는 점을 반영한다. 모든 공급자를 같은 방식으로 맞추는 일은 후속 작업이다.
- conductor's call(R-F-D1 A·D): 주 창을 숨겨도 대기 중인 send는 유지하고, 앱 종료만 이를 취소한다. 창을 숨겨도 실행을 멈추지 않는 기존 동작과 맞추기 위해서다. Claude 대화의 도구 셸이 `BROWSER=<훅>`을 물려받는 점은 Antigravity와 같으며, 알려진 한계로 기록한다.
- conductor's call — C(코드)와 D1(`.scratch` probe만)은 파일이 겹치지 않으므로 병렬로 진행한다. D1은 Codex를 제외한 네 공급자를 먼저 확인하고, Codex는 '보류 항목'으로 handoff에 남긴다. C를 통합한 뒤 Codex 확인을 새 Task로 보낸다. 로그인 승인은 지휘자가 ego-lite에서 하나씩 처리하므로, 실인증 단계가 겹쳐도 승인은 순서대로 진행된다.

### 배치 (재개)

| 배치 | task | 파일 소유권 | 선행 | 모델·effort / 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| C Codex 0.164.0 | (D1 선행 조건, B2 범위) | `conversation/{sessions,io}.ts`, `agentAuth/providers.ts`와 관련 테스트·fixture README | 없음 | Opus high / 0.163.0으로 만든 기존 세션의 재개 판정이 바뀌므로 회귀 판단이 필요하다 | 단위 테스트, typecheck, verify.mjs, 격리 프로필에서 Codex 0.164.0 실요청·권한·중단·재개 | 대기 |
| D1 실제 앱 통합 확인 | D1 | `.scratch/` probe·근거 | B45 통합(완료) / Codex 부분은 C 통합 | Opus high / 다섯 플랫폼 preload 경로와 패키지 경계 | 위 'D1에서 꼭 확인할 항목' 전부, `npm --prefix app run package` 격리 실행 | 대기 |
| R-C | C 리뷰 | 보고만 | C | Sonnet high / 범위가 작은 버전 상향 diff | `/code-review` | 대기 |
| D2·D3 | D2, D3 | 위 표와 같다 | D1 | 지휘자 | 위 표와 같다 | 대기 |

### 진행 기록 (재개)

Run: `run_45baa7f44012`.

| 배치 | Dispatch | child worktree | 시작 증거 |
|---|---|---|---|
| C | `ctx_d94e8a5f2af0` (task `task_5d462a0afbe8`) | `agent-auth-codex164` (base `463e287`) | effective Claude opus high, `turnStart: observed` |
| D1 | `ctx_921c2dccef2e` (task `task_5543bdde8603`) | `agent-auth-d1` (base `463e287`) | effective Claude opus high, `turnStart: observed` |
- C 완료(`eefd814` test, `b579927` feat). 작업자 보고: verify.mjs PASS(3,622 tests). dev 앱에서 실검증을 모두 통과했다: doan 로그인과 keyring, 새 대화·Canvas 경로 생성, 권한 허용·거절, 중단, 재시작 후 재개, 0.163.0으로 만든 legacy 세션의 0.164.0 재개, 외부 인증 불변. 끝난 시점에 doan Codex는 로그아웃 상태다. 패키지 앱은 D1 범위로 넘겼다. 관찰한 것: doan 경로의 Codex 로그인이 prompt를 2번 보낸다. interrupt 뒤에도 실행 중인 명령이 남는데 0.163.0도 같다. 실제 HOME의 `~/.agents/skills/doan`도 user scope로 읽힌다. `~/.codex/auth.json`의 mtime이 기준선 전(20:44 KST)에 바뀌었고 원인은 특정하지 못했다. handoff는 `evidence-C/`에 있다. C 작업자는 release했다.
- R-C: `ctx_825963277647` (task `task_265c2bc3c176`). `agent-auth-codex164`에서 보고만 한다. effective sonnet high, `turnStart: observed`.
- Claude·Codex·Cursor·Antigravity·Copilot 로그인은 모두 지휘자가 ego-lite에서 승인했다. Claude는 sinhyeok.kang@day1company.co.kr이다. claude.ai 승인 버튼은 창 포커스가 없으면 비활성이라, CDP 포커스 에뮬레이션을 켜고 눌렀다. Codex·Cursor·Antigravity는 ox501501@gmail.com, Copilot은 SinhyeokKang이다. D1이 보고한 결함 후보는 다음과 같다: doan이 Claude에 내보내는 URL은 승인 뒤 코드를 붙여넣는 방식인데, Claude에는 코드를 제출하는 경로가 없다. Copilot이 요청하는 scope에는 `write:plugin_gateway_connections`가 더 있다(D3에 기록).
- R-C `ctx_825963277647`: 🔴0·🟡2·⚪4. io.ts의 경계(no-follow, 단일 regular 파일, canonical cwd, 64KiB)는 바뀌지 않았고, 헤더 목록의 범위도 맞다. 🟡1: 헤더 근거가 휘발성 `/tmp`에만 있고 handoff가 인용한 파일에는 `cli_version`이 없다. 🟡2: `providers.test.ts:79`의 테스트 이름이 0.164.0의 로그인 상태 출력을 확인한 것처럼 읽힌다. 사용자 결정 1건은 위 결정 기록에 반영했다. 보고서는 `evidence-C/review-C.md`. R-C 작업자는 release했다.
- 지휘자 판단: R-C의 사용자 결정 2(0.163.0 헤더 대화를 0.164.0에서 쓰는 것이 호환되는가)는 C의 실재개 1회로 충분하다고 본다. D1의 Codex 보류 Task에서 패키지 앱으로 다시 확인한다.
- F-C: `ctx_428f4fff5864` (task `task_e77bef56f0fc`), `agent-auth-codex164`, sonnet medium(근거 파일 정리와 테스트 3개라 판단할 것이 적다), `turnStart: observed`. 🟡1·🟡2·⚪1·⚪2를 맡는다. ⚪3은 취향 수준이라 넘기고, ⚪4는 D3에서 처리한다.
- F-C `99fbe08`: 헤더 목록을 export했고, 목록에 현재 지원 버전이 들어 있는지 확인하는 테스트를 추가했다. 이 테스트는 0.165.0으로 바꿨을 때 red가 되는 것을 확인했다. 문자열이 아닌 헤더를 거부하는 테스트를 추가했고, 테스트 이름도 고쳤다. 헤더 근거는 `evidence-C/rollout-headers.json`에 있다. C와 F-C를 `e228a6f`·`5e9954c`·`053c631`로 통합했다. 통합 HEAD에서 verify.mjs가 PASS했다(`verify-C.log`). F-C 작업자는 release했다. `agent-auth-codex164` worktree는 cherry 확인 뒤 정리한다.
- 사용자 요청(2026-10-28): 이 run을 병합까지 마치고 지휘를 끝낸 뒤 buzz-onboarding `/feature-review`를 진행한다. 시간을 줄이려고 Codex D1을 D1과 병렬로 진행한다. `ctx_d454114fdf6c` (task `task_41e33a236570`), child `agent-auth-d1-codex` (base `40edb64`, C 통합 포함), opus high, `turnStart: observed`. D1은 Codex 작업자가 끝날 때까지 마지막 Keychain 정리를 미룬다. buzz-onboarding 리뷰는 D3에서 인계를 마친 뒤에 한다.
- `agent-auth-codex164` worktree: cherry에 `+` 항목이 없고 작업 트리가 깨끗한 것을 확인했다. 근거(`runtime-test` 14MB, handoff, 리뷰, verify 로그)를 `evidence-C/`에 복사하고 대조한 뒤, Orca로 제거했고 목록에서 빠진 것을 확인했다.
- D1-Codex 완료: Codex 0.164.0으로 dev 앱과 패키지 앱에서 다음을 확인했다. 로그인, keyring 보관, 재시작 후 인증 유지, 새 대화·Canvas 경로 캔버스 생성, 권한 허용·거절, 중단, 같은 세션 재개, 연속 턴(`busy` 없음), `stop:true` 로그아웃 격리, 외부 `~/.codex` 불변, 남은 프로세스 없음. 모두 통과했다. 실제 만료·갱신은 관찰하지 못해 미실행이다. doan은 prompt 2개(localhost:1455와 auth URL)를 보내고, open-link는 auth URL을 연다. 로그인 상태의 `codex login status`는 stderr로 `Logged in using ChatGPT`를 출력하고 exit 0이다. ⚪ 두 가지를 관찰했다: 옵션에 없는 optionId를 보내면 `stale`이 돌아온다. 대기 중인 대화가 있을 때 stop 없이 로그아웃하면 `stop_required`가 돌아온다. 근거는 `evidence-D1-codex/`에 있다. 작업자는 release했다. worktree는 깨끗했고 cherry에 `+` 항목이 없어서 Orca로 제거했다.
- D1 완료: Claude·Cursor·Antigravity·Copilot을 dev 앱과 패키지 앱에서 확인했다. 로그인, 암호화 보관, 재시작 후 인증 유지, 두 경로의 캔버스 생성, 권한 허용·거절, 중단, 재시작 후 같은 세션 재개, 로그아웃 격리, Settings 닫기·hide·reload, `stop:true` 로그아웃(2.18초)이 모두 통과했다. 실패 1건: 턴이 끝난 직후 보낸 메시지가 `busy`로 거부된다(패키지 앱, Claude 2~5초). 결함 후보 1건: Claude 로그인 링크가 코드를 붙여넣는 방식이다. 지휘자가 직접 probe한 결과, claude CLI는 `BROWSER`(없으면 OS 기본 브라우저)를 localhost 콜백 URL로 연다. 미실행: 실제 만료·갱신, 동시 갱신 경쟁, 계정 교체(B45 근거). 그 밖에 관찰한 것은 다음과 같다. `stop:true`로 멈춘 시작 요청은 `unknown`으로 끝난다. 앱을 시작할 때마다 `cursor-agent --version`이 `~/.local/share/cursor-agent/versions/*/.running`을 만든다(CLI 자체 동작). 재시작 직후에는 readiness가 `unverified`/`retry`인데, Copilot에서 retry를 누르면 요청 1회를 쓴다. Keychain은 기준선으로 돌아왔다. 근거는 `evidence-D1/`에 있다. D1 작업자는 release했고 worktree는 제거했다.
- F-D1: `ctx_7009198637ae` (task `task_f65d02c126d3`), child `agent-auth-fix-d1` (base `c1ceb89`), opus high(로그인 수명 주기와 세션 동시 사용 보장을 건드림), `turnStart: observed`.
- F-D1 완료(`4ce52f9`..`a4764a2`, 5커밋). Claude 로그인은 이제 BROWSER 훅이 `DOAN_AUTH_LINK` 파일로 받은 localhost 콜백 링크만 쓰고, 코드를 붙여넣는 링크는 더 이상 보여 주지 않는다. send는 턴이 끝난 뒤 남아 있는 프로세스가 종료되기를 최대 10초 기다린다. interrupt, stopRuns, 앱 종료가 이 대기를 취소하고, 시간이 지나면 `busy`를 돌려준다. 작업자 보고 기준으로 verify.mjs가 PASS했다. dev 앱과 패키지 앱에서 Claude 훅 로그인이 기본 브라우저를 열지 않았고, Claude와 Copilot 모두 연속 3턴을 `busy` 없이 보냈다. 로그아웃 뒤 Keychain과 외부 상태는 기준선으로 돌아왔다. 리팩터 커밋 `6e71130` 뒤에는 실제 앱을 다시 돌리지 않았다(단위 테스트만). 새로 관찰한 것: `cursor-agent login`과 `copilot login`도 OS 기본 브라우저를 직접 연다(D3에 기록). dev 앱의 첫 Claude 승인 실패는 지휘자의 승인 스크립트가 콜백 이동이 끝나기 전에 탭을 옮겼기 때문이다. 근거는 `evidence-F-D1/`. 작업자는 release했다.
- R-F-D1: `ctx_5fa5bae96678` (task `task_7760b3e45e13`), `agent-auth-fix-d1`, opus high(동시성과 로그인 수명 주기), `turnStart: observed`.
- 지휘자 판단: D3는 문서가 많아 지휘자가 직접 쓰지 않고 작업자에게 맡긴다. D3: `ctx_b443f8eba300` (task `task_7207e241d9f5`), child `agent-auth-d3` (base `0c498cb`), opus high(정본 계약을 코드와 대조해야 함), `turnStart: observed`. 이 디렉터리 삭제와 orch.md 수정은 지휘자가 마지막에 한다. 이 run은 CLI·MCP 출력, 가이드, 스킬 스텁, eval을 바꾸지 않았다(`git diff main...HEAD -- cli/ eval/` 변경 없음). 그래서 D2의 `/agent-eval`은 해당하지 않는다.
- R-F-D1 `ctx_5fa5bae96678`: 🔴0·🟡1·⚪3. 세션 하나를 두 프로세스가 함께 쓰는 경로는 없었다. 새 테스트는 수정 전 코드에서 red(6건)였고, 취소 가드 5개는 각각 mutation으로 확인했다. `6e71130`은 실제 앱을 다시 돌리지 않아도 된다는 데 동의했다. 🟡1은 `claudeLink`가 거절한 훅 링크를 로그 없이 버려서 로그인이 무기한 대기하는 문제다. 보고서는 `evidence-F-D1/review-F-D1.md`. R-F-D1 작업자는 release했다.
- F-D1b: `ctx_997ac5e713a4` (task `task_bc5f6744fd9e`), `agent-auth-fix-d1`, sonnet high(타이머 1개와 정리, 테스트 위주), `turnStart: observed`. 🟡1과 결정 B, ⚪1–3을 맡는다. D3에는 결정 A–D를 전달했다.
