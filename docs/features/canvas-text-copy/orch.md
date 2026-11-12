# canvas-text-copy — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261112](../chain-261112/chain.md) 링크 3. conductor는 체인 파일을 읽기만 한다.
- 시작 hash: `02e6e505` (origin/develop, PR #178 포함)
- 통합 브랜치: `feat/canvas-text-copy` (lead가 만들었다)
- conductor: Claude Code. 워커도 Claude만 쓴다(계열 넘기 허가 없음).

## 결정 기록

- 시작 점검(lead가 사용자 승인, 2026-11-13): PoC 1·2·3이 실패하면 멈추고 사용자에게 묻는다. probe는 `app/runtime/clipboard.ts`로 클립보드를 저장하고 되돌린다. 격리 앱 창이 사용자 작업 중에 떠도 된다.
- 제품 결정은 design.md '사용자 결정'과 '초안 요청'에 있다. 새로 물을 것은 없다.
- conductor 재량 — `MAX_COPY_TEXT` 값과 사각형 상한 값: design.md가 `/tdd`에서 정한다고 했으므로 구현 워커가 정하고 handoff에 근거를 적는다.
- conductor 재량 — PoC와 구현을 같은 워커에 순서대로 맡긴다: 모든 작업이 같은 파일(`canvasScript.ts`, `CanvasController.ts`)을 바꿔 병렬로 나눌 수 없고, PoC 관찰을 구현이 바로 쓴다.
- conductor 재량 — 작업 7(`/verify`)과 8(문서 승격)은 conductor가 통합 뒤 직접 한다. DESIGN.md 측정값은 작업 5(`/design-sync`) 워커가 쓴다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | tasks 1 (PoC) | `design.md` 'PoC 의존' 결과, `.scratch/runtime-test/canvas-text-copy/` | 없음 | Opus high — 실제 앱에서 OOPIF 입력·클립보드·메뉴 동작을 판단하고, 실패 시 대체 경로를 설계에 반영해야 한다 | 다섯 항목 관찰이 design.md에 있음, `assertRealState` 통과, 클립보드 복원 | 대기 |
| I | tasks 3, 4, 5, 6 (`/ship bypass`: tdd → implement → design-sync → runtime-test → code-review → refactor, push 전 멈춤) | `app/src/main/canvasScript.ts`(+test), `app/src/renderer/CanvasController.ts`(+test), `canvasTool.ts`(+test), `canvasMessage.ts`(+test), 새 `canvasTextCopy.ts`(+test), `styles.css` overlay, 필요 시 `app/src/main/index.ts` Edit 메뉴, `docs/DESIGN.md` 측정값, `docs/POSTMORTEM.md`(해당 시) | P 통합 | Opus high — 입력 경로, 늦은 메시지 순서, 신뢰하지 않는 메시지 상한, hover·포커스 회귀 이력이 있는 영역이다 | `npm --prefix app test`·`typecheck`·`lint`·`build`, `/design-sync` 보고서, `/runtime-test` 보고서와 스크린숏 | 대기 |
| R | I의 diff 독립 검토 (`/code-review`, 보고만) | 없음(읽기만) | I 완료 | Opus high — 같은 이유. 구현 워커와 다른 세션이어야 한다 | 🔴 0 | 대기 |
| C | tasks 7 (`/verify`), 8 (승격과 정리) | PRODUCT, ARCHITECTURE, BACKLOG, `docs/features/canvas-text-copy/` 삭제 | R 🔴 0 | conductor | `verify.mjs` PASS, tasks 8의 `rg` 확인 | 대기 |

tasks 2(초안)는 develop에서 끝났다(`6a9a8e82`).

## 겹침과 순서

- P와 I는 같은 파일을 다루므로 직렬이다. I는 P가 통합된 뒤 같은 워커에 새 Task로 보낸다.
- 링크 1(`cli/`, `eval/`)·링크 2(`app/src/main/conversation/`, 스레드 UI, `ds/surfaces.css`)와 코드 파일이 겹치지 않는다. 겹쳐야 하면 lead에게 먼저 알린다.
- GUI probe는 짧게 돌린다. 다른 링크와 같은 순간에 앱 창을 띄운 일이 있으면 PR 본문에 적는다.

## 진행 기록
