# sidebar-canvas-conversations — orch

- 계획: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261114-2](../chain-261114-2/chain.md) 링크 2. 링크 3(canvas-edit-awareness)과 병렬, 링크 2가 먼저 병합된다.
- 시작 해시: `ef2bff835`(develop, 링크 1 병합 #199 `0743a39e5` 포함)
- 통합 브랜치: `feat/sidebar-canvas-conversations`(리드가 만듦, 워크트리 `sidebar-canvas-conversations-orch`)
- 컨덕터: Claude(Opus 5.5)

## 모델 경계

- 체인 '상시 권한'에 따라 사용자가 2026-11-14 이 링크에 Codex 워커를 허가했다.
- Codex 주간 사용량(시작 시, `$CODEX_HOME` 최신 rollout의 `window_minutes: 10080`): 44% 사용.
- 쓰는 범위: 독립 리뷰 R(작업 7)만 Codex `gpt-6-astra` medium. 구현·측정·probe는 Claude다. 배치를 나눌 때 사용량을 다시 확인해 여기에 적는다.

## 결정 기록

- 시작 점검 1–4는 사용자가 승인했다(체인 파일). 실제 로그인은 쓰지 않는다(체인 '로그인').
- 작업 1(초안)은 끝났다(82a55996b, 사용자 확인). 이 링크가 병합될 때까지 `/design-sync` 기준이다.
- 컨덕터 판단 — 사이드바 캔버스 행 클릭이 고르는 대화(`sidebarRowRequest`)는 정한 점 7을 따라 캔버스 행 신호와 같은 범위(캔버스에 묶인 모든 대화)로 맞춘다. 근거: 링크 1 PR #199 'For links 2 and 3'가 "행 클릭의 대화 선택은 슬롯과 맞는다"를 계약으로 두었고, 이 feature가 슬롯 범위를 넓힌다.
- 컨덕터 판단 — 링크 1 중 사용자 결정(보드 알림 Stop 없음, 알림 커서 1.5px, 접힌 패널의 보드는 패널의 선택을 따름)은 이미 PRODUCT/DESIGN에 있어 이 feature 범위와 겹치지 않는다.
- 컨덕터 판단 — 작업 2(문서 맞추기)는 구현 워커 A가 첫 단계로 한다. 같은 사람이 인용을 맞추고 그 코드 위에서 테스트를 쓰는 편이 어긋남이 적다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | 작업 2, 3, 4 | `docs/features/sidebar-canvas-conversations/design.md`(인용 맞추기), `app/src/renderer/`(`ShellSidebar.tsx`, `conversationList.ts`, `homeRun.ts`, `canvasNotice.ts`, `App.tsx`, `ConversationDeleteDialog.tsx`, `conversationDelete.ts`, `styles.css`, 새 순수 함수 파일과 테스트), `app/src/restore/uiState.ts`와 테스트 | 없음 | Claude Opus high — 로빙 포커스 복구, 순서 멈춤, ui-state 첫 읽기 병합처럼 틀리면 회귀가 나는 판단이 많다 | 작업 3: 새 테스트만 red. 작업 4: `npm --prefix app test`·`typecheck`·`lint`·`build` | 통합 `36f5278af`·`6fbec639d`·`06df30066`·`130007f3d` |
| A-DS | 작업 5 | A의 파일 중 스타일·마크업 수정, `docs/DESIGN.md` 사이드바 절, `.scratch/design-sync/sidebar-canvas-conversations/` | A 통합 | Claude Opus high(A와 같은 워커, 후속 Task) — 자기 구현을 아는 워커가 고친다 | `node .scratch/design-sync/sidebar-canvas-conversations/measure.mjs` 차이 0 또는 문서화된 차이 | 통합 `076910033`·`d05ecfc4d` |
| A-RT | 작업 6 | `.scratch/runtime-test/sidebar-canvas-conversations/`(코드 수정 없음) | A-DS 통합 | Claude Opus high(같은 워커, 후속 Task) — 가짜 IPC 응답과 포커스·순서 확인이 까다롭다 | `node .scratch/runtime-test/sidebar-canvas-conversations/probe.mjs` 완료 줄, exit 0 | 1회차 31/32, 재실행 대기 |
| R | 작업 7 리뷰 | 없음(보고서만) | A 통합(A-DS와 병렬) | Codex `gpt-6-astra` medium — 다른 계열의 독립 리뷰 | 보고서 🔴 0 | A 범위 1회차 끝: 🔴0 🟡3 🟢1 |
| A-FIX | 작업 7 `/refactor` | A의 파일 | R | A와 같은 워커 | 리뷰 지적 해결, 영향받은 작업 6 항목 재확인 | 1회차 통합 `fff759b67` |
| C | 작업 8, 9 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/DESIGN.md`(필요하면), feature 디렉터리 삭제 | 모든 배치 | 컨덕터 — 문서 승격과 최종 `/verify` | tasks 8의 grep 검증, `verify.mjs` PASS | 대기 |

## 겹침과 순서

- 컨덕터 판단 — R은 A 통합본(`8aa30ada4..130007f3d`)을 A-DS와 병렬로 리뷰한다. R은 보고서만 쓰고 앱을 띄우지 않아 파일·GUI가 겹치지 않는다. A-DS·A-RT의 수정분은 뒤에 따로 리뷰한다.
- 모든 코드 작업이 `App.tsx`·`ShellSidebar.tsx`·`styles.css`를 함께 고치므로 A → A-DS → A-RT → R → A-FIX를 직렬로 돈다. 병렬 배치는 없다.
- 링크 3과는 코드·테스트·초안 파일이 겹치지 않는다(체인 파일 확인). 겹침을 찾으면 리드에게 알린다.
- 링크 4가 이 링크 병합 뒤 `CanvasController.ts`·`App.tsx`·`styles.css`를 고친다. PR 본문에 알릴 것을 적는다.

## 리뷰·검증 기록

- A 완료(2026-11-15): 게이트 test(알려진 부하 실패 2건만, 단독 통과)·typecheck·lint(80, 기준과 같음)·build exit 0. 계획과 다른 점 10개는 `.scratch/handoff-A.md`, R이 판단한다. 통합 HEAD의 `/verify`는 마지막 통합에서 한 번 돈다(A-DS가 GUI 측정 중이라 부하를 겹치지 않는다).
- 컨덕터 판단 — spec·tasks의 옛 PRODUCT 줄 번호는 고치지 않는다. design.md는 맞췄고, feature 디렉터리는 승격 뒤 지운다.
- Codex 주간 사용량(R 시작 시): 44% 사용.
- R 1회차(A 범위, 2026-11-15): 🔴 0, 🟡 3, 🟢 1, 사용자 결정 0. 보고서는 `.scratch/review-R.md`. 인계 차이 10개 중 9개 허용, 4번(아래 행 이동 시 목록 유지)은 R1–R3로 일부 결함.
  - R1: 펼친 목록이 없거나 접힌 채 이동해도 이전 캔버스에 목록 자리를 붙잡는다(정한 점 10의 "펼쳐진 채" 전제 빠짐).
  - R2: 유지된 목록의 표시와 App의 캔버스 행 클릭 판단(`sidebarListShown`)이 서로 다른 캔버스를 본다.
  - R3: 목록이 다른 캔버스로 바로 옮겨 가면 이전 목록의 포커스·포인터 고정 상태가 남아 새 목록의 순서를 멈춘다.
  - R4(🟢): 포커스 복구·DOM 유지가 단위 테스트로는 증명되지 않는다. A-RT probe 항목에 넣는다.
  - 컨덕터 판단 — R1–R3는 A-DS가 끝난 뒤 A에게 수정 Task로 보낸다(작업 중인 워커에게 일을 쌓지 않는다). 수정분과 A-DS 수정분은 R이 다시 리뷰한다.
- A-DS 완료(2026-11-15): `measure.mjs` exit 0, 418행, 차이 0, 문서화된 차이 4행(24시간제 문구 3행 — DESIGN.md 'Usage-limit queue', 열린 툴팁의 Radix 설명 1행 — DESIGN.md 기존 문서화 차이). 수정 1건(보는 대화 행의 hover 채움 6%→10%). 게이트 4개 exit 0, 실제 상태 그대로(설치 앱의 ui-state.json 제외). 인계는 `.scratch/handoff-A-DS.md`.
  - 컨덕터 판단 — 보는 대화 행의 hover 채움은 초안대로 둔다. 근거: 이 초안이 병합 전까지 기준이고, spec '보는 대화 표시'는 쉬는 상태만 정한다.
  - 컨덕터 판단 — A-FIX1(R1–R3)을 작업 6보다 먼저 한다. probe가 고친 코드를 확인하게 하기 위해서다.
- A-FIX1 완료(2026-11-15): R1–R3을 `e9ccf78b8` 하나로 고쳤다(통합 `fff759b67`). 지적마다 회귀 테스트를 먼저 red로 봤다(R1 5개, R2 2개, R3 2개). 기존 테스트 2개는 입력만 바꾸고 기대값은 그대로다. 게이트 4개 exit 0(12815 테스트). 인계는 `.scratch/handoff-A-FIX1.md`.
- A-RT 시작: 작업 6 항목과 R4(실제 DOM 포커스 수명), R1·R2 실제 앱 확인을 probe에 넣었다. 보고만 하고 결함은 별도 Task로 고친다.
- R 2회차 시작(A-RT와 병렬, 보고서만): `130007f3d..fff759b67`.
- R 2회차(2026-11-15): 🔴 0, 🟡 1, 사용자 결정 0. R2·R3 해결, R1 일부 해결. hover 채움과 DESIGN.md 문단은 허용. 보고서 `.scratch/review-R2.md`.
  - R2-1: 포인터로 누른 캔버스 기록(`pressedRow`)이 포인터가 사이드바를 떠날 때만 지워져, 뒤의 키보드·Back/Forward 이동이 그 기록을 다시 써 목록을 이전 캔버스에 붙잡는다.
  - 컨덕터 판단 — A-RT가 끝난 뒤 A에게 수정 Task로 보낸다.
- A-RT 1회차(2026-11-15): probe exit 1, 32개 중 31개 통과. 실패 9h: 셰브론에 포커스가 있을 때 대화가 2개에서 1개가 되어 셰브론이 사라지면 포커스가 `body`로 떨어진다(프로그램·보조기기 포커스로만 닿는다). 9e: 대화 행에 포커스가 있을 때 `doan open`으로 다른 캔버스를 열면 포커스가 헤더의 Hide sidebar로 간다(`body`는 아니다). 실제 상태 그대로. 인계 `.scratch/handoff-A-RT.md`.
- A-FIX2 시작: R2-1과 9h를 고치고, 9e는 출시된 동작(일반 캔버스 행에서 `doan open`)과 비교해 같으면 두고 다르면 `recoveryKey` 규칙으로 맞춘다. 그 뒤 probe를 R2-1 확인을 더해 다시 돈다.
