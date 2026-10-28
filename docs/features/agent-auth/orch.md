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

(배치 시작 후 기록한다.)
