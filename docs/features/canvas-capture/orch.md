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
- P 결과: C1 (a)·(b) 통과, design 결정 1 유지(`b3e9a81f`). 사람 눈의 깜빡임과 다른 배율 모니터는 미검증이고 F1에서 다시 본다.
- M 리뷰(Codex Astra medium, `ctx_e00a723415db`): 🔴 0, 🟡 1(M-1: 저장 실패 뒤 정리 테스트 없음). M의 계획과 다른 점 4개(공유 save로 `addPasted`가 throw 대신 `unreadable`, `capturePage` reject를 `capture_failed`로, 양 끝 반올림 등)는 리뷰어가 수용했다. M-1은 M 작업자에게 고칠 것으로 보냈다.
- K의 계획과 다른 점(지휘자 판단): 드래그 중 Esc는 캡처 모드를 바로 끝내되 레이어는 그 포인터를 놓을 때 내린다 — ARCHITECTURE §3 'Input'(레이어를 먼저 내리면 `pointerup`이 iframe의 선택 클릭이 된다)을 따르므로 받는다. 다른 캔버스로 가는 링크와 `setCanvasPage(false)`도 캡처 모드를 끝낸다 — spec 7(Overview, modal)과 design '캔버스 전환'에 해당하므로 받는다.
- 접힌 패널을 펼치는 때(지휘자 판단): `captureCanvas`의 답이 온 뒤에 펼친다. 칩을 넣는 순간 펼치면 `capturePage`가 픽셀을 읽기 전에 `.area`가 좁아져 다른 화면을 찍는다(K 인계). 답은 C1 측정으로 약 60 ms 뒤에 오므로 design 결정 10("이미지가 composer에 들어갈 때 펼친다", 고르는 동안 보드 폭이 바뀌지 않게 함)의 뜻 안에 있다. Z1에서 PRODUCT에 이 순서로 적는다.
- K 리뷰(Codex Astra medium, `ctx_1f59d4c13a42`): 🔴 0, 🟡 1(인계 문구: 두 rAF 뒤 펼침도 된다는 제안 — 위 지휘자 판단으로 해소), ⚪ 1(드래그 중 페이지를 떠나는 테스트) → K가 테스트를 더했다(`5fb541cb`).
- U 리뷰(Codex Astra medium, `ctx_587147b03200`): 🔴 0, 🟡 1(U-1: 캡처 모드 중 Resume이나 레거시 외부 대화로 바뀌어도 첨부함 — design 결정 4 위반), ⚪ 1(리뷰 기준 차이, 할 일 없음) → U가 놓을 때 `captureAvailability`를 다시 계산하게 고쳤다(`277f54e5`, `5e790145`). U의 다른 차이 7개(답 뒤 펼침은 같은 composer일 때만, 눌린 캡처 버튼은 늘 끌 수 있음, `composerFixed`·`settleChips` 추출, checking 칩 이름 `canvas-capture-checking.png` 등)는 리뷰어가 수용했다. 안내 줄은 어느 task에도 없어 U에 맡겼다.
- U-1에 `/postmortem`은 쓰지 않는다(지휘자 판단 — main에 들어가기 전 리뷰에서 잡은 결함이고 회귀가 아니다).
- 배치 작업자 편집 허가: U가 `CanvasAgent.test.tsx`(도구 버튼 수 3→4)와 App 테스트 mock의 `onCapture`를 고쳤다(새 버튼을 따라가는 변경).

## Codex 사용

- 링크 시작 때 Orca Codex 계정의 주간 사용량(rollout `rate_limits`, `window_minutes: 10080`): 26% 사용(2026-11-05 01:31 기준). 모델 목록에 `gpt-6-astra`, `gpt-6.1-sol`이 있다.
- 범위: 구현 배치 리뷰(K·M·U)를 Codex Astra medium이 한다(다른 계열의 독립 리뷰). 구현은 Claude가 한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| P | C1 | `.scratch/canvas-capture/`, tasks.md 'P 결과'는 지휘자가 옮김 | 없음 | Claude Opus medium — 격리 앱 probe와 판정. 코드는 안 바꾸지만 (a)·(b) 판정이 design 결정 1을 좌우한다 | 'P 결과'에 (a)–(e) 판정과 스크린샷 경로 | 완료(`b3e9a81f`, worktree 지움) |
| K | A1, C2 | `app/src/renderer/canvasCapture.ts`(새)·`canvasCapture.test.ts`, `canvasTool.ts`·`canvasTool.test.ts`, `CanvasController.ts`·`CanvasController.test.ts` | 없음 | Claude Opus high — 포인터·레이어 순서·reload·blur의 생명 주기. 틀리면 선택 클릭이 새거나 레이어가 겹친다 | `npm --prefix app test`(해당 테스트 red→green 기록), typecheck | 통합(`a031b338`, `76fb077e`, `5fb541cb`) |
| M | A2, A3, B1 | `homeComposer.ts`·`homeComposer.test.ts`, `app/src/main/attachments.ts`·`attachments.test.ts`, `app/src/main/index.ts`, `senderAllowed.ts`(+test), `app/src/preload/index.ts` | 없음 | Claude Sonnet high — design에 함수·채널이 정해져 있어 판단은 적지만, IPC 신뢰 경계와 저장 정리가 있다 | `npm --prefix app test`, typecheck | 통합(`fa795fe7`..`e17edf58`) |
| U | E1, E2 | `CanvasTools.tsx`(+test), `App.tsx`·App 테스트, `CanvasConversationPanel.tsx`, `conversationStore.ts`(+test), `styles.css`, `ds/controls.test.ts` | K, M 통합 | Claude Opus high — App 연결, 상한 경쟁, 칩 확정, 패널 펼침과 포커스 | `npm --prefix app test`, typecheck, build | 통합(`5446625b`..`5e790145`) |
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

## 실행

- Orca run `run_d7d434cf107f`. 1차 작업자는 `792c490e`에서 갈라졌다.
- P: dispatch `ctx_02b403611d92`, worktree `canvas-capture-p`, Claude Opus medium(launch 확인).
- K: dispatch `ctx_999108be8166`, worktree `canvas-capture-k`, Claude Opus high(launch 확인).
- M: dispatch `ctx_513fceb41174`, worktree `canvas-capture-m`, Claude Sonnet high(launch 확인).
