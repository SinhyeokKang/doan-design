# 캔버스 인스펙터 — tasks

`/agent-eval` 대상이 아니다: 가이드, CLI 출력, `doan check` 규칙, 스킬 stub이 바뀌지 않는다.

0. **레이아웃 초안.** (2026-11-18 완료: `.doan/canvases/canvas-inspector-layout.html`, `b781e5681`, 사용자 확정)

1. **`/design-draft` — 패널 내부.** 새 캔버스 `.doan/canvases/canvas-inspector-panel.html`에 인스펙터 패널을 그린다. 레이아웃 초안의 창(`.doan/assets/canvas-page-snapshot.css`)을 그대로 쓰고, 패널 안과 헤더 버튼만 새로 그린다.
   - 상태: 선택 없음, 읽는 중(새 선택), 같은 선택 재읽기(행 유지), 실패(Retry), 프레임 선택, 요소 선택(토큰 보기·값 보기), 긴 토큰 이름·긴 값, 상속된 값, 체인 툴팁, 출처 라벨 툴팁, 행 포커스, 복사 직후, 복사 실패, Attributes 그룹, 좁은 창의 비활성 Show inspector, 헤더 Show 버튼 두 개와 안 읽음 점, 프로토타입 창 대화 버튼.
   - 정할 것: 보기 전환의 모양과 자리, 선택 대상 이름의 자리, 출처 라벨 모양과 툴팁 문구, 로딩 지연 값, 빈·실패·복사 실패·비활성 툴팁 문구, `sliders-horizontal`이 사이드바 Settings 아이콘(`ShellSidebar.tsx`)과 혼동되지 않는지.
   - 검증: `doan check --repo .`와 `doan ls --repo .`에 오류가 없다. 사용자가 앱에서 초안을 확인한다.
   - 커밋 경계: `docs(design): canvas-inspector panel draft`

2a. **리졸버 복원.** `app/src/main/inspect.ts`·`inspect.test.ts`·`inspect.fixture.json`을 `67c222f71~1`에서 그대로 되살린다. 지금의 lint 규칙(예: 제거 뒤 켜진 `no-unnecessary-condition`, `ed1b7b772`)에 걸리는 곳만 동작을 바꾸지 않고 고친다.
   - 검증: `npm --prefix app test`(복원한 테스트 green), `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - 커밋 경계: `refactor(app): restore the CDP style resolver`

2b. **테스트 먼저(`/tdd`).** 새 순수 함수는 시그니처만 둔 stub으로 두고, 다음 테스트가 import 실패가 아니라 단언 실패로 red인지 확인한다. 파일과 함수는 design.md '순수 함수로 뺄 것' 표를 따른다.
   - `inspectRows`: 그룹 6개(`layout`·`box`·`typography`·`colors`·`radius`·`shadow`), Layout 행은 flex·grid일 때만, `grid-template-columns` 출처, Attributes 행·`cap`·32개 상한.
   - `panelBounds`(reserved)·`canvasPanelsLayout`: 960(사이드바 보임·숨김)·1140·1280·1470·1512 창, 대화 접힘, 인스펙터 접힘, 대화 먼저 계산, `inspectorFits`, 저장 폭이 최대보다 큰 경우, 넓은 창에서 저장한 뒤 창을 줄인 경우.
   - `parseInspectorState`: 빠짐 → 닫힘·토큰 보기, `open`이 boolean이 아님, 음수·NaN·상한 초과 폭, 알 수 없는 `view`.
   - `rowDisplay`·`rowCopyText`·`rowKey`: 토큰 있음(`--name` 복사), Hardcoded·Unknown source·Default(값 복사), 값 보기, 상속, 체인 툴팁, 견본 가드(hex·transparent만).
   - `inspectRequestFor`: 인스펙터 닫힘·좁은 창·선택 없음이면 요청 안 함, 받아들이지 않은 선택으로는 요청 안 함, 보이게 될 때 한 번, 같은 선택 재요청(reload, Retry) 구분, 읽는 중 Hide는 응답 버림.
   - `acceptInspect`: 늦은 seq·다른 선택 키·다른 캔버스 거부, `not-found`는 빈 상태, `not-shown`은 실패 없이 재요청, `unavailable`은 실패+Retry, 같은 선택 재요청은 이전 행 유지.
   - `headerShowButtons`: 둘 다 열림(버튼·구분선 없음), 하나만 접힘, 둘 다 접힘(순서), 좁은 창(Show inspector 비활성).
   - `parseInspectRequest`: 새 `{selector, canvas, seq}` 형태, 셀렉터 캡, 잘못된 캔버스.
   - 검증: `npm --prefix app test`에서 새 테스트는 단언 실패로 red, 2a의 테스트는 green이다.
   - 커밋 경계: `test(app): pin the canvas inspector's rows, widths and stale responses`

3. **순수 함수 구현.**
   - 검증: 2b의 테스트가 통과한다(`npm --prefix app test`). `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.
   - 커밋 경계: `feat(app): resolve inspector rows and panel widths`

4. **main: 세션 API, 수집기, IPC.**
   - `windowDebugger.ts`에 `sessionOf(frameId)`를 더한다. `windowDebugger.test.ts`: 현재 소유 세션을 돌려줌, 교체된 OOPIF 세션은 null, 분리된 세션은 null, 디버거 detach 뒤 재attach.
   - `inspector.ts`를 되살려 `sessionOf`와 `shownDocument`로 세션을 고르게 한다. `inspector.test.ts`에서 살릴 테스트(예전 65–233행: 요청 파싱, 행 생성, DOM/CSS on/off, 직렬 큐, 2초 예산, fail closed, `inheritedFrom`, 재attach)만 되살리고 고친다. 세션 추적 테스트(예전 246–373행)는 되살리지 않는다. 추가: 요청한 `{root, path}`와 보이는 문서가 다르면 `not-shown`, 노드가 없으면 `not-found`, 디버거가 없거나 시간을 넘기면 `unavailable`이고 다음 요청에서 재attach.
   - `inspect:get` 등록, `senderAllowed.ts`에 다시 넣기, preload `inspect`. 테스트: main 창이 아닌 sender는 거절.
   - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - 커밋 경계: `feat(app): read inspector values through the window debugger`

5. **renderer: 셸, 패널, 헤더.**
   - 네 번째 그리드 열과 보조 규칙(design.md '그리드'), 인스펙터 열과 핸들, 좁은 창 처리, 대화 폭 규칙 갱신.
   - 헤더 Show 버튼 두 개(`data-panel-target`, 아이콘), 패널별 포커스 복귀, 안 읽음 점 배지(캔버스 헤더와 프로토타입 창), 프로토타입 창 대화 버튼 아이콘.
   - 패널 상태(빈·읽는 중·재읽기·실패·값), 보기 전환, 행 목록 키보드(roving, Enter·Space·⌘C), 행 안 복사 피드백과 sr status, Esc가 선택을 한 단계 뒤로, ui-state 저장.
   - 테스트: CanvasHeader(버튼·순서·배지·포커스 셀렉터), 패널 상태 전이, CanvasController와 인스펙터 요청(늦은 응답은 실제 컨트롤러 콜백이 끝난 것을 확인한 뒤 단언, postmortem 2026-10-25 UX C), ui-state 왕복, 프로토타입 창 대화 버튼.
   - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - 커밋 경계: `feat(app): show the canvas inspector beside the conversation`

6. **`/design-sync`와 `/runtime-test`.** 실제 앱에서 두 초안(`canvas-inspector-layout` 셸, `canvas-inspector-panel` 패널)과 computed style을 맞춘다. 다음을 확인한다.
   - 960·1140·1280·1470 창에서 여닫기·리사이즈·좁은 창 양보, 넓은 창에서 폭을 저장한 뒤 창을 줄였을 때, 앱 재시작과 캔버스 전환 뒤 열림·폭·보기 유지.
   - 토큰을 쓰는 요소, 하드코딩된 요소, 토큰 CSS가 없는 프로젝트(전부 Hardcoded/Default), CSP가 있는 캔버스, 프레임 선택과 요소 선택, 긴 토큰 이름·긴 값의 말줄임, 복사.
   - reload 중 행 유지, 선택 소실 뒤 빈 상태, 캔버스 전환.
   - 인스펙터가 닫혀 있거나 좁은 창일 때 `inspect:get`이 오지 않는지.
   - 늦은 응답이 덮지 않는 것은 실앱에서 결정적으로 만들 수 없으므로 2b·5의 단위 테스트를 근거로 삼고, 실앱에서는 빠르게 선택을 바꾸며 관찰만 한다.
   - 검증: 측정값이 `docs/design/canvas.md`('Panel width' 960 값 포함)와 `docs/DESIGN.md` 색인에 기록된다. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
   - 커밋 경계: `/design-sync`가 고친 코드는 `fix(app): …`로 따로, 측정 기록은 `docs(design): measure the canvas inspector`

7. **문서 승격과 정리.** 문서마다 따로 커밋한다.
   - PRODUCT: §3 In scope 1, §5 item 4(인스펙터 규칙), §5 item 2 'Canvas header'·'Conversation panel'(폭, 좁은 창)·'Prototype window'(아이콘, 안 읽음 점), §5 item 0 'Text edit menu'(인스펙터 행 복사).
   - ARCHITECTURE: §3 'Selection'(수집기, `inspect:get`, 늦은 응답), 'Window debugger'(`sessionOf`), 'Resolver limits'·'CDP collector', 주입 스크립트 문단.
   - README features 표에 인스펙터를 더할지 판단해 필요하면 `.doan/canvases/readme-features.html`에서 이미지를 다시 뽑는다.
   - `docs/features/canvas-inspector/`를 지운다.
   - 검증: `grep -n "There is no Inspector" docs/PRODUCT.md`가 비어 있다. `docs/features/canvas-inspector/`가 없다.
   - 커밋 경계: `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, (필요하면) `docs(README): …`, `docs(feature): remove canvas-inspector`
