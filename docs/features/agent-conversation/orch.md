# agent-conversation — orchestration

## 기준

- 시작: `14fa03244201b52a3f83e14685f52ec32fd08c2e` (`main`), 2026-10-26.
- 통합 브랜치: `feat-agent-conversation`. 완료 시 push와 PR까지 진행하며 merge하지 않는다.
- 요구사항: [spec.md](./spec.md), 계약: [design.md](./design.md), 작업: [tasks.md](./tasks.md).
- 관련 맥락: `../buzz-restyle/`, 이전 세션 인계 `.scratch/handoff-codex-agent-conversation.md`를 확인했다.

## 결정 기록

1. 2026-10-26 user: orchestrate로 구현 시작. PoC 단계의 Claude Code 호출을 모두 허가했다. 작업자는 Codex이며, Claude 호출 허가는 PoC 검증 범위다.
2. 2026-10-26 user: 앱의 코어 기능이므로 중요하게 검증한다. 정말 불가피한 경우 Astra high를 허용한다. 기본 Astra medium을 유지하고 high 사용 시 배치와 이유를 남긴다.
3. conductor's call — 이 기능은 UI 없는 기반이므로 디자인 초안과 design-sync는 적용하지 않는다(spec 비목표).
4. conductor's call — P1~P3에서 전송 방식과 세션 기록 경로가 확정되기 전 제품 코드 구현을 시작하지 않는다(design PoC 게이트).
5. conductor's call — 이전 세션에서 확정한 저장 위치·동일 세션 resume·권한 전달·캔버스당 한 대화는 다시 묻지 않는다. 터미널 사용 중 세션을 탐지할 수 없으면 PoC 9d에 따라 사용자 결정을 받는다.
6. conductor's call — 실제 사용자 doan 상태와 세션은 변경하지 않는다. 격리 HOME·설정·userData와 임시 repo에서 실험한다. 인증을 위해 이 범위를 벗어나야 하면 구체적인 접근을 준비한 뒤 보고한다.
7. conductor's call — comments-ui 기존 실패는 tasks에 명시한 부모 예외만 적용한다. 다른 실패에는 확대 적용하지 않는다.

## 배치와 검증

각 구현 배치는 `/ship bypass`로 진행하되 push 전에 멈춘다. 지휘자는 배치 코드를 수정하지 않는다. 작업자 검증과 통합 HEAD 검증을 구분한다.

| 배치 | task 소유 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | P1, P2, P3 | `.scratch/agent-conversation/`, PRODUCT §6 결과 | 없음 | Astra medium — 전송·권한·동시 세션 실증 판단 | 버전·명령·원시 증거·격리 검증, 9a~9e 결과 | 준비 |
| D | D1, D2 | PRODUCT 결정, feature 계약의 PoC 확정 내용 | P | Astra medium — 제품 범위와 실험 결과 대조 | §3·§7 및 스킬 변경 판단 | 대기 |
| S | S1 | `schema/`, Go·TS formats 등록과 테스트 | D | Sol medium — 공유 포맷과 픽스처 구현 | Go·TS 포맷 테스트 | 대기 |
| C | T1·T2의 Go 부분, C1 | `cli/internal/cli/` 세션 기록과 테스트, 필요 시 skill | S | Astra medium — 출력 보존·경로·동시 append | red→green, Go test/vet, 필요 시 agent-eval | 대기 |
| T | T1·T2의 TS 부분 | `app/src/main/conversation/` 순수 함수·계약·테스트 | S | Astra medium — 이벤트·복구·권한 상태 계약 | red→green, app test/typecheck | 대기 |
| A | A2, A3, A4 | conversation 실행기·저장·IPC, main 수명, preload와 타입 | C, T | Astra medium — 프로세스·저장·IPC 경계 | app test/typecheck/build 및 E 종료 검증 | 대기 |
| E | A1, E1, E2 | `app/e2e/`, `.scratch/` 실험, PRODUCT 관찰 | A | Astra medium — 실제 앱·종료·상태 불변 실증 | 하네스 red→green, 가짜 에이전트 12단계, 실제 에이전트 관찰 | 대기 |
| V | E3 | 통합 검증 증거 | E, 리뷰 | Sol high — 순차 게이트와 증거 확인 | verify --runtime, 필요 시 --eval 및 agent-eval | 대기 |
| Z | Z1 | PRODUCT, ARCHITECTURE, DIRECTORY, AGENTS, feature 삭제 | V | Astra medium — 구현과 문서 계약 대조 | 승격 내용·IPC·포맷·삭제 확인 | 대기 |
| R-P/D | P·D 독립 검토 | 보고서만 | P·D | Astra medium — 관찰과 결정의 근거 검토 | 주장과 원시 증거 대조 | 대기 |
| R-S/C/T | S·C·T 독립 리뷰 | 보고서만 | 각 배치 | Astra medium — 포맷·부수 효과·상태 계약 | code-review, 인계 주장 검증, 🔴 0 | 대기 |
| R-A/E | A·E 독립 리뷰 | 보고서만 | 각 배치 | Astra medium — 권한·복구·수명 경계 | code-review, 인계 주장 검증, 🔴 0 | 대기 |
| F-* | 각 리뷰 수정 | 해당 원소유 배치 파일 | 리뷰 | 원소유 모델·effort, 별도 사유가 있으면 기록 | 회귀 red→green, 재리뷰 | 필요 시 |

## 순서와 충돌

- P → D → S → (C와 T 병렬) → A → E → V → Z.
- C와 T는 파일이 겹치지 않는다. S의 formats 수정은 먼저 통합한다.
- P3에서 앱 기반 구현이 필요한 측정은 구현 이전 임시 실험 앱으로 검증한다. 불가능하면 측정 완료로 기록하지 않고 계약 변경 판단을 요청한다.
- PRODUCT 수정 배치는 순차로 진행한다. 리뷰 작업자는 읽기 전용이며 원소유 작업자가 수정한다.
- 전체 verify·runtime·stress는 한 번에 한 checkout에서만 돌린다.
- 모든 tasks 항목(P1~P3, D1~D2, S1, T1~T2, C1, A1~A4, E1~E3, Z1)의 소유를 위 표에 배정했다.

## 증거와 정리

- 작업자 인계: `.scratch/handoff-<batch>.md`. 통합 전에 실제 커밋·검증 로그와 대조한다.
- PoC 미정 명령은 먼저 구체화한다. 사용자 PoC 호출 승인 범위에서 수행하고 명령을 기록한다.
- 각 child worktree는 `feat-agent-conversation` 커밋에서 시작한다. 종료 후 증거 복사, 미통합 커밋 없음, clean 상태를 확인하고 Orca로 제거한다.
- 현재 worker·Run: 아직 없음.
