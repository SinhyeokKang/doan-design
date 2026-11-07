# problem-project-overlay — tasks

순서: 결정 → 초안 보강·확정 → 순수 함수 → shell(본문 선택, 오버레이, 포커스, 사이드바) → 스타일 → 실제 앱 확인 → 초안 맞추기 → 승격. 형식(schema·fixture) 변경이 없으므로 형식 task는 없다(design §7). `/ship`의 흐름(`/tdd` → `/implement` → `/code-review` → `/refactor` → `/verify`)은 T2–T4의 commit 경계를 따른다.

## T0. 결정 — 완료(사용자, 2026-11-07)

- design §3에 Q1–Q13을 적었다. 초안 검토(Q1–Q10)와 이 문서 작성 중 질문(Q11–Q13)이다.
- 검증: 확인 명령 미정 — 사용자 확인 필요(design §3에 열린 질문이 남지 않았는지 사람이 본다).
- **commit 경계**: `docs(feature): problem-project-overlay spec, design, tasks`

## T1. 초안 보강과 확정

- `/design-draft problem-project-overlay --revise`로 design §5의 `overlay-canvas-page`, `sidebar-states`, `overlay-focus`를 더한다. 바탕은 지금처럼 실제 앱에서 뜬 DOM(`.scratch/runtime-test/problem-project/probe.mjs`)을 쓴다. 캔버스 페이지 바탕은 열린 캔버스가 있는 상태로 다시 뜬다.
- 사용자가 앱에서 초안을 확인하고 확정한다. 확정을 design §5에 적는다.
- 검증: `doan check --json --repo .` 오류가 기준선(1개, `select-inspect`)과 같고, `doan ls --json --repo .`에 `problem-project`의 frame id가 design §5 목록과 같다.
- **commit 경계**: `docs(design): problem-project overlay draft revision`

## T2. 순수 함수

- `/tdd`: design §6 표의 사례 전부(`problemView`, `overlayState`, `workspaceBody`, `sidebarSlot`, `problemRowOpens`). `problemView`의 동작 집합이 kind마다 `cardRow(...).actions`와 같음을 고정한다.
- 시작 전 코드에서 확인: `controller.openWorkspace`가 문제 root를 받아들이는지, Overview 입력창 초안이 inert·unmount 뒤에도 남는지(design §4.4). 다르면 멈추고 사용자에게 묻는다.
- `/implement`로 green.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): problem view for the project overlay`

## T3. shell: 본문 선택, 오버레이, 포커스, 사이드바

- `App.tsx`: `workspaceBody`로 Overview 표시를 바꾸고(`healthyOverview`·`keptOverview` 대체), 본문 위 `ProblemOverlay`를 그리고, 덮인 본문에 `inert`를 둔다. 문제 kind로 나타나면 제목 포커스, 풀리면 design §4.4의 포커스 대상. `toggleProject`의 문제 행 분기를 `problemRowOpens`로 바꾼다. Overview의 `unavailable` 입력창 줄을 넘기지 않는다.
- `ProblemOverlay.tsx` 새 컴포넌트, Config error Details 펼침(root마다, root·kind가 바뀌면 닫힘).
- `ShellSidebar.tsx`: `sidebarSlot`으로 행 상태 칸, Radix `Tooltip`, 문제 행 `shell-empty` 삭제.
- `ProblemActions`, `CanvasPane` `problemMessage` 삭제. band를 찾던 테스트(`Home.test.tsx`, `App.settings.test.tsx`, `App.autoWorktrees.test.tsx`)를 오버레이 기준으로 고친다.
- App 테스트: 열린 Overview가 Missing으로 바뀜, 문제 행 누르기, 열린 캔버스의 root가 문제로 바뀜, Locate 뒤 새 root(design §9 2026-11-03 Locate 항목), Set Up 양식이 열린 동안 제목 포커스 미룸, 읽는 중 300 ms.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과.
- **commit 경계**: `feat(app): problem projects show an overlay over their content`

## T4. 스타일

- `styles.css`: 오버레이(design §4.3: 범위, 바탕, `prefers-reduced-transparency`, z-index 5, scene, 상수 32px·선 1.5, 오버레이 위 `subtle` 바탕), 사이드바 아이콘, `.ws-*`·`.workspace.with-status`·`.shell-problem` 삭제(다른 사용처를 `rg`로 확인한 뒤).
- CSS 테스트: 오버레이 z-index가 handle(4)보다 크고 toast(6)보다 작음, 투명도 줄이기 대체, 제목이 `display: none`/`visibility: hidden`으로 숨지 않음.
- 검증: `npm --prefix app test`, `npm --prefix app run build` 통과.
- **commit 경계**: `feat(app): overlay and sidebar problem icon styles`

## T5. 실제 앱 확인

- `/runtime-test`: spec 완료 조건 15의 항목. 격리된 HOME·userData에서 임시 repo를 옮기거나 config를 깨서 각 kind를 만든다. 사이드바 프로젝트 메뉴와 toast가 오버레이 위에 그려지는지 screenshot으로 본다.
- 검증: `/runtime-test` 보고에 각 항목의 screenshot과 통과·실패.
- **commit 경계**: 없음(증거는 `.scratch/`).

## T6. 초안 맞추기

- `/design-sync`: 확정된 `problem-project.html`의 프레임과 구현을 computed style로 맞추고, 측정값을 `docs/DESIGN.md`에 적는다('Projects home'의 status line 측정값을 오버레이 측정값으로 바꾸고, 'Intended exceptions'의 'Subtle buttons on inset bands'를 지운다).
- 검증: `/design-sync` 보고의 프레임별 일치, `npm --prefix app test` 통과.
- **commit 경계**: `/design-sync`의 commit 규칙을 따른다.

## T7. 승격과 삭제

- `docs/PRODUCT.md`: §5 item 1(문제 행이 workspace를 연다, 펼친 문제 프로젝트에 status line이 없다, 행 상태 칸의 종류 아이콘과 tooltip, Remove from Doan 진입점에서 workspace status line 삭제, "A loaded workspace that becomes unhealthy stays visible with its status strip and Go Home" 대체), item 3 'Problem states'(Overview·캔버스 페이지 위 오버레이, 읽는 중 300 ms, 포커스)를 현재 규칙으로 고친다.
- `docs/ARCHITECTURE.md`: renderer에서 본문 선택과 오버레이 층(z-index 순서)에 대한 비자명한 제약만 적는다.
- `docs/DESIGN.md`: T6 결과와 아이콘 상수, 'Status pill'의 workspace status line 언급, 'Shell layout'의 band 행을 고친다.
- `docs/features/problem-project-overlay/` 삭제.
- 검증: `rg -n "status band|status strip|workspace status line|problem screen" docs/PRODUCT.md docs/DESIGN.md docs/ARCHITECTURE.md`가 새 규칙과 어긋나는 문장을 남기지 않는다(사람이 확인).
- **commit 경계**: 문서별로 나눈다(`docs(product): …`, `docs(architecture): …`, `docs(design): …`, `docs(feature): remove problem-project-overlay documents`).
