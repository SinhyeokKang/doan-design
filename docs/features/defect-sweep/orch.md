# defect-sweep — orch

원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261107](../chain-261107/chain.md) 링크 1.

- 시작 hash: `e9e92711`(origin/main)
- 통합 branch: `feat/defect-sweep`
- 지휘자: Claude Code(Opus 5.5), worktree `defect-sweep-orch`

## 결정 기록

- 시작 점검은 체인 작성 세션이 사용자 승인을 받았다(chain.md 인계 기록 '시작 점검 승인'). R-6·M-4의 공용 프로필 실제 턴 probe는 승인됐다.
- Codex 작업자: 체인 상시 권한. 시작할 때 주간 한도(`window_minutes` 10080)는 46% 사용이었다(Orca `CODEX_HOME`의 최신 rollout). 그래서 C batch 구현과 다른 계열 리뷰 일부에 Codex를 쓴다. 주 구현은 Claude다. 사용자가 시작 직후 "토큰 걱정 ㄴㄴ", "코덱스는 매우 충분"이라고 했다(Claude 계정은 체인 중간에 바꿀 예정). 그래서 모델은 사용량이 아니라 batch 난이도로만 고른다.
- main이 움직인 뒤 문서 인용을 다시 맞췄다(지휘자 판단, 코드 확인): E3의 `invocationSummary`는 `judge.test.ts`의 테스트 helper이고, judge 쪽 판정은 `buildJudgePrompt`의 `doanDesignSkill` 요약이며 둘 다 `eval/lib/transcript.ts`의 `commandWords`·`doanPositionals`를 쓴다. C2의 `addProjects.ts`는 `app/src/main/`에 있다. 나머지 인용(D1 `readLine`, B1 `FAILURES`·`STOPPED`, C3 `BLOCKED`·`toastHeld`·`openModal` 등)은 현재 코드와 맞다.
- F·M 겹침: 둘 다 `styles.css`를 고친다(A5 strip 오류 줄, C1 Quick Open 읽는 중 행). A1이 red이면 `App.tsx`도 겹친다. 그래서 M은 F 통합 뒤에 시작한다(지휘자 판단, 체인 '순서'의 `styles.css` 메모).
- F의 A1이 red이면 F는 `App.tsx`를 고치기 전에 멈추고 보고한다(M과 겹치지 않게 지휘자가 순서를 정한다).
- R·M은 서로 겹치는 파일이 없어 병렬이다. 공용 프로필(`/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`)은 한 번에 한 앱만 열 수 있으므로 R-6·M-4의 실제 턴 probe는 지휘자에게 `question`으로 차례를 받는다.

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| C CLI | C-1, C-2 | `cli/internal/cli/active.go`·`export.go`와 그 테스트 | 없음 | Codex `gpt-6-astra` medium: 두 경계 수정이지만 D2 신호 처리는 경쟁 조건 판단이 필요하다 | `go test ./...`, `go vet ./...` | 대기 |
| T 테스트·eval | T-1, T-2, T-3 | `app/src/main/conversation/service.test.ts`, `app/src/main/shell.test.ts`(와 그 fake), `eval/scenarios/D1/presets.ts`, `eval/lib/judge.ts`, `eval/lib/transcript.ts`와 그 테스트 | 없음 | Claude Sonnet high: 테스트·판정 수정, E3 shell 해석은 판단이 조금 필요하다 | `npm --prefix app test`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` | 대기 |
| F 포커스 | F-1–F-6 | `App.settings.test.tsx`, `CanvasTools.tsx`, `ConversationThread.tsx`, `ConversationStripView.tsx`·`conversationStrip.ts`, `components/ui/tooltip.tsx`, `SettingsMcpConnectors.tsx`, `styles.css`(A5) | 없음 | Claude Opus high: Radix 이벤트 순서와 focus 이동은 틀리면 키보드 사용이 깨진다 | `npm --prefix app test`, typecheck, `/runtime-test` | 대기 |
| R 런타임 | R-1–R-6 | `threadItems.ts`, `runners.ts`, `transport.ts`·`types.ts`·`store.ts`, `ConversationThread.tsx`·`ConversationStripView.tsx`·`conversationStrip.ts`(B1), `ipc.ts`·`service.ts`, `newConversationSettings.ts`·`SettingsAgents.tsx` | F 통합 | Claude Opus high: 저장 형식(`turn.failed`)과 abort 경쟁, provider 분기 | `npm --prefix app test`, typecheck, `/runtime-test` | 대기 |
| M 앱 기타 | M-1–M-4 | `quickOpen.ts`·`QuickOpenDialog.tsx`, 등록·`folders.json` 읽기(`app/src/main/` folders·shell 쪽), `openDecision.ts`·`App.tsx`(`openLink`)·`Toast.tsx`, `styles.css`(C1), `ProjectSetupDialog.tsx`·`Onboarding.tsx`(C3 toast 자리) | F 통합 | Claude Opus high: C2 저장 목록 정규화와 C3 modal 안 toast는 실제 사용자 상태와 접근성을 건드린다 | `npm --prefix app test`, typecheck, `/runtime-test` | 대기 |
| Z 통합·승격 | Z-1, Z-2 | 지휘자 | 모든 batch | 지휘자 | `verify.mjs --eval`, Z-2 grep | 대기 |

리뷰는 batch마다 다른 작업자가 `/code-review`로 한다: C는 Claude Opus high, T는 Codex `gpt-6.1-sol` medium, F·R·M은 Codex `gpt-6-astra` medium.

## 순서

1. C, T, F를 함께 시작한다(C·T는 다른 batch와 겹치지 않는다).
2. F가 통합되면 R과 M을 함께 시작한다.
3. 모두 통합되면 Z.

tasks의 체크 항목 C-1–C-2, T-1–T-3, F-1–F-6, R-1–R-6, M-1–M-4, Z-1–Z-2는 모두 위 표의 한 batch에 속한다.

## 통합 기록

(없음)
