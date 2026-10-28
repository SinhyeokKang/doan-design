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
