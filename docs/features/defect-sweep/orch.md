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
| C CLI | C-1, C-2 | `cli/internal/cli/active.go`·`export.go`와 그 테스트 | 없음 | Codex `gpt-6-astra` medium: 두 경계 수정이지만 D2 신호 처리는 경쟁 조건 판단이 필요하다 | `go test ./...`, `go vet ./...` | 통합 `511793de`·`e5f3f23e` |
| T 테스트·eval | T-1, T-2, T-3 | `app/src/main/conversation/service.test.ts`, `app/src/main/shell.test.ts`(와 그 fake), `eval/scenarios/D1/presets.ts`, `eval/lib/judge.ts`, `eval/lib/transcript.ts`와 그 테스트 | 없음 | Claude Sonnet high: 테스트·판정 수정, E3 shell 해석은 판단이 조금 필요하다 | `npm --prefix app test`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` | 통합 `5d999a63`..`8ba0316f` |
| F 포커스 | F-1–F-6 | `App.settings.test.tsx`, `CanvasTools.tsx`, `ConversationThread.tsx`, `ConversationStripView.tsx`·`conversationStrip.ts`, `components/ui/tooltip.tsx`, `SettingsMcpConnectors.tsx`, `styles.css`(A5) | 없음 | Claude Opus high: Radix 이벤트 순서와 focus 이동은 틀리면 키보드 사용이 깨진다 | `npm --prefix app test`, typecheck, `/runtime-test` | 통합 `c1506634`..`4d883f20`(재리뷰 진행) |
| R 런타임 | R-1–R-6 | `threadItems.ts`, `runners.ts`, `transport.ts`·`types.ts`·`store.ts`, `ConversationThread.tsx`·`ConversationStripView.tsx`·`conversationStrip.ts`(B1), `ipc.ts`·`service.ts`, `newConversationSettings.ts`·`SettingsAgents.tsx` | F 통합 | Claude Opus high: 저장 형식(`turn.failed`)과 abort 경쟁, provider 분기 | `npm --prefix app test`, typecheck, `/runtime-test` | 진행 |
| M 앱 기타 | M-1–M-4 | `quickOpen.ts`·`QuickOpenDialog.tsx`, 등록·`folders.json` 읽기(`app/src/main/` folders·shell 쪽), `openDecision.ts`·`App.tsx`(`openLink`)·`Toast.tsx`, `styles.css`(C1), `ProjectSetupDialog.tsx`·`Onboarding.tsx`(C3 toast 자리) | F 통합 | Claude Opus high: C2 저장 목록 정규화와 C3 modal 안 toast는 실제 사용자 상태와 접근성을 건드린다 | `npm --prefix app test`, typecheck, `/runtime-test` | 진행 |
| Z 통합·승격 | Z-1, Z-2 | 지휘자 | 모든 batch | 지휘자 | `verify.mjs --eval`, Z-2 grep | 대기 |

리뷰는 batch마다 다른 작업자가 `/code-review`로 한다: C는 Claude Opus high, T·F·R·M은 Codex `gpt-6-astra` medium. T는 처음에 Sol로 정했으나 E2 재현 방식과 E3 셸 해석에 판단이 필요해 Astra로 바꿨다.

## 순서

1. C, T, F를 함께 시작한다(C·T는 다른 batch와 겹치지 않는다).
2. F가 통합되면 R과 M을 함께 시작한다.

작업 중 결정(지휘자): F의 A2는 `CanvasController`의 공개 메서드 한 줄과 `App.tsx`의 `<CanvasTools>` prop 하나를 고친다(M은 아직 시작 전이라 겹치지 않는다). F-3·F-5의 jsdom 문구는 ARCHITECTURE §7 'Home tests without a DOM'에 맞게 DOM 없는 테스트와 F-6 probe로 고쳤다(`5dff3447`).
3. 모두 통합되면 Z.

tasks의 체크 항목 C-1–C-2, T-1–T-3, F-1–F-6, R-1–R-6, M-1–M-4, Z-1–Z-2는 모두 위 표의 한 batch에 속한다.

## 통합 기록

- **C** (작업자 Codex `gpt-6-astra` medium, 리뷰 Claude Opus high, 1라운드): `dba13d0c`·`0357ce7c` → `511793de`·`e5f3f23e`. 리뷰 🔴 0·🟡 0·🟢 6(`.scratch/review-C.md`). 통합 HEAD에서 `go test ./cli/...`, `go vet ./...` 통과. 계획과 다른 점(지휘자 승인): D2 테스트를 위해 `writeExport` 본문을 `writeExportWith`로 빼냈다(동작 그대로). 기존 `TestActiveLineAtCapIsRead`는 줄바꿈을 빼고 65,536 byte를 채워서, 줄바꿈을 포함한 상한에 맞게 고쳤다. Z-2에 넘길 것: 앱의 export timeout(`app/src/main/cli.ts` `runExport`)은 SIGKILL이라 임시 파일이 남을 수 있다(결정 범위 안). 신호로 끝난 export의 exit code(128+signal)는 ARCHITECTURE §12 exit code 표에 사실로 적는다. 작업 worktree `ds-C`는 지웠고 branch `SinhyeokKang/ds-C`(`0357ce7c`)는 남겼다.
- **F** (작업자 Claude Opus high, 리뷰 Codex `gpt-6-astra` medium): 1차 리뷰 🔴 0·🟡 2(`.scratch/review-F.md`). 툴팁 Esc가 composer `/` 목록보다 먼저 capture·pick을 끝내던 문제와, A2 red가 동작이 아니라 TypeError였던 문제를 고쳤다. 지휘자 판단으로 strip의 Stop도 '다음 누름'에 넣어 오류 줄을 지운다. `aria-disabled`는 `true`일 때만 비활성으로 본다. `7ae9efe3`..`145fb3c4` → `c1506634`..`4d883f20`. 작업자 쪽 gate: typecheck, `npm test`, `verify.mjs` 통과, F-6 probe 24/24, 실제 상태 변화 없음. A1은 green이라 `App.tsx`를 고치지 않았다. 바뀐 Esc 처리(`toolbarEscape`가 `preventDefault`를 감싼다)는 재리뷰를 받는 중이다. R·M이 기다리지 않도록 재리뷰와 병렬로 통합했다. 고칠 것이 나오면 R·M이 소유하지 않은 파일이므로 그 위에 더한다. probe 한계: A3–A5는 가짜 대화 IPC를 썼고, A6는 실제 앱에서 다섯 컨트롤 가운데 하나만 봤다. POSTMORTEM 후보 2건은 handoff-F에 있고 Z-2에서 쓴다.
- **F 재리뷰**(`.scratch/review-F2.md`): 🔴 0·🟡 1·⚪ 2. 🟡은 canvas iframe에 focus가 있을 때 열린 툴바 툴팁을 Esc가 닫지 않는 경로다. batch 전부터 있던 동작이고, canvas 단계는 한 번 실행된다. 지휘자 판단으로 이번 범위에 넣지 않고 Z-2에서 BACKLOG 'Known defects'에 적는다. ⚪1(`toolbarEscape`가 기대는 Radix 순서를 설치본 확인 테스트로 고정)은 F에 후속 2로 보냈다.
- **F 후속 2**: `f167b7db` → 통합. `toolbarEscape`가 기대는 Radix 순서를 설치본 확인 테스트로 고정했다(동작 변화 없음). F 완료. 작업 worktree `ds-F`는 지웠고 branch `SinhyeokKang/ds-F`(`f167b7db`)는 남겼다. 증거는 지휘자 `.scratch/F/`에 복사했다.
- **T**: 리뷰 3라운드째다. E1·E2는 1라운드에서 끝났다. E3(`commandWords`의 셸 해석)는 리뷰마다 새 반례가 나와, 2라운드부터 지휘자 규칙 하나로 정리했다: 명령마다 끝까지 읽었는지 표시하고, 끝까지 읽지 못한 명령은 증거가 되지 못하며 preset 허용·본문 판정은 그 옆에서 실패한다. 3라운드는 이 규칙을 whitelist로 넓힌다(`for` 밖의 셸 제어문은 모두 불완전).
- **T** 완료(작업자 Claude Sonnet high, 리뷰 Codex `gpt-6-astra` medium 3회): `634f3908`..`bdba9d43` → `5d999a63`..`8ba0316f`. 리뷰 1: 🔴 1·🟡 3(`.scratch/review-T.md`), 리뷰 2: 🔴 1·🟡 2(`review-T2.md`), 리뷰 3: 🔴 1(`review-T3.md`). 모두 반례를 재현 테스트로 고정한 뒤 고쳤다. 3라운드 수정(`for` 밖의 셸 제어문을 만나면 그 명령을 불완전으로 표시)은 증거를 더 적게 내는 쪽으로만 바뀌므로, 지휘자 판단으로 4차 리뷰 없이 통합했다. 통합 HEAD에서 `node --test 'eval/**/*.test.ts'` 321/321, `node eval/run.ts --self-test` PASS(44 scenarios). E3로 바뀐 판정: 값을 알 수 없는 변수나 따라가지 못한 셸 구문이 있는 명령은 증거가 되지 못하고, D1–D13의 preset 허용·본문 판정은 그 옆에서 실패한다. `while`·`if` 등은 해석하지 않는다. Z-2에서 USABILITY-EVAL에 적는다. 작업 worktree `ds-T`는 지웠고 branch `SinhyeokKang/ds-T`(`bdba9d43`)는 남겼다. 증거는 `.scratch/T/`에 있다.
- **M 리뷰 1**(Codex `gpt-6-astra` medium, `.scratch/review-M.md`): 🔴 1·🟡 2. 🔴은 C2가 저장된 root를 real path로 읽을 때 옛 spelling에 묶인 `canvas-seen.json`·`ui-state.json` 상태를 옮기지 않는 문제다. 업그레이드하면 보지 않은 변경 표시와 열린 자리·접힌 그룹 기억이 사라진다. 지휘자 판단(ARCHITECTURE §7 'Seen canvases'는 root가 목록에서 빠질 때만 기록을 지운다): spelling이 바뀌는 것은 목록에서 빠지는 것이 아니므로 상태를 옮긴다. 두 spelling에 다 상태가 있으면 key마다 real path 쪽을 쓰고, alias는 real path에 없는 것만 채운다. 🟡: 합쳐진 항목 가운데 수동 등록이 하나라도 있으면 수동으로 남긴다. modal portal을 오갈 때 toast의 hover·focus 멈춤을 다시 계산한다. 문구: `Doan’s`는 PRODUCT의 UI 문구처럼 굽은 아포스트로피로 둔다(지휘자 판단). M에 수정 1라운드를 보냈다.
