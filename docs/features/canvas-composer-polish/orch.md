# canvas-composer-polish — orch

- 원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md), 초안 `.doan/canvases/canvas-composer-polish.html`(design '사용자 확정').
- 체인: [chain-261104](../chain-261104/chain.md) 링크 2. 상시 권한(자기 PR 병합, Codex 작업자 허용, 멈추지 않고 진행)은 그 파일을 따른다.
- 시작 hash: `d4971759`(main). 통합 브랜치: `feat/canvas-composer-polish`.

## 결정 기록

- 열린 결정 없음. feature 문서가 모든 점을 정했다(design '사용자 확정', 각 항목의 '사용자 결정').
- 작업자 모델: Claude만 쓴다(지휘자 판단). `~/.codex/models_cache.json`에 orchestrate §0의 Astra·Sol id가 없고(gpt-6-luna, gpt-5.6-terra, gpt-5.6-luna), 링크 1도 리뷰를 Claude에 맡겼다. Codex 사용 범위: 없음.
- A의 순수 함수를 한 커밋으로 묶는 tasks의 커밋 단위 대신, 배치마다 자기 순수 함수와 배선을 커밋한다(지휘자 판단 — 배치를 나눠 병렬로 돌리기 때문).
- T1 probe는 PRE 배치가 먼저 하고 결과를 tasks.md T1과 design 1번에 적는다.
- C1 `/design-sync`는 모든 배치를 통합한 뒤 별도 작업자(SYNC)가 한다. C2 `/runtime-test`(공용 로그인 프로필을 그 자리에서 사용)·C3 `/verify`·Z1 승격은 지휘자가 통합 HEAD에서 한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| ADM | A3, B3 | `main/conversation/project.ts`·`service.ts`(+테스트), `renderer/homeRun.ts`·`homeConversations.ts`·`homeComposer.ts`·`dockedRules.ts`·`ProjectOverview.tsx`(+테스트) | 없음 | Opus high — admission·promotion은 겹친 턴의 동시성 판단이 많고 틀리면 대화를 잘못 archive한다 | `npm --prefix app test`, typecheck | 대기 |
| SEND | A2, B2 | `renderer/conversationStore.ts`·`ConversationThread.tsx`·`threadItems.ts`·`queueFocus.ts`·`CanvasConversationPanel.tsx`·`overviewRun.ts`·`DockedComposer.tsx`(+테스트), `conversation:queue` 응답(main IPC·preload) | 없음 | Opus high — 이벤트·IPC 응답 도착 순서와 큐 복귀 규칙이 까다롭다 | `npm --prefix app test`, typecheck | 대기 |
| TOOL | B4, A4, B5, A5, B6 | `renderer/CanvasTools.tsx`·`App.tsx`·`rightPanelOpen.ts`·`canvasPicker.ts`·`CanvasController.ts`·`ShellSidebar.tsx`·`CanvasConversationList.tsx`·`RightPanel.tsx`·`conversationDelete.ts`·`ConversationDeleteDialog.tsx`·`listKeyboard.ts`, `main/index.ts`·`menuState.ts`(+테스트) | 없음 | Opus high — 픽 상태·포커스 복귀·메뉴 고아 정리가 여러 경로에 걸친다. App.tsx를 공유해 Picker·Export·Delete를 한 작업자가 순서대로 한다 | `npm --prefix app test`, typecheck, build | 대기 |
| PRE | T1, A1, B1 | `renderer/ComposerParts.tsx`·`HomeComposerView.tsx`, 새 순수 함수 파일(+테스트), tasks.md T1 줄·design 1번. 미룸: `DockedComposer.tsx` 배선(SEND 뒤), 캔버스 신호의 `App.tsx`·`CanvasController.ts`·`canvasScript.ts`/`canvasMessage.ts` 배선(TOOL 뒤) | T1 probe | Opus medium — Radix 포커스와 iframe 신호 판단이 있지만 범위가 좁다 | `/runtime-test` probe(T1), `npm --prefix app test`, typecheck | 대기 |
| SYNC | C1 | 초안 대비 구현 수정(통합 뒤 해당 화면 파일), `docs/DESIGN.md` 측정값 | 모든 배치 통합 | Opus medium — 측정·수정 반복이고 판단은 초안이 정한다 | `/design-sync` 보고 | 대기 |
| 리뷰 | 배치마다 | 보고만 | 해당 배치 완료 | Sonnet high(SEND·ADM·TOOL은 Opus medium) — diff 난도에 맞춤 | `/code-review` 보고 | 대기 |

## 겹침과 순서

- 1차 병렬: ADM, SEND, TOOL, PRE(미룸 항목 제외). 네 배치의 파일 소유는 겹치지 않는다. `ProjectOverview.tsx`는 ADM 소유이고 SEND는 고치지 않는다(필요하면 미룸으로 보고).
- PRE의 미룸 항목: SEND 통합 뒤 `DockedComposer.tsx`, TOOL 통합 뒤 캔버스 신호 배선을 새 Task로 보낸다.
- GUI probe: 1차에서는 PRE의 T1만 앱을 띄운다. 통합 뒤 SYNC와 지휘자 C2는 겹치지 않게 차례로 한다.
- 통합 뒤 C3 `/verify`, Z1 승격, PR, 병합.

## 진행 기록
- 2026-11-05 intake: tasks의 체크 항목은 모두 한 배치에 속한다(T1·A1·B1 PRE, A2·B2 SEND, A3·B3 ADM, A4·A5·B4·B5·B6 TOOL, C1 SYNC, C2·C3·Z1 지휘자, U0 완료). B5의 `exportViewer.test.ts` 맞춤은 링크 3(export-viewer-chrome)이 나중에 병합하므로 링크 3이 한다(지금 main의 그 테스트는 `CanvasTools.tsx`를 비교하지 않는다).
