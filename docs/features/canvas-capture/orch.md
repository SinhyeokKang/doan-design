# canvas-capture — orch

원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261105](../chain-261105/chain.md) 링크 1.

- 시작 hash: `398fb552`(origin/main)
- 통합 branch: `feat/canvas-capture`
- 지휘자: Claude Code(Opus), worktree `/Users/sinhyeok/orca/workspaces/doan-design/canvas-capture-orch`

## 결정 기록

- 사람에게 물을 열린 점은 없다. 해석이 갈린 점은 design '결정' 1–11에 사람이 정해 두었다.
- C1 PoC와 구현 배치를 함께 시작한다(지휘자 판단 — C1이 (a)·(b)에서 실패해도 바뀌는 곳은 main의 캡처 길(`capturePage`)과 그 뒤의 연결뿐이고, 순수 함수·컨트롤러·저장 규칙은 그대로다. 실패하면 design 결정 1을 사람에게 다시 묻고, M·U 배치를 멈춘다).
- C1은 사람 없이 도는 격리 probe다. 체인 파일의 "PoC 없음"은 사람이 필요한 PoC가 없다는 뜻으로 읽는다(지휘자 판단 — tasks C1의 검증이 격리된 실제 앱 probe다).
- D1(초안)은 이미 main에 있다(`.doan/canvases/canvas-capture.html`, 체인 시작 점검에서 확인). 할 일이 없다.

## Codex 사용

- 링크 시작 때 Orca Codex 계정의 주간 사용량(rollout `rate_limits`, `window_minutes: 10080`): 26% 사용(2026-11-05 01:31 기준). 모델 목록에 `gpt-6-astra`, `gpt-6.1-sol`이 있다.
- 범위: 구현 배치 리뷰(K·M·U)를 Codex Astra medium이 한다(다른 계열의 독립 리뷰). 구현은 Claude가 한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| P | C1 | `.scratch/canvas-capture/`, tasks.md 'P 결과'는 지휘자가 옮김 | 없음 | Claude Opus medium — 격리 앱 probe와 판정. 코드는 안 바꾸지만 (a)·(b) 판정이 design 결정 1을 좌우한다 | 'P 결과'에 (a)–(e) 판정과 스크린샷 경로 | 대기 |
| K | A1, C2 | `app/src/renderer/canvasCapture.ts`(새)·`canvasCapture.test.ts`, `canvasTool.ts`·`canvasTool.test.ts`, `CanvasController.ts`·`CanvasController.test.ts` | 없음 | Claude Opus high — 포인터·레이어 순서·reload·blur의 생명 주기. 틀리면 선택 클릭이 새거나 레이어가 겹친다 | `npm --prefix app test`(해당 테스트 red→green 기록), typecheck | 대기 |
| M | A2, A3, B1 | `homeComposer.ts`·`homeComposer.test.ts`, `app/src/main/attachments.ts`·`attachments.test.ts`, `app/src/main/index.ts`, `senderAllowed.ts`(+test), `app/src/preload/index.ts` | 없음 | Claude Sonnet high — design에 함수·채널이 정해져 있어 판단은 적지만, IPC 신뢰 경계와 저장 정리가 있다 | `npm --prefix app test`, typecheck | 대기 |
| U | E1, E2 | `CanvasTools.tsx`(+test), `App.tsx`·App 테스트, `CanvasConversationPanel.tsx`, `conversationStore.ts`(+test), `styles.css`, `ds/controls.test.ts` | K, M 통합 | Claude Opus high — App 연결, 상한 경쟁, 칩 확정, 패널 펼침과 포커스 | `npm --prefix app test`, typecheck, build | 대기 |
| S | F2, F1 | design-sync가 고치는 앱 파일, `docs/DESIGN.md`, `.scratch/` 증거 | U 통합 | Claude Opus medium — computed style 비교와 실제 앱 probe. F2로 맞춘 뒤 F1을 한다 | `/design-sync` 보고서, `/runtime-test` 보고서 | 대기 |
| 지휘자 | F3, Z1 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, feature 디렉터리 삭제 | S 통합 | — | 통합 HEAD `/verify`, `/doc-check`(대상 문서) | 대기 |

리뷰: K·M·U 각각 Codex Astra medium 독립 리뷰(`/code-review`, 보고만). 🔴가 0이 될 때까지 소유 작업자에게 고칠 것을 보낸다.

## 파일 겹침과 순서

- 1차(병렬): P, K, M. 서로 파일이 겹치지 않는다. P는 앱 코드를 바꾸지 않는다.
- 2차: U. `App.tsx`가 K의 `capturing` 상태와 `captureAvailability`, M의 preload `captureCanvas`와 칩 이름을 쓴다. E1과 E2가 모두 `App.tsx`를 고치므로 한 배치다.
- 3차: S. 구현이 다 들어간 뒤 초안과 비교하고 실제 앱에서 확인한다. GUI probe는 P와 S만 하며 동시에 돌지 않는다(P는 1차, S는 3차).
- 마지막: 지휘자가 F3(통합 HEAD `/verify`)과 Z1(문서 승격, 디렉터리 삭제)을 한다.

## 항목 대응

C1→P, D1→(main에 있음), A1→K, A2→M, A3→M, B1→M, C2→K, E1→U, E2→U, F1→S, F2→S, F3→지휘자, Z1→지휘자. 주인 없는 항목 0.
