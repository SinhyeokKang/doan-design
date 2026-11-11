# canvas-activity-notices 오케스트레이션

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: `docs/features/chain-261111/chain.md` 링크 2 (`origin/develop`에서 읽는다)
- 시작 해시: `b45ae233` · 통합 브랜치: `feat/canvas-activity-notices`
- conductor: Claude Code. 워커도 Claude만 쓴다(모델 계열 교차 없음).

## 결정 기록

- 공유 메타데이터 계약(경로·파일 단위·버전·schema·TS/Go 소비)은 작업 1 PoC 근거로 conductor가 정하고 PR 본문에 남긴다 — 체인 시작 점검 승인 (1).
- 대화 종료 말풍선의 실제 앱 확인은 격리 앱의 대화 기록 fixture로 한다. 제공자 로그인은 쓰지 않는다 — 체인 시작 점검 승인 (2).
- 배치 분할은 conductor 판단이다. 근거: 말풍선 UI는 메타데이터 계약과 독립이고, 메타데이터 구현은 PoC 결과에 묶여 있다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A1 PoC | 작업 1 | `.scratch/`, `app/src/main/canvasSeen*.test.ts` 등 PoC fixture 테스트(커밋 선택) | 없음 | Opus high — 저장 형식·실제 표시 근거·마이그레이션을 판단해야 하고 틀리면 Dot 대량 발생이나 미읽음 손실로 이어진다 | `npm --prefix app test`, 계약 제안서 `.scratch/handoff-A1.md` | 대기 |
| B 말풍선 | 작업 4 중 대화 종료 말풍선(사이드바 행·프로젝트 집계·Show sidebar·Show conversation)과 문구, 해당 `/design-sync`(`activity-sidebar`·`activity-collapsed`) | `renderer/ShellSidebar.tsx`의 슬롯 표시, `sidebarSize.ts`, `rightPanelOpen.ts`, `CanvasHeader.tsx`, `App.tsx`의 사이드바 토글 버튼, `styles.css` | 없음 | Sonnet medium — 초안과 문구가 확정된 표시 변경이고 판정 로직은 그대로다 | `npm --prefix app test`·typecheck·lint, fixture 대화 기록으로 격리 앱 확인 | 대기 |
| A2 구현 | 작업 3·4(말풍선 제외)·5의 실패 Dot·토스트 `/design-sync`(`activity-save-failure`·`activity-recovery`)와 `/runtime-test` | `main/canvasSeen.ts`, `shell.ts`, `view.ts`, `watch.ts`, `index.ts` 읽음 IPC, `document/bindings.ts`, `renderer/canvasNotice.ts`, `App.tsx` 읽음·토스트 연결, 새 메타데이터 모듈과 테스트. B 통합 뒤에는 `styles.css`·`ShellSidebar.tsx`도 | A1 계약 확정, B 통합(같은 파일) | Opus high — 원자 저장·감시·마이그레이션 중단 지점·실제 표시 증명은 동시성·데이터 손실 위험이 크다 | `npm --prefix app test`, Go 소비 시 `go test ./...`, 격리 앱 probe | 대기 |
| R 리뷰 | B·A2 diff `/code-review` | 보고만 | 각 배치 완료 | B: Sonnet high, A2: Opus high — A2는 동시성·데이터 손실 검토 | 🔴 0 | 대기 |
| 문서 | 작업 6 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, 필요 시 `docs/DIRECTORY.md`, 기능 디렉터리 삭제 | 전 배치 통합 | conductor | 완료 조건·증거 대조 | 대기 |

작업 2(초안)는 이미 끝났다. 작업 5의 최종 `/verify`와 통합 확인은 conductor가 한다.

## 겹침과 순서

- A1과 B는 병렬로 돌린다. A1은 앱 코드를 바꾸지 않는다.
- B와 A2는 `App.tsx`·`styles.css`·`ShellSidebar.tsx`가 겹쳐 직렬이다. B 통합 뒤 A1 워커가 배치 브랜치를 `feat/canvas-activity-notices`로 rebase하고 A2를 시작한다.
- 링크 1(`frame-first-selection`) 파일(`canvasScript.ts`, `CanvasController.ts`, `selection.ts`, `canvasTool.ts`, `canvasMessage.ts`)은 건드리지 않는다. 필요해지면 lead에게 먼저 알린다.

## 진행 기록
