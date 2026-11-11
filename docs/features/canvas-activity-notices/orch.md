# canvas-activity-notices 오케스트레이션

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: `docs/features/chain-261111/chain.md` 링크 2 (`origin/develop`에서 읽는다)
- 시작 해시: `b45ae233` · 통합 브랜치: `feat/canvas-activity-notices`
- conductor: Claude Code. 워커도 Claude만 쓴다(모델 계열 교차 없음).

## 결정 기록

- 공유 메타데이터 계약(경로·파일 단위·버전·schema·TS/Go 소비)은 작업 1 PoC 근거로 conductor가 정하고 PR 본문에 남긴다 — 체인 시작 점검 승인 (1).
- 대화 종료 말풍선의 실제 앱 확인은 격리 앱의 대화 기록 fixture로 한다. 제공자 로그인은 쓰지 않는다 — 체인 시작 점검 승인 (2).
- 공유 메타데이터 계약 — conductor 판단(승인 (1)), 근거는 A1 PoC(`.scratch/handoff-A1.md` §6):
  - 경로·단위: `<root>/.doan/seen/<canvas-id>.json` 캔버스별 파일, 표지 파일 `.doan/seen/_project.json`(`{"v":1}`). 단일 파일은 Git에서 인접 캔버스끼리 충돌했고 캔버스별 파일은 같은 캔버스를 다르게 본 경우만 충돌했다. `.doan/` 바로 아래가 아닌 하위 디렉터리라 기존 `.doan` 감시가 `doan ls`를 다시 돌리지 않는다.
  - 형식: `{"v":1,"html":"sha256:<hex>"}` 또는 `{"v":1,"unseen":"migrated"}`. `v>1`은 미지원, 충돌 표지·형식 오류·읽기 실패는 마지막 판정 유지와 오류 토스트. 앱이 기록을 삭제하지 않는다.
  - 지문: HTML 원본 바이트의 sha256, 문서 서버의 응답 hash와 같은 값이다. 읽음은 `DocumentBindings.current()`가 증명한 표시 hash만 기록한다(메인 창 main frame 자식, 행 URL, root·path 일치, 일치 frame이 하나일 때).
  - 원자 저장: 같은 디렉터리 temp + rename, symlink·저장소 밖 경로 거부, rename 직전 읽은 바이트와 비교. 다음 성공 저장 때 자체 temp 잔여물을 지운다.
  - 로컬 `canvas-seen.json`은 v2로 바꾸고 전환 중 mtime 기록·최초 baseline·마지막 판정 캐시를 둔다.
  - TS만 소비한다. `schema/` 파일, CLI·`doan check`·가이드 변경은 없다. 따라서 `/agent-eval` 대상이 아니다.
- Overview·대화 패널의 대화 행(`ConversationLine` StatusMark)도 읽지 않은 대화 종료를 말풍선과 `Conversation finished — unread`로 표시한다 — 사용자 결정(B 리뷰 🟡1). spec 2항의 세 표시 밖이지만 Dot이 캔버스 변경만 뜻하게 하려는 것이다.
- ID 없음·중복 캔버스의 Dot 설명은 확정 초안 타일 `canvas-id-problem`의 문구를 따른다 — conductor 판단(A2 리뷰 ⚪1). spec '오류 복구와 표시'의 실패 설명은 저장을 시도했다 실패한 경우(항목 8)이고, ID 문제는 저장 보류(항목 13)다.
- 배치 분할은 conductor 판단이다. 근거: 말풍선 UI는 메타데이터 계약과 독립이고, 메타데이터 구현은 PoC 결과에 묶여 있다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A1 PoC | 작업 1 | `.scratch/`, `app/src/main/canvasSeen*.test.ts` 등 PoC fixture 테스트(커밋 선택) | 없음 | Opus high — 저장 형식·실제 표시 근거·마이그레이션을 판단해야 하고 틀리면 Dot 대량 발생이나 미읽음 손실로 이어진다 | `npm --prefix app test`, 계약 제안서 `.scratch/handoff-A1.md` | 완료(커밋 없음) |
| B 말풍선 | 작업 4 중 대화 종료 말풍선(사이드바 행·프로젝트 집계·Show sidebar·Show conversation)과 문구, 해당 `/design-sync`(`activity-sidebar`·`activity-collapsed`) | `renderer/ShellSidebar.tsx`의 슬롯 표시, `sidebarSize.ts`, `rightPanelOpen.ts`, `CanvasHeader.tsx`, `App.tsx`의 사이드바 토글 버튼, `styles.css` | 없음 | Sonnet medium — 초안과 문구가 확정된 표시 변경이고 판정 로직은 그대로다 | `npm --prefix app test`·typecheck·lint, fixture 대화 기록으로 격리 앱 확인 | 통합 `76d4ee8d`·`a786a12f`·`bac1ae12`, 수정 1회차 중 |
| A2 구현 | 작업 3·4(말풍선 제외)·5의 실패 Dot·토스트 `/design-sync`(`activity-save-failure`·`activity-recovery`)와 `/runtime-test` | `main/canvasSeen.ts`, `shell.ts`, `view.ts`, `watch.ts`, `index.ts` 읽음 IPC, `document/bindings.ts`, `renderer/canvasNotice.ts`, `App.tsx` 읽음·토스트 연결, 새 메타데이터 모듈과 테스트. B 통합 뒤에는 `styles.css`·`ShellSidebar.tsx`도 | A1 계약 확정, B 통합(같은 파일) | Opus high — 원자 저장·감시·마이그레이션 중단 지점·실제 표시 증명은 동시성·데이터 손실 위험이 크다 | `npm --prefix app test`, Go 소비 시 `go test ./...`, 격리 앱 probe | 통합 `197fc963`·`941ea657`·`6a3f1df1`, 수정 1회차 중 |
| R 리뷰 | B·A2 diff `/code-review` | 보고만 | 각 배치 완료 | B: Sonnet high, A2: Opus high — A2는 동시성·데이터 손실 검토 | 🔴 0 | B 🔴0 🟡3, A2 🔴0 🟡3 → 수정 1회차 |
| 문서 | 작업 6 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, 필요 시 `docs/DIRECTORY.md`, 기능 디렉터리 삭제 | 전 배치 통합 | conductor | 완료 조건·증거 대조 | 대기 |

작업 2(초안)는 이미 끝났다. 작업 5의 최종 `/verify`와 통합 확인은 conductor가 한다.

## 겹침과 순서

- A1과 B는 병렬로 돌린다. A1은 앱 코드를 바꾸지 않는다.
- B와 A2는 `App.tsx`·`styles.css`·`ShellSidebar.tsx`가 겹쳐 직렬이다. B 통합 뒤 A1 워커가 배치 브랜치를 `feat/canvas-activity-notices`로 rebase하고 A2를 시작한다.
- 링크 1(`frame-first-selection`) 파일(`canvasScript.ts`, `CanvasController.ts`, `selection.ts`, `canvasTool.ts`, `canvasMessage.ts`)은 건드리지 않는다. 필요해지면 lead에게 먼저 알린다.

## 진행 기록

- A1 완료: 계약 제안과 증거를 받았다. 전체 `npm --prefix app test`는 병렬 부하로 매번 다른 파일이 실패했고 단독 재실행은 통과했다.
- B 완료·통합: 사이드바 행·Show sidebar 측정은 초안과 일치했다. 프로젝트 행 집계·접힌 패널 말풍선은 실제 앱에서 보지 못했고 단위 테스트만 있다. B 워커는 리뷰 수정용으로 유지한다.
- A2: A1 터미널 재사용이 Orca에서 거부돼(`agent_unconfigured`) 같은 worktree `can-a1`에 새 Opus high 워커를 띄웠다.
- A2 완료·통합: verify PASS, runtime probe 12개 통과, design-sync 189행 중 맥락 차이 2행. 새 워커 터미널 재사용이 다시 거부돼 리뷰·수정은 새 워커로 띄웠다.
- 리뷰: B(Sonnet high) 🔴0 🟡3, A2(Opus high) 🔴0 🟡3. 수정 1회차 — A2는 🟡1–3과 ⚪4·⚪5, B는 대화 행 말풍선·DESIGN.md 옛 서술·테스트.
