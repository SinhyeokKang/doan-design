# main-audit 오케스트레이션

- 원천: `docs/features/audit-261126/report.md` (audit-loop 라운드 1)와 리드 브리프의 발견 목록. 원자료는 메인 체크아웃 `.scratch/audit/261126-r1/` (`maintainability-G2.md`, `lifecycle-G2.md`, `w2-proto-canvas-runtime.md`, `maintainability-G3.md`).
- 시작 해시: `08ec857c66c809cb98547bd50ea53288d676e5f6` (= origin/develop)
- 통합 브랜치: `feat/main-audit`
- 모델: 모든 워커와 리뷰어는 Claude 계열.

## 결정 기록

- 사용자에게 묻지 않는다(리드 지시). 결정된 규칙(PRODUCT·ARCHITECTURE)을 바꾸거나 사용자 쪽 사용성을 바꾸는 수정은 하지 않고 PR 본문 "Needs a user decision"에 적는다.
- M5 Locate: 옛 root에 `rootsLeft`를 그대로 적용한다. conductor's call — POSTMORTEM 2026-10-25가 "remove, replace/locate"를 같은 정리 대상으로 정했고, 정리 항목은 모두 옛 root에만 걸린다.
- M-G2-5: 앱이 CLI 판정을 따르게 한다(리드 지시). ARCHITECTURE §7 "as the CLI judges it"과 맞는다.
- M-G3-5: 세 adapter와 그것만 붙잡는 `onboarding:check` main 창 허용을 지운다(리드 지시). CLI는 소켓 v2로 check에 닿는다.
- "의심" 발견(L-G2-3, L-G2-8의 두 번째 트리거 포함, W2-PCR-2, M-G2-10, M-G2-11, M-G2-12, M-G2-13, M-G2-15, M-G2-3): 실패 테스트나 격리 probe로 먼저 확인하고, 재현되지 않으면 버리고 PR 본문에 적는다.
- 소유권 밖 파일: `app/src/main/conversation/`(conversation-audit), `agentAuth/`·`mcpConnectors/`(auth-audit), `cli/`(cli-audit, `storage.go`만 예외).
- 리드 조율 결과: M-G2-3은 이 run이 맡아 `conversation/skills.ts`와 `conversation/skills.commands.test.ts`만 고친다. M-G2-13의 Claude plaintext 목록·계정 label 쌍은 auth-audit, conversation 안의 canvas id 정규식(`store.ts`, `replyAnchor.ts`)은 conversation-audit이 맡아 이 run에서 뺀다.

- postmortem: 워커는 `docs/postmortem/2026-11.md`를 직접 고치지 않고 항목 초안을 handoff에 적는다. 같은 월 파일 맨 위에 여러 워커가 쓰면 통합 때 충돌하므로 conductor가 모아 한 번에 커밋한다. conductor's call.
- 공유 게이트(`verify.mjs`)와 실앱 probe: 워커는 대상 테스트·typecheck·lint만 돌리고, 통합 HEAD에서 conductor가 공유 게이트를 한 번 돌린다. 실앱 확인이 필요한 동작은 워커가 handoff에 적고 conductor가 통합 뒤 판단한다. conductor's call — 병렬 워커 5개가 전체 게이트와 GUI probe를 겹쳐 돌리지 않게 한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | M5, M-G2-14, M-G2-13 메뉴 화면 목록, W2-PCR-2 | `main/index.ts`(+test), `main/shell.ts`(주석), `main/shellActivity.ts`(+test), `main/menuState.ts` | 없음 | Opus medium — 제거 정리 재발과 성능 측정 판단이 필요하다 | `npm --prefix app test`, typecheck, lint | 대기 |
| B | L-G2-3, L-G2-4, L-G2-8(두 트리거) | `main/watch.ts`, `main/configBridge.ts`, `main/thumbnails.ts`, `main/thumbnailQueue.ts` (+tests) | 없음 | Opus high — 파일 감시·비동기 경합 수정이라 틀리면 live reload와 썸네일이 멈춘다 | `npm --prefix app test`, typecheck, lint, L-G2-3 FSEvents probe | 대기 |
| C | M-G2-2, M-G3-5 | `preload/index.ts`, `preload/index.test.ts`, `main/senderAllowed.ts`(+test) | 없음 | Sonnet medium — 테스트 고정과 미사용 코드 제거로 기계적이다 | `npm --prefix app test`, typecheck, lint | 통합 `9d12e9274..f4ab62526`, 리뷰 1회 🔴0 🟡0 |
| D | M-G2-5, M-G2-10, M-G2-11, M-G2-12 | `main/canvasExport.ts`, `main/deepLinks.ts`, `main/folderState.ts`, `main/onboarding/projects.ts`, `main/onboarding/operations.ts`, `cli/internal/cli/storage.go`(+test), 새 `schema/fixtures` 파일 (+tests) | 없음 | Sonnet high — 문구와 판정 규칙 통합으로 동작이 바뀌지 않게 해야 한다 | `npm --prefix app test`, typecheck, lint, `go test ./...`, `go vet ./...` | 통합 `0f2bc9720..aaf72f23c`, 리뷰 1회 🔴0 🟡0, M-G2-12 재현 안 됨 |
| E | M-G2-13(메뉴 목록과 다른 conductor 몫 제외), M-G2-15, W2-PCR-1, M-G2-3 | `main/inspector.ts`, `main/installCommand.ts`, `main/prototype/conversationScope.ts`, `main/seenRecords.ts`, `main/conversation/skills.ts`, `main/conversation/skills.commands.test.ts`, `app/scripts/verifySignedPackage.mjs`, `app/scripts/releaseChecks.mjs`, 새 고정 테스트 파일 (+tests) | 없음 | Sonnet medium — 상수 고정 테스트와 스크립트 종료 코드 확인으로 기계적이다 | `npm --prefix app test`, typecheck, lint | 대기 |

## 파일 겹침과 순서

- A–E는 파일이 겹치지 않아 병렬로 돌린다. M-G2-13 메뉴 화면 목록은 `index.ts`를 고치므로 A가 맡는다.
- `restore/uiState.ts`는 renderer-audit이 고칠 수 있어 수정하지 않는다. M-G2-13의 uiState 쌍은 테스트에서 값을 import해 고정한다.

## 리뷰·통합 기록

- C: 리뷰 ⚪만. main 쪽 `design-skills` get 핸들러와 `onboarding:check` 핸들러는 이제 호출처가 없지만 남긴다. 지우려면 ARCHITECTURE §7 'Design preset reads'를 바꿔야 하므로 후속 항목으로 PR에 적는다. renderer 테스트 mock 한 토큰(`dockedSupport.test.ts`) 수정은 리드에게 알렸다.
- D: M-G2-12는 `projects.test.ts:104-117`이 이미 `storage.go` 값을 읽어 대조하므로 재현되지 않았다(probe 4건). M-G2-11 문구는 두 경로가 원래 같았고 그대로 유지했다.
- E: 리뷰 🟡1(spawn-helper·Helper app이 없으면 검사 줄이 없음, 같은 "대상 없음 통과" 유형)과 ⚪1(Go 소비처 고정)을 수정 라운드로 보냈다. `QUIT_WAIT_MS`는 auth-audit 몫이다.
- C·D worktree는 cherry 확인 뒤 제거했고 브랜치는 남겼다. handoff와 리뷰는 conductor 체크아웃 `.scratch/main-audit/`에 복사했다.
