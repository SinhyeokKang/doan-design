# 캔버스 인스펙터 — tasks

0. **레이아웃 초안.** (2026-11-18 완료: `.doan/canvases/canvas-inspector-layout.html`, `b781e5681`, 사용자 확정)

1. **`/design-draft` — 패널 내부.** 새 캔버스 `.doan/canvases/canvas-inspector-panel.html`에 인스펙터 패널을 그린다. 레이아웃 초안의 창(`.doan/assets/canvas-page-snapshot.css`)을 그대로 쓰고, 패널 안만 새로 그린다.
   - 상태: 선택 없음, 읽는 중, 실패(Retry), 프레임 선택, 요소 선택(토큰 보기·값 보기), 긴 토큰 이름·긴 값, 상속된 값, 체인 툴팁, 복사 직후, 헤더 Show 버튼 두 개와 안 읽음 점 배지.
   - 정할 것: 보기 전환의 모양과 자리, 선택 대상 이름의 자리, 출처 라벨 모양, 로딩 지연 값, 실패·빈 상태 문구.
   - 검증: `doan check --repo .`와 `doan ls --repo .`에 오류가 없다. 사용자가 앱에서 초안을 확인한다.
   - 커밋 경계: `docs(design): canvas-inspector panel draft`

2. **테스트 먼저(`/tdd`).** `inspect.ts`·`inspect.test.ts`·`inspect.fixture.json`을 `67c222f71~1`에서 되살리고(기존 테스트는 green), 새 순수 함수는 시그니처만 둔 stub으로 테스트를 단언 실패로 red 만든다.
   - `resolveInspect`: Layout 행, Radius/Shadow 분리, `data-doan-*` 행.
   - `inspectorWidth` / `conversationWidth`: 1280·1470·1512 창, 사이드바 숨김, 서로 열림·닫힘, 저장 폭이 최대보다 큰 경우.
   - `parseInspectorState`, `rowDisplay`, `acceptInspect`, `headerShowButtons`, `parseInspectRequest`.
   - 검증: `npm --prefix app test`에서 복원한 테스트는 통과하고 새 테스트는 단언 실패로 red다.
   - 커밋 경계: `test(app): pin the canvas inspector's resolver, widths and stale responses`

3. **순수 함수 구현.**
   - 검증: 2의 테스트가 통과한다(`npm --prefix app test`). `npm --prefix app run typecheck`가 통과한다.
   - 커밋 경계: `feat(app): resolve inspector rows and panel widths`

4. **main: 수집기와 IPC.** `inspector.ts`를 `windowDebugger.ts` 위로 다시 붙이고(`inspector.test.ts` 복원·수정), `inspect:get`과 preload `inspect`를 더한다. 요청에 캔버스 정체성을 싣고, 보이는 문서가 다르면 실패로 답한다.
   - 검증: `npm --prefix app test`(inspector·windowDebugger·sender 가드 테스트), `npm --prefix app run typecheck`.
   - 커밋 경계: `feat(app): read inspector values through the window debugger`

5. **renderer: 셸과 패널.** 네 번째 그리드 열, 인스펙터 열과 핸들, 헤더 Show 버튼 두 개와 아이콘, 안 읽음 점 배지, 패널 상태(빈·읽는 중·실패·값), 보기 전환, 행 복사, ui-state 저장. 출시된 대화 패널의 폭 규칙도 인스펙터 폭을 반영하게 바꾼다.
   - 검증: `npm --prefix app test`(CanvasHeader, 셸 폭, 패널 상태, ui-state 테스트), `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - 커밋 경계: `feat(app): show the canvas inspector beside the conversation`

6. **`/design-sync`와 `/runtime-test`.** 실제 앱에서 두 초안(`canvas-inspector-layout` 셸, `canvas-inspector-panel` 패널)과 computed style을 맞춘다. 다음도 확인한다.
   - 1280·1470 창에서 여닫기와 리사이즈, 앱 재시작 뒤 열림·폭·보기 유지.
   - 토큰을 쓰는 요소와 하드코딩된 요소의 행, 복사, 선택을 빠르게 바꿀 때 늦은 응답이 덮지 않는지, reload와 캔버스 전환.
   - 인스펙터가 닫혀 있을 때 `inspect:get`이 오지 않는지.
   - 검증: 측정값이 `docs/design/canvas.md`에 기록된다. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
   - 커밋 경계: `docs(design): measure the canvas inspector`

7. **문서 승격과 정리.** PRODUCT(§3 In scope 1, §5 item 2 'Conversation panel' 폭·헤더 버튼, §5 item 4 인스펙터 규칙)와 ARCHITECTURE(§3 'Selection'의 수집기, `inspect:get`, 늦은 응답, 'Resolver limits')를 현재 규칙으로 고쳐 쓰고, `docs/features/canvas-inspector/`를 지운다.
   - 검증: `grep -n "There is no Inspector" docs/PRODUCT.md`가 비어 있다. `docs/features/canvas-inspector/`가 없다.
   - 커밋 경계: 문서마다 하나씩 — `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(feature): remove canvas-inspector`
