# renderer-audit 오케스트레이션

- 출처: `docs/features/audit-261126/report.md` (audit-loop 라운드 1)의 renderer 발견. 원자료는 메인 checkout의 `.scratch/audit/261126-r1/`(읽기 전용).
- 시작 해시: `08ec857c66c809cb98547bd50ea53288d676e5f6` (origin/develop)
- 통합 브랜치: `feat/renderer-audit` (리드가 만들었다)
- Orca run: `run_ea250a7cba5f`. 워커 worktree: `ra-a1`, `ra-c`, `ra-d1`, `ra-d2`, `ra-e` (`feat/renderer-audit` 기준 new-child)
- 이 디렉터리는 PR 전에 지운다.

## 결정 로그

- 사용자에게 묻지 않는다(리드 지시). 결정이 필요한 부분은 고치지 않고 PR 본문 "Needs a user decision"에 남긴다.
- M10: 숨겨진 root의 canvas 기억을 남길지는 미결정이다. 제거 판정을 필터하지 않은 목록 기준으로 바꾸는 데까지만 고친다. — 리드 지시
- M13: `app/src/main/folderStore.ts`는 main-audit 소유(main 최상위 파일)다. renderer만으로 고칠 수 없으면 그 부분을 미루고 리드와 조율한다. — conductor's call, 리드 지시의 소유 경계
- W3-leftovers-2의 `cli/internal/export/viewer/player.js` 변경은 cli-audit 소유와 겹친다. 손대면 리드에게 알린다. — 리드 지시
- `threadItems.ts`, `ConversationThread.tsx`는 conversation-audit 소유라 어느 배치도 건드리지 않는다. — 리드 지시
- 의심 표시 발견(M12, M18, C-G3-3, B-G3-1, W2-renderer-canvas-1)은 실패하는 테스트나 짧은 probe로 먼저 확인하고, 재현되지 않으면 고치지 않고 PR 본문에 적는다. — 리드 지시
- `app/src/renderer/dockedSupport.test.ts:48` mock의 `get: vi.fn()`은 main-audit이 지운다. 이 run은 그 줄을 건드리지 않는다. — 리드 통지
- 워커는 모두 Claude 계열이다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A1 셸 상태 | M1, M10(제거 판정만), M11, M13, W2-shell-6 | `App.tsx`, `afterRemoved.ts`, `overviewRun.ts`, `projectStep.ts`, `projectRow.ts`(+test), 그 테스트 | 없음 | Opus high — ui-state 병합·제거 정리는 사용자 데이터 손실과 postmortem 재발 지점 | vitest 관련 테스트, typecheck, lint | 진행 중 (`ctx_284ccf17e460`) |
| A2 포커스·seen | M3, M12(`App.tsx`·`AgentUsageButton.tsx` 부분), M18, C-G3-4 | `App.tsx`, `homeRun.ts`, `canvasRun.ts`, `overviewRun.ts`, `ProjectSetupDialog.tsx`, `AgentUsageButton.tsx` | A1 통합(같은 `App.tsx`·`overviewRun.ts`) | Opus high — 활성화 포커스·seen 재전송은 비동기 경합 | 같음 | 대기 |
| C 대화·컴포저 | M19, C-G3-3, M-G3-3+M-G2-6, M-G3-6, W2-renderer-conversation-1 | `ProjectOverview.tsx`, `HomeComposerView.tsx`, `homeComposer.ts`, `CanvasConversationPanel.tsx`, `conversationStrip.ts`, `SettingsAbout.tsx`, `canvasCapture.ts`, `DockedComposer.tsx`, `conversationList.ts`, `overviewConversation.ts`, `conversationStore.ts` | 없음 | Opus medium — main 모듈 import 경계 판단이 필요하나 범위가 좁다 | 같음 | 진행 중 (`ctx_d4658cfb6956`) |
| D1 캔버스 | C-G3-7+W2-renderer-canvas-2, C-G3-8, C-G3-9, W2-renderer-canvas-1, W2-renderer-canvas-4 | `CanvasController.ts`, `canvasPicker.ts`, `frameDrawer.ts`, `dockedBuddyShell.ts`, `Doany.tsx`, 해당 DESIGN 문구 | 없음 | Opus high — 캔버스 로딩 경합과 GL 공유는 회귀 위험이 크다 | 같음 + `dockedBuddyGolden.mjs --check`, `doanyGolden.mjs --check` | 진행 중 (`ctx_59af175d7505`) |
| D2 prototype·이름 | B-G3-1, M-G3-4, W2-renderer-canvas-5, M12(prototype 창 부분), W3-leftovers-2 | `renderer/prototype/*`, `main/prototype/windowState.ts`, `canvasTree.ts`, `canvasView.ts`, `agentIndicator.ts`, `cli/internal/export/viewer/player.js` | 없음 | Opus medium — 경계 상한과 공용 함수 추출, 판단은 중간 | 같음 + `go test ./...`(player.js) | 진행 중 (`ctx_6a98fa9f2117`) |
| E CSS·Settings | W3-leftovers-1, W2-renderer-canvas-6, C-G3-5, L-G3-3 | `styles.css`, `ds/*.css`, 그 밖의 renderer CSS, `ProjectSettingsPage.tsx`, `SettingsMcpConnectors.tsx` | 없음 | Sonnet high — 기계적 CSS 추가가 많고 TSX 두 건은 국소적 | 같음 | 진행 중 (`ctx_f66c7b936461`) |

## 겹침과 순서

- 1차 병렬: A1, C, D1, D2, E. 파일 소유가 겹치지 않는다.
- A2는 A1 통합 뒤 같은 워커에 새 Task로 보낸다(`App.tsx`·`overviewRun.ts` 공유). M12의 prototype 창 부분은 `PrototypeWindow.tsx`를 가진 D2가 맡는다.
- 소유 밖 파일이 필요하면 워커는 그 항목을 미루고 handoff에 적는다.
