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
