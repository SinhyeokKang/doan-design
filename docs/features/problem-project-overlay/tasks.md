# problem-project-overlay — tasks

실행 단위는 `/orchestrate`다(사용자 결정, 2026-11-07 `/feature-review`). T1은 지금 checkout된 branch에서 하는 문서·초안 작업이다. T2부터는 conductor가 `feat/problem-project-overlay`를 main에서 만들고 batch로 나눈다.

순서: 결정 → 초안 보강·확정 → 순수 함수와 controller → shell(사이드바 ∥ 오버레이) → 통합 → 초안 맞추기 → 실제 앱 확인 → review → 정적 gate → 승격. 형식(schema·fixture) 변경이 없으므로 형식 task는 없다(design §7).

batch마다 worker는 `/ship bypass`로 `/tdd`(`test(app): …` commit) → `/implement`(`feat(app): …` commit) → `/code-review` → `/refactor`를 돌리고 push 전에 멈춘다(orchestrate SKILL).

| batch | task | 파일 소유 | 선행 | 병렬 |
|---|---|---|---|---|
| B1 | T2 | `problemView.ts`, `problemView.test.ts` | T1 | B2와 병렬 |
| B2 | T3 | `CanvasController.ts`, `CanvasController.test.ts` | T1 | B1과 병렬 |
| B3 | T4 | `ShellSidebar.tsx`, `ShellSidebar.test.tsx` | B1 | B4와 병렬 |
| B4 | T5 | `App.tsx`, `ProblemOverlay.tsx`, `Home.tsx`, `styles.css`, App 테스트, `Home.test.tsx` | B1, B2 | B3과 병렬 |
| B5 | T6 | B3·B4가 고친 파일(design-sync 수정) | 통합 | 단독 |

사이드바 아이콘 CSS도 `styles.css`에 있으므로 B4가 가진다. B3은 클래스 이름만 정해 B4에 넘긴다.

## T0. 결정 — 완료(사용자, 2026-11-07)

- design §3에 Q1–Q27을 적었다. 초안 검토(Q1–Q10), 이 문서 작성 중 질문(Q11–Q13), `/feature-review`(Q14–Q27)다.
- 검증: 확인 명령 미정 — 사용자 확인 필요(design §3에 열린 질문이 남지 않았는지 사람이 본다).
- **commit 경계**: `docs(feature): problem-project-overlay apply review feedback`

## T1. 초안 보강과 확정

- `/design-draft problem-project-overlay`로 design §5 표의 여섯 프레임을 더한다: `overlay-canvas-page`(Config error), `overlay-with-strip`, `overlay-retrying`, `overlay-narrow-long`, `sidebar-states`, `overlay-focus`.
- 바탕은 지금처럼 실제 앱에서 뜬 DOM(`.scratch/runtime-test/problem-project/probe.mjs`)을 쓴다. 캔버스 페이지 바탕은 열린 캔버스가 있는 상태로, strip 바탕은 문제 root에 권한 요청을 기다리는 대화가 있는 상태로 다시 뜬다.
- 사용자가 앱에서 초안을 확인하고 확정한다. 확정을 design §5에 적는다.
- 검증:
  - `doan check --json --repo .`의 error가 기준선(1개, `select-inspect`의 `implements_not_found`)과 같고, 새 warning은 mock.css `hardcoded_color`뿐이다.
  - `doan ls --json --repo .`에서 `problem-project`의 frame id가 다음 14개와 같다: `overlay-missing`, `overlay-not-set-up`, `overlay-config-error`, `overlay-config-error-details`, `overlay-cli-error`, `overlay-reading`, `overlay-reduced-transparency`, `overlay-narrow`, `overlay-canvas-page`, `overlay-with-strip`, `overlay-retrying`, `overlay-narrow-long`, `sidebar-states`, `overlay-focus`.
- **commit 경계**: `docs(design): problem-project-overlay draft revision`(캔버스), `docs(feature): problem-project-overlay record draft confirmation`(design §5)

## T2. 순수 함수 (B1)

- `/tdd`: design §6 표의 사례 전부(`problemView`, `workspaceBody`, `sidebarSlot`, `resolvedFocus`). `problemView`의 동작 집합이 kind마다 `cardRow(...).actions`와 같음을 고정한다. 회복 중 사례(직전 problem 뒤 `loading` → busy, `slow`와 상관없음)와 `workspaceBody`의 다른 root 캔버스 사례를 넣는다.
- `/implement`로 green.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `test(app): problem view for the project overlay` → `feat(app): problem view for the project overlay`

## T3. CanvasController (B2)

- `/tdd`: `openWorkspace(..., overview = true)`가 문제 root(`notFound`, `uninitialized`, `error`, `cliError`)를 받아 캔버스 상태를 비우고 `entered`를 부른다. 캔버스를 여는 경로는 `list`만 받는다. `loading`은 기다렸다가 같은 판단을 한다. `notFound`·`uninitialized`에서 "Use Locate above."·"Use Set Up above." 문장이 없다(`CanvasController.test.ts:621` 고침).
- `/implement`로 green.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `test(app): problem roots enter the Overview` → `feat(app): problem roots enter the Overview`

## T4. 사이드바 (B3)

- `ShellSidebar.tsx`: `sidebarSlot`으로 행 상태 칸을 정하고, 아이콘(`aria-hidden`)과 Radix `Tooltip`을 둔다. 행에 `aria-describedby` sr-only 문장을 둔다. 문제 행의 `shell-empty` 분기, `aria-expanded`, 빈 `role="group"`을 지운다. 메뉴의 Overview 항목을 문제 root에서도 켠다. 읽는 중 spinner는 300 ms 뒤에만 그린다.
- 테스트(`ShellSidebar.test.tsx`):
  - kind별 아이콘과 설명 문장, 읽는 중 300 ms(fake timer).
  - 권한 요청이 문제를 이김(다른 worktree의 권한 요청 포함), 문제가 working을 이김.
  - 펼친 문제 프로젝트에 group 없음, 메뉴 Overview 항목 켜짐.
  - tooltip이 열린 상태에서 행 `aria-describedby`가 바뀌지 않음.
  - `ShellSidebar.test.tsx:167-171`(문제 프로젝트 status line)을 새 기준으로 고친다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과.
- **commit 경계**: `test(app): sidebar problem icons` → `feat(app): sidebar rows show problem icons`

## T5. 오버레이 shell과 스타일 (B4)

- `App.tsx`:
  - `workspaceBody`로 Overview 표시를 바꾸고(`healthyOverview`·`keptOverview` 대체), 본문 위 `ProblemOverlay`를 그리고, 덮인 본문에 `inert`를 둔다.
  - 대화 strip 조건을 문제·읽는 중 root로 바꾸고, 오버레이 동안 strip의 Open을 숨긴다.
  - 오버레이 동안 `setMenuState`, `toolPage`, `onViewCommand`가 덮인 본문을 노리지 않고, pick·capture를 취소한다.
  - 오버레이 동안 seen을 끈다(`overviewRun.show(null)`, 캔버스 패널, `homeRun.visit`).
  - 포커스: 진입 effect가 제목을 먼저 고른다. 제목 포커스 조건(design §4.4)을 지키고, 회복 중 busy를 처리하고, 사라질 때와 Set Up 성공 때 `resolvedFocus`로 보낸다.
  - `toggleProject`의 문제 행 분기(`App.tsx:805`)를 지운다. `loadedProjectRow`는 오버레이가 덮은 Overview에서 제목 포커스로 바꾼다.
  - Overview의 `unavailable` 입력창 줄을 넘기지 않는다. 오버레이 동안 문제 kind의 `state.error` notice를 숨긴다. `CanvasPane` `problemMessage`를 지운다.
- `ProblemOverlay.tsx` 새 컴포넌트: scene, Details 펼침(root마다, root나 다른 문제 kind면 닫힘, 회복 중 같은 kind면 유지), busy 버튼, live region, 읽는 중 줄.
- `Home.tsx`의 `ProblemActions`와 `Home.test.tsx:191-194`를 지운다.
- `styles.css`:
  - 더한다: `.problem-overlay`(design §4.3: 범위, strip과 함께일 때의 열 범위, 바탕, `prefers-reduced-transparency`, z-index 5, scene, 넘침 스크롤, 상수 32px·선 1.5, 오버레이 위 `subtle` 바탕), 사이드바를 숨겼을 때의 margin·motion 규칙(`styles.css:1422`, `1424`, `1427`), 사이드바 아이콘.
  - 지운다: `.ws-*`, `.workspace.with-status`(조합 포함).
  - 남긴다: `.shell-problem`, `.shell-empty`.
  - 지우기 전에 다른 사용처를 코드 검색으로 확인한다. 확인 명령 미정 — 사용자 확인 필요.
- 고칠 App 테스트: `App.settings.test.tsx`, `App.autoWorktrees.test.tsx`, `App.conversationPanel.test.tsx:142`(`canvasPage()`의 notFound 전제).
- 더할 App 테스트:
  - 열린 Overview가 Missing으로 바뀜, 열린 캔버스의 root가 Config error로 바뀜, 열린 캔버스의 root가 Missing으로 바뀜(Overview + 오버레이).
  - 열려 있지 않은 문제 행 누르기와 메뉴 Overview 항목. 불러온 문제 행 누르기를 Home, 캔버스 페이지, 오버레이가 덮은 Overview에서 각각 본다.
  - Locate 뒤 새 root가 `list`일 때와 아직 문제일 때(design §9 2026-11-03 Locate 항목). Set Up 성공 뒤 오버레이가 사라지고 포커스가 입력창으로 감.
  - Remove from Doan → Home을 Overview와 캔버스 페이지에서 각각 본다.
  - 제목 포커스: 들어왔을 때 옮김, 사이드바에 포커스가 있으면 옮기지 않고 live region이 읽음, kind가 바뀌면 다시 옮김, Set Up 양식이나 Remove alert가 열린 동안 미룸, Tab 한 번에 주 동작.
  - 회복 중: Retry 뒤 `loading`에서 scene과 포커스 유지, 같은 kind 재실패에서 Details 유지, 다른 kind에서 제목 포커스.
  - 읽는 중(fake timer): 300 ms 전에 `list`가 되면 오버레이도 포커스 이동도 없음, `loading`에서 바로 문제 kind가 되면 즉시 problem.
  - 풀릴 때 포커스가 입력창이나 캔버스 영역으로 가고 `body`로 가지 않음.
  - Details 펼침이 root나 kind가 바뀌면 닫힘.
  - 오버레이 동안 메뉴 상태(canvasView·pickFromCanvas·newConversation 꺼짐), V·H 키 무시, seen 없음.
  - 문제 workspace에서 대화 strip이 보이고 Stop·권한 응답이 작동함, Open 숨김.
  - 실행할 때 root가 문제면 Home에 머묾. Overview 입력창 초안이 남음.
- CSS 테스트: 오버레이 z-index가 handle(4)보다 크고 toast(6)보다 작음, 투명도 줄이기 대체, 제목이 `display: none`/`visibility: hidden`으로 숨지 않음.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build` 통과.
- **commit 경계**: `test(app): problem projects show an overlay` → `feat(app): problem projects show an overlay over their content`

## T6. 통합과 초안 맞추기 (conductor, B5)

- conductor가 B1–B4를 `feat/problem-project-overlay`에 통합한다.
- B5 worker가 `/design-sync`로 확정된 `problem-project.html`의 프레임과 구현을 computed style로 맞추고, 측정값을 `docs/DESIGN.md`에 적는다('Projects home'의 status line 측정값을 오버레이 측정값으로 바꾸고, 'Intended exceptions'의 'Subtle buttons on inset bands'를 지운다).
- 검증: `/design-sync` 보고의 프레임별 일치, `npm --prefix app test` 통과.
- **commit 경계**: `/design-sync`의 commit 규칙을 따른다.

## T7. 실제 앱 확인

- `/runtime-test`: spec 완료 조건 17의 항목. 격리된 HOME·userData에서 임시 repo를 옮기거나 config를 깨서 각 kind를 만든다. 사이드바 프로젝트 메뉴와 toast가 오버레이 위에 그려지는지 screenshot으로 본다. 최소 창과 스크롤·창 크기 변경 중 블러 끊김을 눈으로 본다.
- 검증: `/runtime-test` 보고에 각 항목의 screenshot과 통과·실패.
- **commit 경계**: 없음(증거는 `.scratch/`).

## T8. review와 정적 gate

- 통합 diff에 독립 review worker가 `/code-review`, 지적이 있으면 해당 batch 소유자가 `/refactor`. 앱 동작이 바뀌면 그 부분만 T7을 다시 본다.
- `/verify`: `node .agents/skills/verify/scripts/verify.mjs`.
- 검증: `verify.mjs` exit 0.
- **commit 경계**: refactor는 batch 소유자의 commit 규칙을 따른다.

## T9. 승격과 삭제

- `docs/PRODUCT.md`를 현재 규칙으로 고친다:
  - §5 item 1: 문제 행이 workspace를 연다. 펼친 문제 프로젝트에 status line이 없다. 행 상태 칸의 순서(권한 요청·질문, 문제 아이콘, working, unseen)와 tooltip을 적는다(L213, L214, 숨긴 사이드바 점 L178). Remove from Doan 진입점에서 workspace status line을 지운다. "A loaded workspace that becomes unhealthy stays visible with its status strip and Go Home"을 바꾼다. 대화 strip 문단(L212)을 바꾼다. 메뉴의 Overview 항목이 문제 root에서도 켜진다.
  - item 3: 'Problem states'(Overview·캔버스 페이지 위 오버레이, 읽는 중 300 ms, 회복 중 busy, 포커스, 꺼지는 메뉴와 단축키, seen)를 바꾸고, worktree chip(L256)이 오버레이 동안 쓸 수 없다고 적는다.
- `docs/ARCHITECTURE.md`: §7 'Memory'의 "Problem/loading rows never enter workspaces; a loaded workspace that turns unhealthy stays with its status actions"를 바꾼다(문제 root는 Overview로 들어가고 캔버스는 `list` root에서만 연다). renderer의 비자명한 제약을 적는다: 오버레이 층(z-index 순서), inert가 window 단축키와 앱 메뉴를 막지 못한다는 점.
- `docs/DESIGN.md`: T6 결과와 아이콘 상수를 넣는다. 고칠 곳: L228 'recovery strip … as ARCHITECTURE §7 requires', L386 'strip shows only on a problem workspace', 'Status pill'의 workspace status line 언급, 'Shell layout'의 band 행, 'Known note'의 Locate 문장.
- `docs/BACKLOG.md`: CLI error 원인 표시와 Show in Finder가 숨김 폴더 `.doan/`을 보이지 않는 문제(design §3 Q24)를 더한다.
- `docs/features/problem-project-overlay/`를 지운다.
- 검증: 확인 명령 미정 — 사용자 확인 필요. 대소문자를 구분하지 않고 "status band", "status strip", "status line", "recovery strip", "status actions", "problem screen", "problem workspace", "Go Home", "never enter workspaces", "Problem rows do not open"을 PRODUCT, DESIGN, ARCHITECTURE에서 찾는다. 새 규칙과 어긋나는 문장이 남지 않았는지 사람이 확인한다.
- **commit 경계**: 문서별로 나눈다(`docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(DESIGN): …`, `docs(BACKLOG): …`, `docs(feature): remove problem-project-overlay documents`).
