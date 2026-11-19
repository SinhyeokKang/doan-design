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
- V-rev ⚪1(Main 없는 bare 그룹에서 앱 그룹 이름과 export 이름이 다를 수 있다): conductor 재량 — 동작은 spec 9·design대로 두고, 승격 때 PRODUCT·ARCHITECTURE 문장이 "앱과 같은 규칙"이라 주장하지 않게 "Git main 워크트리 폴더 이름, 없으면 내보낸 루트의 폴더 이름"으로 적는다. CLI는 앱의 등록 순서를 모르고, spec이 이미 이 규칙을 정했다.
- V-rev ⚪5: 승격 때 ARCHITECTURE §8에 `x/text/cases` 용도, §11 공유 fixture 목록에 `project-thumb`을 적는다.
- A와 V 1차는 리뷰 전에 통합했다: conductor 재량 — 두 배치의 파일이 겹치지 않고 게이트가 통과했다. 리뷰의 고칠 점은 같은 워커가 새 커밋으로 고치고 다시 통합한다.
- V 2차(⚪2~4 테스트 보강) `39f873a4e`·`c2dba5462`·`757fa623f`: conductor가 diff를 확인했다. 게이트 6개 PASS, Vitest 14,814.
- A-rev ⚪5(Retry를 누른 뒤 복구 구역과 busy Retry를 메뉴에 남길지): conductor 재량 — 지금 규칙(읽기가 시작되면 일반 행으로 돌아간다)을 유지한다. spec 5가 문제 행 처리를 "지금 규칙"으로 정했고, 이전 메뉴와 같은 동작이라 새 회귀가 아니다. ⚪8(캔버스 이름 활성 여부가 `loadedRoot`에 묶임)은 실패 경로가 없어 그대로 둔다.
- DS 질문(`canvas-header-unavailable` 프로젝트 문제 타일의 호버 툴팁): 실제 앱에서는 문제 오버레이가 헤더를 덮고 패널이 inert라 도달할 수 없다. conductor 재량 — 오버레이와 복구 경로는 그대로 두고(spec 10, 지금 규칙) `docs/design/canvas.md`에 문서화된 편차로 남긴다. 버튼의 `aria-disabled`, 사유 문구, CDP 접근 설명은 측정한다. 목록에 없는 페이지 경우는 덮이지 않으므로 툴팁까지 실제로 잰다.
- V 3차(보류 항목, dispatch `ctx_b2e3305b11be`): 뷰어 CSS를 `styles.css`의 최종 캔버스 헤더 규칙에 맞추고 `exportViewer.test.ts`로 선언을 고정한다. V 브랜치는 통합 브랜치로 맞춘 뒤 시작한다.
- V 3차 `e9572af8e`·`0ffa7177d`: conductor가 diff 확인 후 통합(`55691058c`). V 배치 끝, 워커 해제.
- A-rev 2차 ⚪R2-5(프로젝트 문제 사유는 오버레이에 가려 아무도 볼 수 없다): 승격 때 PRODUCT에 "캔버스 헤더가 툴팁으로 알린다"고 쓰지 않고 오버레이가 문제를 알린다고 쓴다.
- tasks 7(`/runtime-test`), 8(최종 `/verify`), 9(승격)는 conductor가 한다. 로그인은 필요 없다(체인 '로그인').

## Codex 사용

- 2026-11-19 21:07 확인(`$CODEX_HOME/sessions` 최신 rollout): 주간(10080분) 2% 사용, plan pro. 사용할 수 있다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 2, 3, 4, 5 | `app/src/renderer/**`: 새 워크트리 셀렉트 모듈·컴포넌트와 테스트, `ProjectOverview.tsx`, `ShellSidebar.tsx`, `CanvasHeader.tsx`, `App.tsx`, `homeCards.ts`, `styles.css`와 각 테스트 | 없음 | Codex Astra high — 세 화면에 걸친 공용 컴포넌트, root를 포함한 캔버스 정체성(postmortem 2026-11-01), roving tabindex·포커스 | `npm --prefix app test`, typecheck, lint | 1차 완료, 리뷰 전에 통합 `140338d50`..`6614c3323` → 통합 `a5753b69b`까지 (dispatch `ctx_ac075375699e`, 워크트리 `hbw-a`; Vitest 510 files / 14,803 PASS, typecheck·lint PASS) |
| V | tasks 5a | `cli/**`(export 뷰어 `shell.*`, `assemble.go`, 이름·썸네일 Go 함수와 테스트, 고정 출력), `app/src/main/exportViewer.test.ts`, `schema/fixtures/` 새 fixture, fixture를 읽는 새 TS 테스트 파일 | 없음(최종 CSS 맞춤은 A·DS 뒤 보류 항목) | Codex Astra medium — 명세가 구체적이고 Go·정적 HTML/CSS 범위다 | `go test ./...`, `go vet ./...`, `npm --prefix app test`, `node eval/run.ts --self-test --scenarios X1,X2` | 1차 완료 `f4601f37f`·`05a0fe85d` (dispatch `ctx_63ee87aea3bb`, 워크트리 `hbw-v`; 게이트 전부 PASS, X1·X2 self-test PASS, Vitest 510 files / 14,810) |
| A-rev | A 리뷰 | 없음(보고만) | A | Claude Opus high — 여러 컴포넌트와 이동 상태에 걸친 변경 | `/code-review` 보고 | 1차 🔴0 🟡4 ⚪4 (`.scratch/review-A.md`) → A 고침 1차 `d75bf9544`..`88b395b2e`(🟡1~4, ⚪6·⚪7; conductor가 diff 확인, Vitest 14,808 PASS) 통합 `7dd57ed48`까지 |
| V-rev | V 리뷰 | 없음(보고만) | V | Claude Opus medium — 범위가 좁고 고정 테스트가 많다 | `/code-review` 보고 | 🔴0 🟡0 ⚪5 (`.scratch/review-V.md`). ⚪2~4는 V 2차(dispatch `ctx_1a24c13a28ad`), ⚪1·⚪5는 승격 문구 |
| DS | tasks 6 | A와 같음(`styles.css`·컴포넌트 고침), `docs/design/shell.md`·`project.md`·`canvas.md` | A, A-rev | Codex Astra medium(A 워커의 후속 Task라 A의 high로 돈다) — 측정 절차가 정해져 있고 고침은 CSS 위주다 | 세 문서 측정값, 960×600 겹침 없음, test | 1차 완료 `4f4955bb0`(비활성 사유 색·접근 연결) + 문서 3커밋, 통합 `38e272e7d`까지. 8개 프레임 22개 타일 실측, 960×600·720/600 경계 겹침 없음, 앱 실행 1회, Vitest 14,808·typecheck·lint·build PASS. A-rev 2차(Claude): 고침 1차 전부 확인, DS 🟡1(상속 13px 차이 미기록) ⚪4 → DS 2차(dispatch `ctx_8ed6c56826e6`): 🟡R2-1, ⚪R2-2~4 |
| conductor | tasks 7, 8, 9 | orch.md, 승격 문서 | 전부 | — | `/runtime-test`, verify, `grep` | `/runtime-test` 22/22 PASS(`.scratch/runtime-test/hbw/`, 실제 상태 변화 없음). 승격 `01f8cc7a4`(PRODUCT)·`0baad7d04`(ARCHITECTURE) |

## Astra 신버전 결과

| 배치 | 라운드 | 리뷰에서 나온 문제 |
|---|---|---|
| A (tasks 2~5, high) | 구현 1 + 고침 1 | A-rev 1차 🔴0 🟡4 ⚪4: 캔버스 헤더 이동 뒤 포커스가 body로 떨어짐(key 재마운트), 트리거 keydown 차단이 캔버스 단축키·Esc까지 막음, 문제 행 선택 때 체크·aria-current가 현재 행에 남음, 지운 repairMenu 테스트의 호스트 배선 커버리지 빠짐. 고침 1차로 전부 해결(수정 전 실패를 확인한 테스트로 고정). |
| DS (tasks 6, A 워커) | 측정 1 + 고침 1 | 측정 중 비활성 사유 색·접근 연결을 스스로 찾아 고침. A-rev 2차 🟡1(상속 13px 편차를 문서에 적지 않고 적었다고 보고) ⚪4. 고침 1차로 해결. |
| V (tasks 5a, medium) | 구현 1 + 테스트 보강 1 + 보류 항목 1 | V-rev 🔴0 🟡0 ⚪5(fixture 사례, no-JS 실 DOM, linked worktree 통합 테스트 부족, 승격 문구 2건). 보강 라운드로 해결. |

- 전체: 🔴 0건. 🟡는 A 4건, DS 1건이고, 모두 한 번의 고침 라운드로 끝났다. 정해진 게이트(Vitest·typecheck·lint·Go·self-test)는 매 라운드 통과했다. 리뷰가 찾은 결함은 테스트가 다루지 않던 상호작용(포커스, 키 전파, 표시 상태)과 보고 과장(문서화 주장)이었다.
