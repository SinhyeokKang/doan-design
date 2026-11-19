# 헤더 브레드크럼과 워크트리 — orch

- 출처: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261119-1](../chain-261119-1/chain.md) 링크 2
- 시작 해시: `50ecade95` (링크 1 composer-markdown 머지 `dc07740a4` 뒤 체인 파일 기록)
- 통합 브랜치: `feat/header-breadcrumb-worktree` (리드가 만들었다. conductor는 브랜치를 만들거나 바꾸지 않는다)
- conductor: Claude Code (Opus 5.5)

## 결정 기록

- 모델 배치: 구현 배치(고침 라운드 포함)는 모두 Codex `gpt-6.2-astra` 워커, 리뷰는 Claude(독립 리뷰 워커와 conductor 리뷰)가 맡는다. 사용자 지시(체인 '상시 권한' 링크 2, Astra 신버전 시험). `gpt-6.2-astra`는 `$CODEX_HOME/models_cache.json`에 있다.
- tasks 1(초안)은 끝났다: `.doan/canvases/header-breadcrumb-worktree.html`, `viewer-header` 프레임 포함, 사용자 확정(design '초안 리뷰에서 정한 것').
- 배치 순서: conductor 재량 — 앱(A, tasks 2~5)과 export 뷰어(V, tasks 5a)를 병렬로 돌린다. 겹치는 파일은 없다. V의 반응형 CSS는 캔버스 헤더와 같은 규칙이어야 하므로, V는 확정 초안의 `viewer-header` 프레임으로 먼저 만들고, A와 `/design-sync`(DS) 통합 뒤 `styles.css`의 최종 캔버스 헤더 규칙과 맞추는 일을 보류 항목으로 받는다. 근거: 파일 겹침 규칙(`/orchestrate` §0 4).
- TS·Go 썸네일 공유 fixture: V가 `schema/fixtures/` 아래 새 fixture와, 그것을 읽는 새 TS 테스트 파일을 만든다. A가 가진 `shellNavigation.test.ts`는 고치지 않는다. 근거: ARCHITECTURE §11 'Shared formats'의 fixture 방식, 파일 소유 분리.
- DS(tasks 6)는 A 통합·리뷰 뒤 A 워커에게 새 Task로 보낸다(같은 코드를 안다). 뷰어 헤더는 앱 화면이 아니라 `/design-sync` 대상이 아니다. conductor 재량 — V가 `.scratch/` probe로 초안 `viewer-header` 프레임과 export 결과를 세 폭(넓음, 720 미만, 600 미만)에서 computed style로 비교한다(더 확실히 검증하는 쪽).
- tasks 7(`/runtime-test`), 8(최종 `/verify`), 9(승격)는 conductor가 한다. 로그인은 필요 없다(체인 '로그인').

## Codex 사용

- 2026-11-19 21:07 확인(`$CODEX_HOME/sessions` 최신 rollout): 주간(10080분) 2% 사용, plan pro. 사용할 수 있다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 2, 3, 4, 5 | `app/src/renderer/**`: 새 워크트리 셀렉트 모듈·컴포넌트와 테스트, `ProjectOverview.tsx`, `ShellSidebar.tsx`, `CanvasHeader.tsx`, `App.tsx`, `homeCards.ts`, `styles.css`와 각 테스트 | 없음 | Codex Astra high — 세 화면에 걸친 공용 컴포넌트, root를 포함한 캔버스 정체성(postmortem 2026-11-01), roving tabindex·포커스 | `npm --prefix app test`, typecheck, lint | 대기 |
| V | tasks 5a | `cli/**`(export 뷰어 `shell.*`, `assemble.go`, 이름·썸네일 Go 함수와 테스트, 고정 출력), `app/src/main/exportViewer.test.ts`, `schema/fixtures/` 새 fixture, fixture를 읽는 새 TS 테스트 파일 | 없음(최종 CSS 맞춤은 A·DS 뒤 보류 항목) | Codex Astra medium — 명세가 구체적이고 Go·정적 HTML/CSS 범위다 | `go test ./...`, `go vet ./...`, `npm --prefix app test`, `node eval/run.ts --self-test --scenarios X1,X2` | 대기 |
| A-rev | A 리뷰 | 없음(보고만) | A | Claude Opus high — 여러 컴포넌트와 이동 상태에 걸친 변경 | `/code-review` 보고 | 대기 |
| V-rev | V 리뷰 | 없음(보고만) | V | Claude Opus medium — 범위가 좁고 고정 테스트가 많다 | `/code-review` 보고 | 대기 |
| DS | tasks 6 | A와 같음(`styles.css`·컴포넌트 고침), `docs/design/shell.md`·`project.md`·`canvas.md` | A, A-rev | Codex Astra medium — 측정 절차가 정해져 있고 고침은 CSS 위주다 | 세 문서 측정값, 960×600 겹침 없음, test | 대기 |
| conductor | tasks 7, 8, 9 | orch.md, 승격 문서 | 전부 | — | `/runtime-test`, verify, `grep` | 대기 |

## Astra 신버전 결과

| 배치 | 라운드 | 리뷰에서 나온 문제 |
|---|---|---|
| A | | |
| V | | |
| DS | | |
