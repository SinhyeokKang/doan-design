# orch — /audit-loop 라운드 2 r2-renderer

- 출처: `docs/features/audit-261126-2/report.md`의 R2-M4, R2-M5, 그리고 후속 목록의 renderer 항목. 원본 증거: 메인 checkout `.scratch/audit/261126-r2/`(renderer-canvas·renderer-shell·renderer-conversation·gaps·main-canvas).
- 시작 hash: `1078f3a67` (origin/develop과 같다)
- 통합 브랜치: `feat/r2-renderer` (lead가 만들었다). PR 전에 이 디렉터리를 지운다.
- 범위 밖: R2-gaps-4(palette token 사용)는 사용자 결정 항목이다.

## 결정 로그

- 사용자에게 묻지 않는다(lead 지시). 결정이 필요한 부분은 고치지 않고 PR 본문 "Needs a user decision"에 남긴다.
- conductor's call — 워커 모델: Claude만 쓴다(AGENTS.md 'Runtime differences', lead 지시).
- conductor's call — postmortem 항목은 여러 배치가 같은 월 파일 맨 위를 고치므로, 배치마다 handoff에 초안을 쓰고 통합 뒤 한 워커(B2)가 한 번에 기록한다.
- conductor's call — 의심 항목(R2-renderer-conversation-1, R2-renderer-canvas-2·3, R2-renderer-shell-1, R2-gaps-5, R2-main-canvas-1)은 실패하는 테스트로 먼저 확인한다. native 활성화 결과는 jsdom에서 `document.hasFocus()` false → window `focus` 재현 테스트로 대신한다(2026-11-26 재발 수정과 같은 방식). 재현되지 않으면 버리고 PR 본문에 쓴다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | R2-M4(R2-renderer-canvas-1), R2-renderer-canvas-2 | `CanvasController.ts`, `selection.ts`, 그 테스트 | 없음 | Opus high — seq 두 채널과 리로드 순서, 회귀가 선택을 막는다 | 배치 테스트 + verify gate | 대기 |
| B1 | R2-M5 중 R2-renderer-conversation-1 | `CanvasConversationPanel.tsx`, `ConversationThread.tsx`, `DockedComposer.tsx`, `HomeComposerView.tsx`, `ProjectOverview.tsx`, 그 테스트 | 없음 | Opus high — 활성화 순서, 재현 테스트 설계가 필요하다 | 배치 테스트 + verify gate | 대기 |
| B2 | R2-M5 중 R2-renderer-canvas-3, R2-renderer-shell-1, R2-gaps-5; R2-renderer-shell-2; 끝으로 postmortem 기록 | `App.tsx`, `PrototypeClosedFocus.tsx`, `prototypePlay.ts`, `SettingsPage.tsx`, `SettingsAgents.tsx`, `Onboarding.tsx`, `ProjectSettingsPage.tsx`, 그 테스트; `CanvasController.ts`는 A 통합 뒤(지연 항목) | A(CanvasController 부분만) | Opus high — 여러 화면의 포커스 hand-off, App.tsx 공유 | 배치 테스트 + verify gate | 대기 |
| C | R2-renderer-canvas-4, R2-renderer-conversation-2, R2-renderer-conversation-3, R2-main-canvas-1, R2-gaps-1, R2-gaps-2, R2-gaps-3 | renderer `thumbnails.ts`, `revealDecision.ts`, `homeConversations.ts`, `canvasConversationRows.ts`, `prototype/host.ts`, `styles.css`, `ds/surfaces.css`, `ProblemOverlay.tsx`, `forcedColors.test.ts`, 그 테스트 | 없음 | Opus medium — 작은 수정 여럿, host 검증과 썸네일 lifecycle에 판단이 조금 든다 | 배치 테스트 + verify gate | 대기 |

## 파일 겹침과 순서

- A와 B2는 `CanvasController.ts`(`moveBubbleFocus`)가 겹친다. B2는 그 부분을 지연 항목으로 남기고, A를 통합한 뒤 새 Task로 받는다.
- `App.tsx`는 B2만 고친다. B1·C가 `App.tsx`를 고쳐야 하면 지연 항목으로 남긴다.
- `app/src/main/`은 r2-main conductor 소유다. 고쳐야 하면 lead에게 알린다.
- A, B1, B2, C는 병렬로 돈다.
